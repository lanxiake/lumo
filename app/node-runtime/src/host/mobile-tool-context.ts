/**
 * mobile-tool-context — 移动端受限 ToolExecutionContext
 *
 * host-kit assembleTools 需要一个 ToolExecutionContext 注入平台能力。移动端
 * 是儿童安全环境，禁止 shell / 任意文件读写 / glob / grep（规范 §4.3）。
 * 因此这些能力一律抛错——即便某工具意外绕过白名单尝试调用，也会在此被拦。
 *
 * 移动端允许的平台能力仅：
 *  - fetch：HTTP 请求（web_fetch / web_search 工具用，域名 allowlist 由服务端托管）
 *  - getSkills：技能列表（skill_list / skill_search 用）
 *  - askUserQuestion：结构化提问（ask_user_question 用，经 bridge 往返 RN）
 *
 * ToolExecutionContext 不得持有 provider secrets（规范 §3.6）。
 */

import type {
  ToolExecutionContext,
  AskUserQuestionContextInput,
  AskUserQuestionContextResult,
} from "@lumo/agent-runtime";
import type { SkillInfo } from "@lumo/agent-runtime";
import type { CreationMeta, ImageProviderConfig, MobileNodeEvent } from "../bridge/schema.js";

/** 当前正在编辑的游戏目标（edit_creation 期间由 bridge 设置） */
export interface EditTarget {
  readonly gameId: string;
  readonly title: string;
  readonly html: string;
}

/** 扩展 ToolExecutionContext，增加 App Action 工具向 RN 发事件的能力 */
export interface MobileToolExecutionContext extends ToolExecutionContext {
  emit: (event: MobileNodeEvent) => void;
  gatewayUrl: string;
  getAuthToken: () => Promise<string>;
  getDeviceId: () => string | undefined;
  /** 生图提供商配置（存在则生图直连 OpenAI 兼容图像端点；缺省回退 gateway） */
  imageProviderConfig?: ImageProviderConfig;
  /** HTTP fetch 原始实现（测试注入用） */
  fetchImpl?: typeof fetch;
  /** 当前轮的中断信号（abort 命令触发）；长任务工具（生图/写游戏）据此可中断。 */
  getAbortSignal?: () => AbortSignal | undefined;
  /** 系统日志写入（工具诊断用，如生图失败错误码）；不记敏感原文/密钥。 */
  log?: (msg: string) => void;
  /** 已有创作元信息（含内置游戏），供 list_my_creations 复用感知 */
  listCreations: () => readonly CreationMeta[];
  /** 当前编辑目标（get_edit_target 读取原始 html），无则 null */
  getEditTarget: () => EditTarget | null;
  /** 正在后台生成中的游戏标题（list_my_creations 回报真实进度），无则 null */
  getPendingPlayground: () => string | null;
  /** 请求孩子确认活动（confirm_activity），经 bridge 往返 RN，返回是否同意 */
  requestConfirm: (kind: "game" | "drawing", title: string) => Promise<boolean>;
  /**
   * 后台异步生成互动页面：主 Agent 不再自己吐大段 HTML，只派发规格立即返回。
   * bridge 侧另起一次性 LLM 调用生成 HTML → 安全检查 → emit playground_open，
   * 完成/报错时以系统消息通知主 Agent 开口告知小主人。缺省（测试）视为不支持。
   */
  generatePlayground?: (spec: {
    type: "game" | "effect" | "interactive";
    title: string;
    description: string;
    /** 触发本次生成的工具调用 id，供生成结束后补发 tool_finished 终态卡片 */
    toolCallId?: string;
  }) => void;
}

/** 移动端工具上下文的依赖注入 */
export interface MobileToolContextDeps {
  readonly sessionId: string;
  readonly petId: string;
  readonly deviceId: string;
  readonly platform: string;
  readonly appVersion: string;
  /** 网关基础 URL（HTTPS，规范 §5.4） */
  readonly gatewayUrl: string;
  /** 从安全存储读取 JWT（SecureStore/Keychain） */
  readonly getAuthToken: () => Promise<string>;
  /** 生图提供商配置（存在则生图直连；缺省回退 gateway） */
  readonly imageProviderConfig?: ImageProviderConfig;
  /** 工具审计写入（规范 §4.4；不记录敏感原文/JWT/API Key） */
  readonly logToolAudit?: (row: {
    toolName: string;
    resultSummary: string;
    isError: boolean;
  }) => void;
  /** 技能列表供给（skill_list/skill_search 用），未注入则空 */
  readonly getSkills?: () => readonly SkillInfo[];
  /** 结构化提问（ask_user_question 用），经 bridge 往返 RN */
  readonly askUserQuestion?: (
    input: AskUserQuestionContextInput,
  ) => Promise<AskUserQuestionContextResult>;
  /** HTTP fetch（缺省用全局 fetch；域名 allowlist 由服务端托管） */
  readonly fetchImpl?: typeof fetch;
  /** 当前轮中断信号供给（abort 命令触发）；缺省无中断能力 */
  readonly getAbortSignal?: () => AbortSignal | undefined;
  /** 系统日志写入（工具诊断用）；缺省不记录 */
  readonly log?: (msg: string) => void;
  /** 向 RN 发送事件（App Action 工具用） */
  readonly emit: (event: MobileNodeEvent) => void;
  /** 已有创作元信息供给（list_my_creations 用），缺省返回空 */
  readonly listCreations?: () => readonly CreationMeta[];
  /** 当前编辑目标供给（get_edit_target 用），缺省 null */
  readonly getEditTarget?: () => EditTarget | null;
  /** 后台生成中的游戏标题供给（list_my_creations 用），缺省 null */
  readonly getPendingPlayground?: () => string | null;
  /** 确认活动往返（confirm_activity 用），缺省视为同意（无家长在场时不阻塞） */
  readonly requestConfirm?: (kind: "game" | "drawing", title: string) => Promise<boolean>;
  /** 后台异步生成互动页面（缺省不支持，工具回退同步路径或报错） */
  readonly generatePlayground?: (spec: {
    type: "game" | "effect" | "interactive";
    title: string;
    description: string;
    toolCallId?: string;
  }) => void;
}

/** 禁用能力统一抛错（防绕过白名单调用高危工具） */
function forbidden(capability: string): never {
  throw new Error(`[mobile-tool-context] 移动端禁止使用 ${capability}（儿童安全边界）`);
}

/**
 * 创建移动端受限 ToolExecutionContext。
 *
 * shell / file / glob / grep 一律抛错；仅暴露 fetch / getSkills / askUserQuestion。
 */
export function createMobileToolContext(deps: MobileToolContextDeps): MobileToolExecutionContext {
  const doFetch = deps.fetchImpl ?? fetch;

  return {
    // ── 受限工作目录（移动端无真实文件系统访问） ──
    getCwd: () => `/kids-mobile/${deps.sessionId}`,

    // ── 禁用能力（规范 §4.3） ──
    executeCommand: async () => forbidden("executeCommand/shell"),
    readFile: async () => forbidden("readFile"),
    writeFile: async () => forbidden("writeFile"),
    glob: async () => forbidden("glob"),
    grep: async () => forbidden("grep"),

    // ── 允许能力 ──
    fetch: async (url, opts) => {
      const res = await doFetch(url, opts);
      const body = await res.text();
      return { status: res.status, body };
    },

    // ── App Action 事件发射 ──
    emit: deps.emit,

    // ── 资源复用 / 编辑 / 确认（creations/confirm/edit 工具用） ──
    listCreations: () => deps.listCreations?.() ?? [],
    getEditTarget: () => deps.getEditTarget?.() ?? null,
    getPendingPlayground: () => deps.getPendingPlayground?.() ?? null,
    requestConfirm: (kind, title) =>
      deps.requestConfirm ? deps.requestConfirm(kind, title) : Promise.resolve(true),
    ...(deps.generatePlayground ? { generatePlayground: deps.generatePlayground } : {}),

    // ── 生图依赖（image_generate 工具用）：有 imageProviderConfig 走 direct，否则 gateway ──
    gatewayUrl: deps.gatewayUrl,
    getAuthToken: deps.getAuthToken,
    getDeviceId: () => deps.deviceId !== "unknown" ? deps.deviceId : undefined,
    ...(deps.imageProviderConfig ? { imageProviderConfig: deps.imageProviderConfig } : {}),
    fetchImpl: deps.fetchImpl,
    ...(deps.getAbortSignal ? { getAbortSignal: deps.getAbortSignal } : {}),
    ...(deps.log ? { log: deps.log } : {}),

    ...(deps.getSkills ? { getSkills: deps.getSkills } : {}),
    ...(deps.askUserQuestion ? { askUserQuestion: deps.askUserQuestion } : {}),
  };
}
