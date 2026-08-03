/**
 * mobile-image-tool — 移动端经 Gateway 生成图片
 *
 * 复用 @lumo/agent-runtime 的 ImageGenerateParams schema，但 execute 改为：
 *  1. 包装儿童安全 prompt；
 *  2. 经 Gateway POST /v1/image/generate 同步生图；
 *  3. 将结果以 data URI 形式通过 image_ready 事件 emit 给 RN。
 *
 * 移动端不保存文件到本地文件系统，避免文件路径跨平台差异和儿童隐私暴露。
 */

import { Type, type Static } from "@sinclair/typebox";
import {
  type MtBotToolConfig,
  type AgentToolResult,
  type ToolExecutionContext,
} from "@lumo/agent-runtime";
import type { MobileToolExecutionContext } from "../host/mobile-tool-context.js";
import type { ImageProviderKind, MobileNodeEvent } from "../bridge/schema.js";

const CHILD_SAFE_IMAGE_PREFIX =
  "Create a rich, detailed, professional-quality illustration for a 3-8 year old child. " +
  "Use warm vivid colors, clear composition, and expressive storybook-style detail with a " +
  "well-structured scene (distinct foreground subject and supporting background). A few short, " +
  "simple words or labels drawn in the picture are allowed when they help tell the story. " +
  "Keep it cute, friendly and non-scary — no violence, adult themes, watermarks, or personal information. ";

/** Gateway 生图响应体 */
interface GatewayImageGenerateResponse {
  imageBase64: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  revisedPrompt: string;
}

/** 统一生图结果：url 可直接给 RN <Image>（data URI 或 http 链接皆可） */
interface DirectImageResult {
  url: string;
  width: number;
  height: number;
  revisedPrompt: string;
  effectiveModelId: string;
}

/** Gateway 生图错误体 */
interface GatewayImageErrorBody {
  code?: string;
  message?: string;
  error?: { message?: string };
}

const GATEWAY_IMAGE_FETCH_TIMEOUT_MS = 11 * 60 * 1000;
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_SIZE = 1024;

function buildGatewayImageGenerateUrl(gatewayUrl: string): string {
  const root = gatewayUrl.replace(/\/+$/, "");
  return `${root}/v1/image/generate`;
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 6 * 60 * 1000;

/** 统一 fetch + 超时包装，抛出儿童友好错误。 */
async function fetchJson(
  url: string,
  init: RequestInit,
  doFetch: typeof fetch,
  timeoutMs = GATEWAY_IMAGE_FETCH_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; body: string; json: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  let resp: Response;
  try {
    resp = await doFetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const isAbort = (err as Error).name === "AbortError";
    throw Object.assign(
      new Error(isAbort ? "画画被中断了，我们再试一次吧" : "网络有点挤，画作没传过来"),
      { code: isAbort ? "ABORTED" : "PROVIDER_NETWORK_ERROR" },
    );
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
  const body = await resp.text();
  let json: unknown = {};
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    json = {};
  }
  return { ok: resp.ok, status: resp.status, body, json };
}

function throwProviderError(status: number, body: string, json: unknown): never {
  const e = json as GatewayImageErrorBody;
  const message = e.error?.message ?? e.message ?? body.slice(0, 300) ?? `画画服务出了点问题 (${status})`;
  throw Object.assign(new Error(message), { code: e.code ?? "PROVIDER_ERROR" });
}

/** OpenAI 兼容图像端点：POST {baseUrl}/images/generations（baseUrl 已含 /v1）。 */
function buildOpenAiImageUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/images/generations`;
}

/** Right Code 站点级任务查询地址：由 baseUrl 推站点根（去掉 /draw... 段）+ /v1/tasks/{id}。 */
function buildTaskQueryUrl(baseUrl: string, taskId: string): string {
  const root = baseUrl.trim().replace(/\/+$/, "");
  const site = root.replace(/\/draw(\/.*)?$/i, "");
  return `${site}/v1/tasks/${taskId}`;
}

/** 从 Images 形状（data[].b64_json|url）或 Gemini 形状（candidates[].content.parts[].inline_data）取图。 */
function extractImageFromResult(json: unknown, prompt: string, model: string): DirectImageResult {
  const images = json as { data?: ReadonlyArray<{ b64_json?: string; url?: string; revised_prompt?: string }> };
  const first = images.data?.[0];
  if (first?.b64_json?.trim()) {
    return { url: `data:image/png;base64,${first.b64_json}`, width: DEFAULT_SIZE, height: DEFAULT_SIZE, revisedPrompt: first.revised_prompt ?? prompt, effectiveModelId: model };
  }
  if (first?.url?.trim()) {
    return { url: first.url, width: DEFAULT_SIZE, height: DEFAULT_SIZE, revisedPrompt: first.revised_prompt ?? prompt, effectiveModelId: model };
  }
  const gem = json as { candidates?: ReadonlyArray<{ content?: { parts?: ReadonlyArray<{ inline_data?: { mime_type?: string; data?: string }; inlineData?: { mimeType?: string; data?: string } }> } }> };
  for (const part of gem.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inline_data ?? part.inlineData;
    const data = inline?.data;
    if (data?.trim()) {
      const mime = (inline as { mime_type?: string; mimeType?: string }).mime_type ?? (inline as { mimeType?: string }).mimeType ?? "image/png";
      return { url: `data:${mime};base64,${data}`, width: DEFAULT_SIZE, height: DEFAULT_SIZE, revisedPrompt: prompt, effectiveModelId: model };
    }
  }
  throw Object.assign(new Error("画作数据是空的，再试一次吧"), { code: "PROVIDER_ERROR" });
}

/** 任务是否画完：接受多种拼写；也用「已带图数据」兜底（供应商不回标准 status 时）。 */
function pollResultReady(json: unknown): boolean {
  const s = String((json as { status?: string; state?: string }).status ?? (json as { state?: string }).state ?? "").toLowerCase();
  if (s === "completed" || s === "complete" || s === "succeeded" || s === "success" || s === "done" || s === "finished") return true;
  // status 缺失/非标准：只要能取到图就算完成（避免死等到 180s 超时）。
  const j = json as { data?: ReadonlyArray<{ b64_json?: string; url?: string }>; candidates?: unknown };
  if (j.data?.[0]?.b64_json?.trim() || j.data?.[0]?.url?.trim() || j.candidates) return true;
  return false;
}

/** 轮询 Right Code 异步任务直到完成/失败；返回结果 JSON（Images 或 Gemini 形状）。signal 可中断。 */
async function pollTask(baseUrl: string, apiKey: string, taskId: string, doFetch: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const url = buildTaskQueryUrl(baseUrl, taskId);
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw Object.assign(new Error("画画被中断了，我们再试一次吧"), { code: "ABORTED" });
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { ok, status, body, json } = await fetchJson(url, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }, doFetch, 30_000, signal);
    if (!ok) throwProviderError(status, body, json);
    const s = String((json as { status?: string }).status ?? "").toLowerCase();
    if (s === "failed" || s === "error") {
      const msg = (json as { error?: { message?: string } }).error?.message ?? "画画没成功";
      throw Object.assign(new Error(msg), { code: "PROVIDER_ERROR" });
    }
    if (pollResultReady(json)) return json;
  }
  throw Object.assign(new Error("画画等太久啦，再试一次吧"), { code: "TIMEOUT" });
}

/**
 * 直连上游生图（独立运行模式，凭据本地持有不出进程）。
 * openai：同步 b64_json/url；rightcode：异步 Images + 轮询；gemini：异步 generateContent + 轮询。
 */
async function generateImageViaDirect(options: {
  provider: ImageProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  width?: number;
  height?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<DirectImageResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const signal = options.signal;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` };
  const root = options.baseUrl.trim().replace(/\/+$/, "");

  if (options.provider === "gemini") {
    const url = `${root}/v1beta/models/${options.model}:generateContent`;
    const { ok, status, body, json } = await fetchJson(url, {
      method: "POST", headers,
      body: JSON.stringify({ async: true, contents: [{ role: "user", parts: [{ text: options.prompt }] }] }),
    }, doFetch, GATEWAY_IMAGE_FETCH_TIMEOUT_MS, signal);
    if (!ok) throwProviderError(status, body, json);
    const taskId = (json as { task_id?: string }).task_id;
    const result = taskId ? await pollTask(options.baseUrl, options.apiKey, taskId, doFetch, signal) : json;
    return extractImageFromResult(result, options.prompt, options.model);
  }

  // openai + rightcode 都走 Images 形状；rightcode 带 async:true 返回 task_id 后轮询。
  const size = `${options.width ?? DEFAULT_SIZE}x${options.height ?? DEFAULT_SIZE}`;
  const isAsync = options.provider === "rightcode";
  const reqBody: Record<string, unknown> = { model: options.model, prompt: options.prompt, n: 1, size };
  if (isAsync) reqBody.async = true;
  else reqBody.response_format = "b64_json";

  // Right Code Images 端点为 {baseUrl:.../draw}/v1/images/generations；OpenAI 的 baseUrl 已含 /v1。
  const imageUrl = isAsync ? `${root}/v1/images/generations` : buildOpenAiImageUrl(options.baseUrl);
  const { ok, status, body, json } = await fetchJson(imageUrl, {
    method: "POST", headers, body: JSON.stringify(reqBody),
  }, doFetch, GATEWAY_IMAGE_FETCH_TIMEOUT_MS, signal);
  if (!ok) throwProviderError(status, body, json);

  const taskId = (json as { task_id?: string }).task_id;
  const result = taskId ? await pollTask(options.baseUrl, options.apiKey, taskId, doFetch, signal) : json;
  return extractImageFromResult(result, options.prompt, options.model);
}

function wrapChildSafePrompt(userPrompt: string): string {
  return `${CHILD_SAFE_IMAGE_PREFIX}Requested subject: ${userPrompt}`;
}

async function generateImageViaGateway(options: {
  gatewayUrl: string;
  getAuthToken: () => Promise<string>;
  getDeviceId: () => string | undefined;
  prompt: string;
  modelId: string;
  width?: number;
  height?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<GatewayImageGenerateResponse & { effectiveModelId: string }> {
  const token = await options.getAuthToken();
  if (!token.trim()) {
    throw Object.assign(new Error("需要登录才能画画哦，请让爸爸妈妈帮忙完成设备配对"), {
      code: "AUTH_REQUIRED",
    });
  }

  const url = buildGatewayImageGenerateUrl(options.gatewayUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_IMAGE_FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", onAbort, { once: true });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const deviceId = options.getDeviceId?.();
  if (deviceId) {
    headers["X-Device-Id"] = deviceId;
  }

  const doFetch = options.fetchImpl ?? fetch;

  let resp: Response;
  try {
    resp = await doFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: options.prompt,
        modelId: options.modelId,
        width: options.width ?? DEFAULT_SIZE,
        height: options.height ?? DEFAULT_SIZE,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = (err as Error).name === "AbortError";
    throw Object.assign(
      new Error(isAbort ? "画画被中断了，我们再试一次吧" : "网络有点挤，画作没传过来"),
      { code: isAbort ? "ABORTED" : "GATEWAY_NETWORK_ERROR" },
    );
  } finally {
    clearTimeout(timeout);
    if (options.signal) options.signal.removeEventListener("abort", onAbort);
  }

  const bodyText = await resp.text();
  let parsed: unknown = {};
  try {
    parsed = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    parsed = {};
  }

  if (!resp.ok) {
    const errBody = parsed as GatewayImageErrorBody;
    const message =
      errBody.message ?? errBody.error?.message ?? bodyText.slice(0, 300) ?? `画画服务出了点问题 (${resp.status})`;
    throw Object.assign(new Error(message), {
      code: errBody.code ?? "PROVIDER_ERROR",
    });
  }

  const data = parsed as GatewayImageGenerateResponse;
  if (!data.imageBase64?.trim()) {
    throw Object.assign(new Error("画作数据是空的，再试一次吧"), { code: "PROVIDER_ERROR" });
  }

  return { ...data, effectiveModelId: options.modelId };
}

/** 复用内置 schema，但 description 更贴合儿童场景 */
const MobileImageGenerateParams = Type.Object({
  prompt: Type.String({
    description: "孩子想要的画面描述。请把画面描述得生动、色彩明亮、适合儿童。",
  }),
  filename: Type.Optional(
    Type.String({
      description: "图片文件名（不含扩展名），仅用于日志和展示，不传则自动生成。",
    }),
  ),
  width: Type.Optional(Type.Number({ description: "图片宽度，默认 1024。" })),
  height: Type.Optional(Type.Number({ description: "图片高度，默认 1024。" })),
});

type MobileImageGenerateInput = Static<typeof MobileImageGenerateParams>;

export interface MobileImageGenerateResult {
  url: string;
  filename?: string;
  width: number;
  height: number;
  model: string;
  revisedPrompt: string;
}

export const mobileImageGenerateToolConfig: MtBotToolConfig<typeof MobileImageGenerateParams> = {
  name: "image_generate",
  label: "画一幅画",
  description:
    "根据孩子的描述画一幅温暖、可爱、色彩明亮的儿童插画。" +
    "画好后会自动显示在画廊里。不要询问孩子，直接调用并语音告诉 TA 你在画什么。",
  parameters: MobileImageGenerateParams,
  category: "channel",
  isReadOnly: false,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    params: MobileImageGenerateInput,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<MobileImageGenerateResult | null>> => {
    const mobileContext = context as MobileToolExecutionContext;

    const prompt = wrapChildSafePrompt(params.prompt);
    const imageConfig = mobileContext.imageProviderConfig;
    // 有生图 provider 配置：直连（独立运行模式）；否则回退 gateway（需登录）。
    // 模型恒由用户配置决定，不接受 LLM 覆盖（否则会画错模型）。
    const modelId = imageConfig?.model ?? DEFAULT_IMAGE_MODEL;
    mobileContext.log?.(`[image_generate] provider=${imageConfig?.provider ?? "gateway"} model=${modelId}`);

    try {
      // 统一成 { url, width, height, revisedPrompt, effectiveModelId }：direct 已是此形状，
      // gateway 回 base64 需转 data URI。
      const signal = mobileContext.getAbortSignal?.();
      const data: DirectImageResult = imageConfig
        ? await generateImageViaDirect({
            provider: imageConfig.provider ?? "openai",
            baseUrl: imageConfig.baseUrl,
            apiKey: imageConfig.apiKey,
            model: modelId,
            prompt,
            width: params.width,
            height: params.height,
            fetchImpl: mobileContext.fetchImpl,
            ...(signal ? { signal } : {}),
          })
        : await (async () => {
            const g = await generateImageViaGateway({
              gatewayUrl: mobileContext.gatewayUrl,
              getAuthToken: mobileContext.getAuthToken,
              getDeviceId: mobileContext.getDeviceId,
              prompt,
              modelId,
              width: params.width,
              height: params.height,
              fetchImpl: mobileContext.fetchImpl,
              ...(signal ? { signal } : {}),
            });
            return {
              url: `data:${g.mimeType};base64,${g.imageBase64}`,
              width: g.width,
              height: g.height,
              revisedPrompt: g.revisedPrompt,
              effectiveModelId: g.effectiveModelId,
            };
          })();

      const event: MobileNodeEvent = {
        type: "image_ready",
        payload: { url: data.url, prompt: params.prompt },
      };
      mobileContext.emit(event);

      const result: MobileImageGenerateResult = {
        url: data.url,
        filename: params.filename,
        width: data.width,
        height: data.height,
        model: data.effectiveModelId,
        revisedPrompt: data.revisedPrompt,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "画画失败了";
      const code = (err as { code?: string }).code ?? "UNKNOWN";
      mobileContext.log?.(`[image_generate] 失败 code=${code} model=${modelId} msg=${message}`);
      throw new Error(message);
    }
  },
};
