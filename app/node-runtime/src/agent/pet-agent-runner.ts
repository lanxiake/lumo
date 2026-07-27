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
import { loadPetAgentDefinition } from "./pet-agent-loader.js";
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
  };
}
