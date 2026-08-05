/**
 * pet-agent-runner — 宠物 Agent 运行时装配（复用 host-kit assembleAgent）
 *
 * 串起 6 个移动端 Provider + host-kit assembleAgent，产出可运行的会话 Agent
 * （计划 §4.4）。严格遵守规范 §1.2：不 fork Agent loop，只做宿主装配。
 *
 * 流程：
 *   loadPetAgentDefinition → buildMobileToolRegistry（第一层过滤）
 *     → assembleAgent（内部 filterToolsByDefinition 第二层过滤 + 权限闸门）
 *     → 输入安全检查 → instance.prompt
 *
 * MVP 单会话，不引入 orchestrator / 子 Agent。
 */

import {
  AgentRegistry,
  PermissionMemory,
  assembleAgent,
  type AgentInstance,
  type ConfigProvider,
  type EventSink,
  type PermissionProvider,
  type PromptContextProvider,
  type StreamFnFactory,
  type ToolExecutionContext,
  type AssembleAgentRuntime,
} from "@lumo/agent-runtime";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import { loadPetAgentDefinition, hardenForMobile } from "./pet-agent-loader.js";
import { PLAYGROUND_AGENT_DEF } from "./playground-agent-def.js";
import { createMobileSummaryGenerator } from "./mobile-summary-generator.js";
import { buildMobileToolRegistry } from "../tools/mobile-tool-registry.js";
import { checkInputSafety, type SafetyCheckResult } from "../safety/input-safety.js";
import type { ChildProfile } from "../bridge/schema.js";
import type { MobilePromptContextHandle } from "../host/mobile-prompt-context-provider.js";
import type { AssembledSystemPrompt } from "@lumo/agent-runtime";

/** 单个宠物会话运行时依赖（6 Provider + 运行时句柄） */
export interface PetSessionDeps {
  readonly agentId: string;
  readonly sessionKey: string;
  readonly userId?: string;
  readonly config: ConfigProvider;
  readonly eventSink: EventSink;
  readonly permission: PermissionProvider;
  readonly promptContext: PromptContextProvider;
  readonly streamFnFactory: StreamFnFactory;
  readonly toolContext: ToolExecutionContext;
  /** 共享运行时句柄（跨会话单例） */
  readonly registry: AgentRegistry;
  readonly permissionMemory: PermissionMemory;
  /** 脱敏日志（走 stderr，不污染 bridge） */
  readonly log?: (msg: string) => void;
}

/** 一个就绪的宠物会话 */
export interface PetSession {
  readonly instanceId: string;
  /** 发送儿童消息（先经输入安全检查，命中则不进 Agent） */
  prompt(text: string): Promise<PromptResult>;
  abort(): void;
  dispose(): void;
  /**
   * 热更新小主人档案并刷新系统提示词（不拆会话）。
   * 若 promptContext 不支持 setChildProfile，则静默跳过。
   */
  updateChildProfile(profile: ChildProfile): void;
  /** 当前系统提示词（热更新断言 / 诊断用） */
  getSystemPrompt(): string;
  /**
   * 一次性后台文本生成：复用捕获的 innerStream + model 直调 LLM，产出纯文本。
   * 不进主 Agent 循环、不出对话记录，供 create_web_playground 异步生成 HTML 用
   * （主对话不再被大段 HTML 阻塞）。signal 可中断。
   */
  generateText(prompt: string, signal?: AbortSignal): Promise<string>;
}

/** prompt 结果：安全放行 or 被拦截 */
export type PromptResult =
  | { readonly status: "sent" }
  | { readonly status: "blocked"; readonly safety: SafetyCheckResult };

/** 窄化带 setChildProfile 的移动端 PromptContext */
function asMobilePromptHandle(
  pc: PromptContextProvider,
): MobilePromptContextHandle | null {
  const candidate = pc as MobilePromptContextHandle;
  if (typeof candidate.setChildProfile === "function" && typeof candidate.getSoulContentLive === "function") {
    return candidate;
  }
  return null;
}

/**
 * 装配一个宠物会话 Agent（复用 host-kit）。
 */
export async function createPetSession(deps: PetSessionDeps): Promise<PetSession> {
  const def = loadPetAgentDefinition(deps.agentId);
  const tools = buildMobileToolRegistry(deps.toolContext);

  // wrapStreamFn 捕获工厂产出的 innerStream，供上下文压缩摘要复用（携带 JWT/deviceId）。
  // 移动端无 per-session 换模需求，直接透传，仅做捕获。
  let capturedInnerStream: StreamFn | null = null;

  const runtime: AssembleAgentRuntime = {
    registry: deps.registry,
    permissionMemory: deps.permissionMemory,
    osInfo: "kids-mobile",
    runtimeInfo: { agentId: def.id, host: "kids-mobile", channel: "kids-mobile" },
    // 桌面向的长段落（工具选择优先级、三段式进度汇报、自我学习、安全长版）与
    // 「2-4 句 ≤60 汉字儿童口语」直接冲突，会冲淡儿童提示词的动手指令。
    promptDetail: "compact",
    isSubAgent: false,
    // 保持 contextWindow 缺省（AgentInstance 默认 1M）；只补齐摘要生成器，
    // 让压缩产出「LLM 摘要 + 最近 6 轮（DEFAULT_KEEP_RECENT_TURNS）」而非占位丢弃。
    wrapStreamFn: (inner) => {
      capturedInnerStream = inner;
      return inner;
    },
    // 惰性摘要生成器：压缩时才求值，此时 capturedInnerStream 已由 wrapStreamFn 赋值。
    generateSummary: async (msgs, prompt, signal) => {
      if (!capturedInnerStream) {
        throw new Error("[createPetSession] innerStream 尚未就绪，无法生成摘要");
      }
      return createMobileSummaryGenerator(capturedInnerStream, res.resolved.model)(
        msgs,
        prompt,
        signal,
      );
    },
    toolLogger: deps.log
      ? {
          log: (...args: unknown[]) => deps.log?.(args.map(String).join(" ")),
          error: (...args: unknown[]) => deps.log?.(args.map(String).join(" ")),
        }
      : undefined,
  };

  const res = await assembleAgent(
    {
      definition: def,
      sessionKey: deps.sessionKey,
      userId: deps.userId,
      config: deps.config,
      eventSink: deps.eventSink,
      permission: deps.permission,
      promptContext: deps.promptContext,
      streamFnFactory: deps.streamFnFactory,
      tools,
      toolContext: deps.toolContext,
    },
    runtime,
  );

  const instance: AgentInstance = res.instance;
  // assembleAgent 运行时返回 prompt，类型声明未导出时做窄化
  const assembledPrompt = (res as { prompt?: AssembledSystemPrompt }).prompt;
  const promptHandle = asMobilePromptHandle(deps.promptContext);

  // 后台 HTML 生成专用子 Agent（独立实例，惰性装配、跨调用复用）：
  // 复用同一套 Provider，但用独立定义（HTML 专家 prompt、无工具、单轮），
  // 且 eventSink 用 noop 避免污染主对话 UI 流。
  let htmlBuilder: AgentInstance | null = null;
  let htmlBuilderPromise: Promise<AgentInstance> | null = null;
  async function getHtmlBuilder(): Promise<AgentInstance> {
    if (htmlBuilder) return htmlBuilder;
    if (htmlBuilderPromise) return htmlBuilderPromise;
    htmlBuilderPromise = (async () => {
      const built = await assembleAgent(
        {
          definition: hardenForMobile(PLAYGROUND_AGENT_DEF),
          sessionKey: `${deps.sessionKey}:playground`,
          userId: deps.userId,
          config: deps.config,
          eventSink: { emit: () => {} },
          permission: deps.permission,
          promptContext: deps.promptContext,
          streamFnFactory: deps.streamFnFactory,
          // 无工具：HTML 生成是纯文本产出，挂主 Agent 工具集只会干扰、诱发工具调用。
          tools: [],
          toolContext: deps.toolContext,
        },
        { registry: deps.registry, permissionMemory: deps.permissionMemory, osInfo: "kids-mobile", isSubAgent: true },
      );
      // 用纯 playground 提示词覆盖 assembleSystemPrompt 套上的主 Agent 脚手架
      // （三段式汇报 / task_complete / NO_REPLY 会把「只吐 HTML」的专注指令冲淡，
      //  导致模型把游戏写进 thinking、最终 text 输出块几乎为空 → 被判「内容过短」）。
      built.instance.setSystemPrompt(PLAYGROUND_AGENT_DEF.systemPrompt ?? "");
      htmlBuilder = built.instance;
      return htmlBuilder;
    })();
    return htmlBuilderPromise;
  }

  return {
    instanceId: res.instanceId,
    async prompt(text: string): Promise<PromptResult> {
      // 输入安全检查：命中则不进 Agent（规范 §5.2）
      const safety = checkInputSafety(text);
      if (!safety.safe) {
        return { status: "blocked", safety };
      }
      // 每轮对话前用最新 soul 刷新系统提示（家长改记忆后无需拆会话即可生效）
      if (assembledPrompt && promptHandle) {
        instance.setSystemPrompt(assembledPrompt.buildPrompt().fullPrompt);
      }
      await instance.prompt(text);
      return { status: "sent" };
    },
    abort() {
      instance.abort();
    },
    dispose() {
      htmlBuilder?.destroy();
      htmlBuilder = null;
      htmlBuilderPromise = null;
      res.dispose();
    },
    updateChildProfile(profile: ChildProfile): void {
      if (!promptHandle) {
        deps.log?.("[createPetSession] promptContext 不支持热更新档案，跳过");
        return;
      }
      promptHandle.setChildProfile(profile);
      if (assembledPrompt) {
        instance.setSystemPrompt(assembledPrompt.buildPrompt().fullPrompt);
      }
      deps.log?.(
        `[createPetSession] 已热更新小主人档案 keys=${Object.keys(profile).join(",") || "(empty)"}`,
      );
    },
    getSystemPrompt(): string {
      return instance.getSystemPrompt();
    },
    async generateText(prompt: string, signal?: AbortSignal): Promise<string> {
      // 走独立 HTML 生成子 Agent（专用 system prompt、无对话人格干扰）。
      const builder = await getHtmlBuilder();
      if (signal?.aborted) return "";
      const onAbort = () => builder.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        builder.clearMessages();
        await builder.prompt(prompt);
        const msgs = builder.messages;
        const text = extractLastAssistantText(msgs);
        deps.log?.(
          `[generateText] msgs=${msgs.length} roles=[${msgs.map((m) => m.role).join(",")}] ` +
            `lastAssistantLen=${text.length} ` +
            `contentTypes=[${msgs.filter((m) => m.role === "assistant").map((m) => (typeof m.content === "string" ? "str" : Array.isArray(m.content) ? `arr:${(m.content as unknown[]).map((p) => (p && typeof p === "object" && "type" in p ? String((p as { type: unknown }).type) : "?")).join("+")}` : typeof m.content)).join(";")}]`,
        );
        return text;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/** 从消息历史里取最后一条 assistant 文本（content 可能是 string 或分段数组）。 */
function extractLastAssistantText(messages: readonly { role: string; content: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    const c = m.content;
    if (typeof c === "string") return c.trim();
    if (Array.isArray(c)) {
      const text = c
        .map((part) =>
          part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : "",
        )
        .join("")
        .trim();
      if (text) return text;
      // 回退：deepseek-flash 偶发把整份 HTML 写进 thinking(reasoning_content)、text 块留空
      //（lastAssistantLen=0 contentTypes=[arr:thinking]）。此时从 thinking 里捞，后续
      // extractHtmlBlock 会从散文中切出 HTML 区段。
      return c
        .map((part) =>
          part && typeof part === "object" && "thinking" in part
            ? String((part as { thinking: unknown }).thinking)
            : "",
        )
        .join("")
        .trim();
    }
  }
  return "";
}
