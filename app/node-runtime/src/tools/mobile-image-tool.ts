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
import type { MobileNodeEvent } from "../bridge/schema.js";

const CHILD_SAFE_IMAGE_PREFIX =
  "Create a cheerful, age-appropriate illustration for a 3-8 year old child. " +
  "The image must be warm, cute, colorful, non-scary, and free of text, watermarks, violence, " +
  "adult themes, or any personal information. ";

/** Gateway 生图响应体 */
interface GatewayImageGenerateResponse {
  imageBase64: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  revisedPrompt: string;
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

/** OpenAI 兼容图像端点：POST {baseUrl}/images/generations（baseUrl 已含 /v1）。 */
function buildOpenAiImageUrl(baseUrl: string): string {
  const root = baseUrl.trim().replace(/\/+$/, "");
  return `${root}/images/generations`;
}

/**
 * 直连 OpenAI 兼容图像端点生图（独立运行模式，凭据本地持有不出进程）。
 * 请求 b64_json 回传，转 data URI 供 RN 直接展示。
 */
async function generateImageViaDirect(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  width?: number;
  height?: number;
  fetchImpl?: typeof fetch;
}): Promise<GatewayImageGenerateResponse & { effectiveModelId: string }> {
  const url = buildOpenAiImageUrl(options.baseUrl);
  const size = `${options.width ?? DEFAULT_SIZE}x${options.height ?? DEFAULT_SIZE}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_IMAGE_FETCH_TIMEOUT_MS);
  const doFetch = options.fetchImpl ?? fetch;

  let resp: Response;
  try {
    resp = await doFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        n: 1,
        size,
        response_format: "b64_json",
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = (err as Error).name === "AbortError";
    throw Object.assign(
      new Error(isAbort ? "画画被中断了，我们再试一次吧" : "网络有点挤，画作没传过来"),
      { code: isAbort ? "ABORTED" : "PROVIDER_NETWORK_ERROR" },
    );
  } finally {
    clearTimeout(timeout);
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
      errBody.error?.message ?? errBody.message ?? bodyText.slice(0, 300) ?? `画画服务出了点问题 (${resp.status})`;
    throw Object.assign(new Error(message), { code: errBody.code ?? "PROVIDER_ERROR" });
  }

  const data = parsed as { data?: ReadonlyArray<{ b64_json?: string; revised_prompt?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64?.trim()) {
    throw Object.assign(new Error("画作数据是空的，再试一次吧"), { code: "PROVIDER_ERROR" });
  }

  return {
    imageBase64: b64,
    mimeType: "image/png",
    width: options.width ?? DEFAULT_SIZE,
    height: options.height ?? DEFAULT_SIZE,
    revisedPrompt: data.data?.[0]?.revised_prompt ?? options.prompt,
    effectiveModelId: options.model,
  };
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
  modelId: Type.Optional(
    Type.String({
      description: "生图模型 id，可选；默认 gpt-image-2。",
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

    // 工具层强制确认门控：画画前必须经孩子确认，不依赖 AI 提示词自觉。
    const approved = await mobileContext.requestConfirm("drawing", params.prompt);
    if (!approved) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: "declined" }) }],
        details: null,
      };
    }

    const prompt = wrapChildSafePrompt(params.prompt);
    const imageConfig = mobileContext.imageProviderConfig;
    // 有生图 provider 配置：直连（独立运行模式）；否则回退 gateway（需登录）。
    const modelId = params.modelId ?? imageConfig?.model ?? DEFAULT_IMAGE_MODEL;

    try {
      const data = imageConfig
        ? await generateImageViaDirect({
            baseUrl: imageConfig.baseUrl,
            apiKey: imageConfig.apiKey,
            model: modelId,
            prompt,
            width: params.width,
            height: params.height,
            fetchImpl: mobileContext.fetchImpl,
          })
        : await generateImageViaGateway({
            gatewayUrl: mobileContext.gatewayUrl,
            getAuthToken: mobileContext.getAuthToken,
            getDeviceId: mobileContext.getDeviceId,
            prompt,
            modelId,
            width: params.width,
            height: params.height,
            fetchImpl: mobileContext.fetchImpl,
          });

      const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;
      const event: MobileNodeEvent = {
        type: "image_ready",
        payload: { url: dataUrl, prompt: params.prompt },
      };
      mobileContext.emit(event);

      const result: MobileImageGenerateResult = {
        url: dataUrl,
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
      throw new Error(message);
    }
  },
};
