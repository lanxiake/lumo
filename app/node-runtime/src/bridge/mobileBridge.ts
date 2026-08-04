/**
 * mobileBridge — Node 侧 bridge 消息处理中枢
 *
 * 接收 RN 发来的 MobileNodeCommand，路由到会话管理；把 Agent 事件经
 * MobileNodeEvent 发回 RN（计划 §4.2）。transport 无关（便于单测）：
 * 真实 transport（nodejs-mobile channel）由 index.ts 注入 emit。
 *
 * 权限交互：MVP 全部工具直接放行（见 mobile-permission-provider），无家长确认往返。
 */

import { AgentRegistry, PermissionMemory, type StreamFnFactory } from "@lumo/agent-runtime";
import { stripVirtualHumanTags } from "@lumo/core";
import type { CreationMeta, ImageProviderConfig, MobileNodeCommand, MobileNodeEvent, ProviderConfig } from "./schema.js";
import type { EditTarget } from "../host/mobile-tool-context.js";
import { createPetSession, type PetSession } from "../agent/pet-agent-runner.js";
import { createMobileEventSink } from "../host/mobile-event-sink.js";
import { createMobileConfigProvider } from "../host/mobile-config-provider.js";
import { createMobilePromptContextProvider } from "../host/mobile-prompt-context-provider.js";
import { createMobilePermissionProvider } from "../host/mobile-permission-provider.js";
import { createMobileStreamFnFactory } from "../host/mobile-stream-fn-factory.js";
import { createMobileToolContext } from "../host/mobile-tool-context.js";
import { childSafeErrorMessage } from "../safety/child-safe-response.js";
import { createMobileTts, type MobileTts } from "../host/mobile-tts.js";
import { checkPlaygroundHtmlSafety, extractHtmlBlock, validatePlaygroundContent, wrapPlaygroundHtml } from "../tools/playground-html.js";
import type { SystemLogBuffer } from "../perf/system-logs.js";

/** bridge 的宿主环境依赖（安全存储 / 网关 / 平台信息，由 index.ts 注入） */
export interface MobileBridgeDeps {
  /** 事件外发（nodejs-mobile channel post → RN） */
  readonly emit: (event: MobileNodeEvent) => void;
  /** 网关 HTTP 基础 URL（静态）。与 getGatewayUrl 二选一，后者优先（支持运行时更新） */
  readonly gatewayUrl?: string;
  /** 网关 URL 动态取值（RN 经 _auth 更新后即时生效）；缺省回退 gatewayUrl */
  readonly getGatewayUrl?: () => string;
  /** 从安全存储读 JWT */
  readonly getAuthToken: () => Promise<string>;
  /** 从设备绑定状态读 deviceId */
  readonly getDeviceId: () => string | undefined;
  /** 平台（ios/android） */
  readonly platform: string;
  /** App 版本 */
  readonly appVersion: string;
  /** 宠物人格描述来源（按 petId 解析） */
  readonly resolvePetPersona: (petId: string) => string;
  /** 模型专属表情/动作标签说明（按 petId 解析） */
  readonly resolvePetPersonaAddon?: (petId: string) => string | undefined;
  /** 脱敏日志（走 stderr） */
  readonly log?: (msg: string) => void;
  /** 用户配置的模型提供商动态取值（RN 经 _auth 更新后即时生效）；缺省回退 gateway */
  readonly getProviderConfig?: () => ProviderConfig | undefined;
  /** 生图提供商动态取值（RN 经 _auth 更新后即时生效）；缺省生图回退 gateway */
  readonly getImageProviderConfig?: () => ImageProviderConfig | undefined;
  /** streamFn 工厂覆盖（测试注入 fake；缺省用真实 direct/gateway 工厂） */
  readonly streamFnFactoryOverride?: StreamFnFactory;
  /** TTS 合成器覆盖（测试注入 fake；缺省用本地 Edge TTS） */
  readonly ttsOverride?: MobileTts;
  /** 是否启用 TTS（缺省启用；mock/联调可关） */
  readonly ttsEnabled?: boolean;
  /** 系统日志缓冲（deps.log 已 tee 入此）；提供时响应 get_system_logs */
  readonly systemLog?: SystemLogBuffer;
}

/**
 * 创建 bridge：返回一个 handle，暴露 handleCommand（RN → Node）。
 */
export function createMobileBridge(deps: MobileBridgeDeps) {
  const registry = new AgentRegistry();
  const permissionMemory = new PermissionMemory();

  /** 取当前网关 URL：优先动态 getter（RN 运行时更新），回退静态 gatewayUrl */
  const resolveGatewayUrl = (): string => deps.getGatewayUrl?.() ?? deps.gatewayUrl ?? "";

  // 本地 Edge TTS（客户端直连，不走 Gateway）。缺省启用，可经 ttsEnabled=false 关闭。
  const ttsEnabled = deps.ttsEnabled !== false;
  const tts: MobileTts | undefined = ttsEnabled
    ? (deps.ttsOverride ?? createMobileTts(deps.log ? { log: deps.log, timeoutMs: 15_000 } : { timeoutMs: 15_000 }))
    : undefined;

  /**
   * 过滤 TTS 文本中的 Markdown / 特殊符号及虚拟人标签，避免朗读下划线、星号、反引号、
   * 表情/动作标签等。保留中文、英文、数字和常见标点；连续空白合并为一个空格。
   */
  function sanitizeTtsText(text: string): string {
    return stripVirtualHumanTags(text)
      .replace(/[*_`#~(){}<>|]/g, " ")
      .replace(/!\[.*?\]\(.*?\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 合成并外发 TTS 音频。不阻塞 final 文本（先出字后出声）；失败降级为
   * agent_error(tts_error)，不影响已展示的文本，也不崩宿主。
   * abort / 新一轮发送会递增 ttsEpoch，使进行中的合成结果作废。
   *
   * @param turn 本次对话的耗时对象（存在时 TTS 成功后 finalize）
   */
  async function synthesizeAndEmit(text: string, turn?: TurnTiming): Promise<void> {
    if (!tts) {
      if (turn) finalizeCurrentTurn("complete", turn);
      return;
    }
    const ttsText = sanitizeTtsText(text);
    if (!ttsText) {
      if (turn) finalizeCurrentTurn("complete", turn);
      return;
    }
    const epochAtStart = turn?.ttsEpoch ?? ttsEpoch;
    // 轮内后续段（currentTurn 已被首段 finalize 置空）回退到稳定的轮级 gen，而非 0，
    // 否则 RN 侧 shouldPlayTts 会误判过期丢弃，导致工具后半段无声。
    const generationId = turn?.generationId ?? currentTurnGenerationId;
    try {
      deps.log?.(`[tts] 开始合成 ${ttsText.length} 字 gen=${generationId} epoch=${epochAtStart}`);
      const result = await tts.synthesize(ttsText);
      // 合成期间若已 abort / 新一轮发送，丢弃迟到音频
      if (epochAtStart !== ttsEpoch) {
        deps.log?.(`[tts] 丢弃过期合成 gen=${generationId} epoch=${epochAtStart} current=${ttsEpoch}`);
        if (turn) finalizeCurrentTurn("abort", turn);
        return;
      }
      if (result) {
        deps.emit({
          type: "tts_audio",
          payload: {
            audioBase64: result.audioBase64,
            mimeType: result.mimeType,
            generationId,
          },
        });
        if (turn) {
          turn.ttsEmitAt = Date.now();
          finalizeCurrentTurn("complete", turn);
        }
      } else if (turn) {
        finalizeCurrentTurn("complete", turn);
      }
    } catch (err) {
      if (epochAtStart !== ttsEpoch) {
        if (turn) finalizeCurrentTurn("abort", turn);
        return;
      }
      if (turn) finalizeCurrentTurn("error", turn);
      const message = err instanceof Error ? err.message : String(err);
      deps.log?.(`[tts] 合成失败: ${message} (文本长度 ${ttsText.length})`);
      deps.emit({ type: "tts_failed", payload: { code: "tts_error", message } });
    }
  }

  /**
   * 游戏/互动页面 TTS 朗读（speak_text_raw）。独立于对话 TTS：
   *  - 不参与 ttsEpoch / generationId 门控（游戏朗读与打断无关，不该被丢弃）；
   *  - 产物走 game_tts_audio 事件，RN 侧直接播放、不驱动宠物状态机。
   * 失败静默（仅日志）：游戏朗读失败不该弹儿童错误提示或打断游戏。
   */
  async function synthesizeGameTts(text: string, requestId?: string): Promise<void> {
    if (!tts) return;
    const ttsText = sanitizeTtsText(text);
    if (!ttsText) return;
    try {
      deps.log?.(`[tts] 游戏朗读合成 ${ttsText.length} 字 req=${requestId ?? "-"}`);
      const result = await tts.synthesize(ttsText);
      if (result) {
        deps.emit({
          type: "game_tts_audio",
          payload: {
            audioBase64: result.audioBase64,
            mimeType: result.mimeType,
            ...(requestId ? { requestId } : {}),
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log?.(`[tts] 游戏朗读合成失败: ${message} (文本长度 ${ttsText.length})`);
    }
  }

  // 单会话 MVP：一个活跃 session。
  let session: PetSession | undefined;
  let sessionId: string | undefined;
  /** 递增以作废进行中的 TTS 合成（abort / reset / 新一轮发送） */
  let ttsEpoch = 0;
  /** 当前轮中断控制器：长任务工具（生图/写游戏）监听其 signal，abort/reset/新一轮发送时触发。 */
  let turnAbort: AbortController | undefined;
  /**
   * 后台建游戏专用中断控制器：生命周期 = 会话，仅在 reset_session/dispose 时中断。
   * 不随「新一轮发送/打断（含回声误打断）」作废——建游戏一次要几十秒到几分钟，
   * 期间小主人必然会继续说话或被自身 TTS 回声误触发打断，若绑到 turnAbort/ttsEpoch
   * 会几乎必然被丢弃，表现为「说了要做但游戏永远不出现」。
   */
  let bgGenAbort: AbortController | undefined;
  /** 正在后台生成中的游戏标题（供 list_my_creations 回报真实进度）；无则 null */
  let pendingPlaygroundTitle: string | null = null;

  // ── 资源复用 / 确认 / 编辑 的会话内状态 ──
  /** RN 同步来的已有创作元信息（供 list_my_creations 复用感知） */
  let knownCreations: readonly CreationMeta[] = [];
  /** 待回应的确认请求：requestId → resolver（confirm_activity 往返） */
  const pendingConfirms = new Map<string, (approved: boolean) => void>();
  /** 当前编辑目标（edit_creation 期间设置，供 get_edit_target 读取） */
  let editTarget: EditTarget | null = null;
  /** edit_creation 时携带，使随后一轮生成的 playground_open 就地替换该 gameId */
  let editReplaceId: string | null = null;

  /**
   * 事件外发包装：编辑态下给 playground_open 注入 replaceId（就地更新同一游戏），
   * 并在注入后清空一次性的 editReplaceId / editTarget（编辑完成）。其余事件透传。
   */
  function emitEvent(event: MobileNodeEvent): void {
    if (event.type === "playground_open" && editReplaceId) {
      const patched: MobileNodeEvent = {
        type: "playground_open",
        payload: { ...event.payload, replaceId: editReplaceId },
      };
      editReplaceId = null;
      editTarget = null;
      deps.emit(patched);
      return;
    }
    deps.emit(event);
  }

  /**
   * 发起确认请求：emit confirm_request 给 RN，等待 confirm_response 回传。
   * 30 秒无回应默认视为拒绝（避免 Agent 永久挂起）。
   */
  function requestConfirm(kind: "game" | "drawing", title: string): Promise<boolean> {
    const requestId = `confirm-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        if (pendingConfirms.delete(requestId)) {
          deps.log?.(`[mobileBridge] 确认超时默认拒绝 requestId=${requestId}`);
          resolve(false);
        }
      }, 30_000);
      pendingConfirms.set(requestId, (approved) => {
        clearTimeout(timer);
        resolve(approved);
      });
      emitEvent({ type: "confirm_request", payload: { requestId, kind, title } });
    });
  }

  /** 构造后台生成互动页面 HTML 的提示词。格式/安全约束由 playground-builder 子 Agent 的 system prompt 承载，这里只给内容。 */
  function buildPlaygroundPrompt(spec: { type: string; title: string; description: string }): string {
    return `标题：${spec.title}\n类型：${spec.type}\n玩法/内容：${spec.description}`;
  }


  /**
   * 后台异步生成互动页面：不阻塞主对话轮。生成完成后 emit playground_open 打开游戏，
   * 并把结果以一条系统提示消息投喂主 Agent（经命令队列串行化），让宠物开口告知小主人。
   */
  function generatePlaygroundBackground(spec: {
    type: "game" | "effect" | "interactive";
    title: string;
    description: string;
    toolCallId?: string;
  }): void {
    const sess = session;
    if (!sess) return;
    // 生成结束后补发工具终态卡片（对应本轮立即返回的 status:"generating"，
    // event-sink 已跳过其 tool_finished，改由这里按 toolCallId 落终态）。
    const finishTool = (ok: boolean) => {
      if (pendingPlaygroundTitle === spec.title) pendingPlaygroundTitle = null;
      if (!spec.toolCallId) return;
      emitEvent({
        type: "tool_finished",
        payload: { toolName: "create_web_playground", toolCallId: spec.toolCallId, ok },
      });
    };
    pendingPlaygroundTitle = spec.title;
    bgGenAbort ??= new AbortController();
    const abortAtStart = bgGenAbort;
    deps.log?.(`[mobileBridge] 后台生成互动页面 title=${spec.title} type=${spec.type}`);
    const isStale = () => session !== sess || abortAtStart.signal.aborted;
    void (async () => {
      try {
        const prompt = buildPlaygroundPrompt(spec);
        let html = "";
        let lastReason = "empty";
        // 工程化校验：安全 + 内容非空/有结构/有交互。不合格重试一次（子 Agent 单轮，偶发空壳）。
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const raw = await sess.generateText(prompt, abortAtStart.signal);
          if (isStale()) {
            deps.log?.(`[mobileBridge] 丢弃过期的后台生成 title=${spec.title}`);
            finishTool(false);
            return;
          }
          deps.log?.(`[mobileBridge] 生成原文 title=${spec.title} len=${raw.length} head=${JSON.stringify(raw.slice(0, 120))}`);
          const candidate = extractHtmlBlock(raw);
          const safety = checkPlaygroundHtmlSafety(candidate);
          const content = validatePlaygroundContent(candidate);
          if (safety.safe && content.valid) {
            html = candidate;
            break;
          }
          lastReason = !safety.safe ? (safety.reason ?? "unsafe") : (content.reason ?? "invalid");
          deps.log?.(`[mobileBridge] 生成校验未过(第${attempt + 1}次) title=${spec.title}: ${lastReason}`);
        }
        if (!html) {
          deps.log?.(`[mobileBridge] 后台生成最终失败 title=${spec.title}: ${lastReason}`);
          finishTool(false);
          // 直接给用户可见提示：不单靠主 Agent 二次生成（那条可能被 abort/不触发 TTS，表现为「没反馈」）。
          emitEvent({ type: "show_toast", payload: { text: `《${spec.title}》没做成功，待会儿再试试~`, style: "hint" } });
          void handleCommand({
            type: "send_user_message",
            payload: { text: `（系统提示）刚才想做的《${spec.title}》没做成功，请用一句温柔的话告诉小主人待会儿再试试，然后换个话题继续陪 TA 聊。`, sessionId: sessionId ?? "" },
          });
          return;
        }
        emitEvent({ type: "playground_open", payload: { type: spec.type, title: spec.title, html: wrapPlaygroundHtml(html) } });
        finishTool(true);
        void handleCommand({
          type: "send_user_message",
          payload: { text: `（系统提示）《${spec.title}》已经做好并打开了，请用一句开心的话告诉小主人可以开始玩了。`, sessionId: sessionId ?? "" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.log?.(`[mobileBridge] 后台生成失败 title=${spec.title}: ${message}`);
        finishTool(false);
        if (session !== sess || abortAtStart.signal.aborted) return;
        emitEvent({ type: "show_toast", payload: { text: `《${spec.title}》没做成功，待会儿再试试~`, style: "hint" } });
        void handleCommand({
          type: "send_user_message",
          payload: { text: `（系统提示）刚才想做的《${spec.title}》没做成功，请用一句温柔的话告诉小主人待会儿再试试。`, sessionId: sessionId ?? "" },
        });
      }
    })();
  }

  /** 单次对话耗时打点 */
  interface TurnTiming {
    readonly turnId: string;
    readonly userSendAt: number;
    /** RN 传入的 generation，回传给 tts_audio */
    readonly generationId: number;
    /** 发送时的 ttsEpoch 快照 */
    readonly ttsEpoch: number;
    llmRequestAt?: number;
    firstTokenAt?: number;
    firstDeltaAt?: number;
    finalTextAt?: number;
    ttsEmitAt?: number;
    finalized?: boolean;
  }
  let currentTurn: TurnTiming | undefined;
  /**
   * 当前轮的 TTS 身份（generationId / epoch），生命周期 = 一次用户发送，跨多段有效。
   * currentTurn 在首段合成完成后会被 finalize 置空（它只记录耗时），但一次发送里
   * Agent 中途调用工具会产生「工具前 + 工具后」多段 agent_final → 多段 TTS 合成。
   * 若后续段回退到 currentTurn?.generationId ?? 0，RN 侧 shouldPlayTts(0) 会判定过期
   * 丢弃 → 表现为「只播了前半段，工具后无声」。故用独立的稳定字段承载轮级身份。
   */
  let currentTurnGenerationId = 0;

  /** 作废进行中的 TTS（abort / reset） */
  function invalidatePendingTts(): void {
    ttsEpoch += 1;
  }

  function logTurnTiming(turn: TurnTiming, reason: "complete" | "abort" | "error"): void {
    const sid = sessionId ?? "unknown";
    const userSendAt = turn.userSendAt;
    const llmRequestAt = turn.llmRequestAt;
    const firstTokenAt = turn.firstTokenAt;
    const finalTextAt = turn.finalTextAt;
    const ttsEmitAt = turn.ttsEmitAt;
    const ttfbMs = llmRequestAt != null && firstTokenAt != null ? firstTokenAt - llmRequestAt : undefined;
    const generationMs = firstTokenAt != null && finalTextAt != null ? finalTextAt - firstTokenAt : undefined;
    const e2eMs = ttsEmitAt != null ? ttsEmitAt - userSendAt : finalTextAt != null ? finalTextAt - userSendAt : undefined;
    const ttsLatencyMs = finalTextAt != null && ttsEmitAt != null ? ttsEmitAt - finalTextAt : undefined;
    deps.log?.(
      JSON.stringify({
        type: "turn_timing",
        sessionId: sid,
        turnId: turn.turnId,
        reason,
        userSendAt,
        llmRequestAt,
        firstTokenAt,
        firstDeltaAt: turn.firstDeltaAt,
        finalTextAt,
        ttsEmitAt,
        ttfbMs,
        generationMs,
        e2eMs,
        ttsLatencyMs,
      }),
    );
  }

  function finalizeCurrentTurn(
    reason: "complete" | "abort" | "error",
    turn: TurnTiming | undefined = currentTurn,
  ): void {
    if (!turn || turn.finalized) return;
    turn.finalized = true;
    logTurnTiming(turn, reason);
    if (currentTurn === turn) {
      currentTurn = undefined;
    }
  }

  /** 家长确认交互：MVP 不需要，P1 可恢复 */
  // const parentApproval: ParentApproval = { ... };

  async function handleInit(payload: Extract<MobileNodeCommand, { type: "init" }>["payload"]) {
    deps.log?.(`[handleInit] 收到 init, petId=${payload.petId} agentId=${payload.agentId}`);
    // 销毁旧会话，并立即置空，避免 re-init 异步窗口内并发命令打到已 dispose 的实例。
    session?.dispose();
    session = undefined;
    sessionId = undefined;
    bgGenAbort?.abort();
    bgGenAbort = undefined;

    const newSessionId = `sess-${Date.now()}`;
    const gatewayUrl = resolveGatewayUrl();
    const providerConfig = deps.getProviderConfig?.();
    const imageProviderConfig = deps.getImageProviderConfig?.();
    deps.log?.(
      `[handleInit] provider=${providerConfig ? `${providerConfig.protocol}:${providerConfig.model}` : "(none, gateway fallback)"}`,
    );
    try {
      const toolContext = createMobileToolContext({
        sessionId: newSessionId,
        petId: payload.petId,
        deviceId: deps.getDeviceId() ?? "unknown",
        platform: deps.platform,
        appVersion: deps.appVersion,
        gatewayUrl,
        getAuthToken: deps.getAuthToken,
        ...(imageProviderConfig ? { imageProviderConfig } : {}),
        emit: emitEvent,
        listCreations: () => knownCreations,
        getEditTarget: () => editTarget,
        getPendingPlayground: () => pendingPlaygroundTitle,
        requestConfirm: (kind, title) => requestConfirm(kind, title),
        getAbortSignal: () => turnAbort?.signal,
        ...(deps.log ? { log: deps.log } : {}),
        generatePlayground: (spec) => generatePlaygroundBackground(spec),
        logToolAudit: (row) =>
          deps.log?.(`[tool-audit] ${row.toolName} err=${row.isError} ${row.resultSummary}`),
      });

      session = await createPetSession({
        agentId: payload.agentId,
        sessionKey: payload.sessionKey,
        config: createMobileConfigProvider({
          ...(payload.modelTier ? { defaultPurpose: payload.modelTier } : {}),
          ...(providerConfig ? { providerConfig } : {}),
        }),
        eventSink: createMobileEventSink({
          emit: deps.emit,
          onSafetyBlock: (category) => deps.log?.(`[safety] blocked category=${category}`),
          onFirstDelta: () => {
            if (currentTurn) currentTurn.firstDeltaAt = Date.now();
          },
          // final 文本（经输出安全检查后）触发本地 TTS 合成。不阻塞文本外发：
          // EventSink 已先 emit agent_final，这里 fire-and-forget 合成后补发 tts_audio。
          onFinalText: (text) => {
            const turn = currentTurn;
            if (turn) turn.finalTextAt = Date.now();
            deps.log?.(`[mobileBridge] Agent 最终回复: ${text}`);
            void synthesizeAndEmit(text, turn);
          },
        }),
        permission: createMobilePermissionProvider(),
        promptContext: createMobilePromptContextProvider({
          petPersona: deps.resolvePetPersona(payload.petId),
          ...(payload.petName ? { petName: payload.petName } : {}),
          personaAddon: deps.resolvePetPersonaAddon?.(payload.petId),
          ...(payload.childNickname ? { childNickname: payload.childNickname } : {}),
          // 始终注入档案（含空对象），避免条件展开导致「有记忆却未进 soul」
          childProfile: payload.childProfile ?? {},
          platform: `kids-mobile/${deps.platform}`,
        }),
        streamFnFactory:
          deps.streamFnFactoryOverride ??
          createMobileStreamFnFactory({
            gatewayUrl,
            getAuthToken: deps.getAuthToken,
            getDeviceId: deps.getDeviceId,
            ...(providerConfig ? { providerConfig } : {}),
            petId: payload.petId,
            platform: deps.platform,
            appVersion: deps.appVersion,
            onLlmRequestStart: () => {
              if (currentTurn) currentTurn.llmRequestAt = Date.now();
            },
            onLlmFirstToken: () => {
              if (currentTurn) currentTurn.firstTokenAt = Date.now();
            },
            ...(deps.log ? { log: deps.log } : {}),
          }),
        toolContext,
        registry,
        permissionMemory,
        ...(deps.log ? { log: deps.log } : {}),
      });
      sessionId = newSessionId;
      const profileKeys = Object.keys(payload.childProfile ?? {});
      const soulPreview = session.getSystemPrompt().includes("你已经了解到关于小主人的信息")
        ? "hasChildSection"
        : session.getSystemPrompt().includes("目前还不太了解小主人")
          ? "unknownChild"
          : "noChildMarker";
      deps.emit({ type: "init_done", payload: { sessionId: newSessionId, instanceId: session.instanceId } });
      deps.log?.(
        `[handleInit] 会话初始化成功 sessionId=${newSessionId} profileKeys=${profileKeys.join(",") || "(empty)"} soul=${soulPreview}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log?.(`[handleInit] 会话初始化失败: ${message}`);
      // 失败时保持 session 为空，避免半初始化状态被后续消息命中。
      session = undefined;
      sessionId = undefined;
      deps.emit({ type: "agent_error", payload: { message: childSafeErrorMessage("agent_error"), code: "init_failed" } });
    }
  }

  async function handleSendUserMessage(text: string, generationId = 0) {
    if (!session) {
      deps.emit({ type: "agent_error", payload: { message: childSafeErrorMessage("agent_error") } });
      return;
    }
    // 新一轮发送作废上一轮未完成的 TTS，并重置轮级中断控制器（作废上一轮迟到的长任务）。
    invalidatePendingTts();
    turnAbort?.abort();
    turnAbort = new AbortController();
    deps.log?.(`[mobileBridge] 用户发送: ${text} gen=${generationId}`);
    // 轮级 TTS 身份：跨本轮所有分段（工具前/后）稳定，供 finalize 置空 currentTurn 后的段回退。
    currentTurnGenerationId = generationId;
    currentTurn = {
      turnId: `turn-${Date.now()}`,
      userSendAt: Date.now(),
      generationId,
      ttsEpoch,
    };
    try {
      const result = await session.prompt(text);
      if (result.status === "blocked") {
        finalizeCurrentTurn("error");
        deps.emit({
          type: "safety_blocked",
          payload: {
            friendlyMessage: result.safety.friendlyMessage ?? childSafeErrorMessage("safety_blocked"),
            category: result.safety.category ?? "other",
          },
        });
      }
    } catch (err) {
      finalizeCurrentTurn("error");
      throw err;
    }
  }

  async function handleEditCreation(
    payload: Extract<MobileNodeCommand, { type: "edit_creation" }>["payload"],
  ) {
    // 设置编辑目标（get_edit_target 读取原 html）与就地替换 id（下一轮 playground_open 用）。
    editTarget = { gameId: payload.gameId, title: payload.title, html: payload.html };
    editReplaceId = payload.gameId;
    const instruction = payload.instruction.trim();
    deps.log?.(`[mobileBridge] 编辑游戏 gameId=${payload.gameId} 指令=${instruction || "(询问模式)"}`);
    // 空指令 = 小朋友点了「改一改」但还没说怎么改（打字对小朋友太难）：
    // 让宠物主动开口问，小朋友直接语音回答；editTarget 已就位，下一轮 Agent 会
    // get_edit_target 看原码后就地改。非空指令 = 直接投喂修改要求。
    const message = instruction
      ? `我想把《${payload.title}》这个小游戏改一改：${instruction}`
      : `（系统提示）小主人点了《${payload.title}》的「改一改」但还没说怎么改。请用一句亲切的话主动问 TA 想把这个游戏改成什么样（比如换颜色、加角色、变难变简单），等 TA 说了再动手改。现在先别调用工具。`;
    await handleSendUserMessage(message, payload.generationId ?? 0);
  }

  async function handleClosePlayground(payload: Extract<MobileNodeCommand, { type: "close_playground" }>["payload"]) {
    deps.log?.(`[mobileBridge] 关闭 playground reason=${payload.reason} score=${payload.score ?? "-"}`);
    // MVP：用一句轻量用户消息让 Agent 上下文知道小游戏已结束，自然衔接后续对话。
    // 避免 score 为空时构造复杂提示。
    const scoreText = payload.score != null ? `，孩子得了 ${payload.score} 分` : "";
    await handleSendUserMessage(`我已经关闭小游戏了${scoreText}`);
  }

  /** 处理一条 RN → Node 命令（永不抛出，错误转友好事件） */
  async function handleCommandInner(cmd: MobileNodeCommand): Promise<void> {
    try {
      switch (cmd.type) {
        case "ping":
          deps.emit({ type: "pong" });
          break;
        case "init":
          await handleInit(cmd.payload);
          break;
        case "send_user_message":
          await handleSendUserMessage(cmd.payload.text, cmd.payload.generationId ?? 0);
          break;
        case "reset_session":
          invalidatePendingTts();
          turnAbort?.abort();
          bgGenAbort?.abort();
          bgGenAbort = undefined;
          finalizeCurrentTurn("abort");
          session?.dispose();
          session = undefined;
          sessionId = undefined;
          break;
        case "abort":
          invalidatePendingTts();
          turnAbort?.abort();
          finalizeCurrentTurn("abort");
          // 打断时一并拒绝挂起的确认，避免工具在 30s 超时前一直挂着
          for (const [requestId, resolver] of pendingConfirms) {
            pendingConfirms.delete(requestId);
            resolver(false);
          }
          session?.abort();
          break;
        case "speak_text":
          // 点击身体触发的本地台词：直接合成 TTS，不走 Agent / 不落对话记录
          if (tts) void synthesizeAndEmit(cmd.payload.text);
          break;
        case "speak_text_raw":
          // 游戏/互动页面朗读：独立通道，走 game_tts_audio，不参与门控/状态机
          void synthesizeGameTts(cmd.payload.text, cmd.payload.requestId);
          break;
        case "close_playground":
          await handleClosePlayground(cmd.payload);
          break;
        case "update_creations":
          knownCreations = cmd.payload.creations;
          deps.log?.(`[mobileBridge] 更新已有创作 ${knownCreations.length} 条`);
          break;
        case "confirm_response": {
          const resolver = pendingConfirms.get(cmd.payload.requestId);
          if (resolver) {
            pendingConfirms.delete(cmd.payload.requestId);
            resolver(cmd.payload.approved);
          }
          break;
        }
        case "edit_creation":
          await handleEditCreation(cmd.payload);
          break;
        case "update_child_profile":
          if (!session) {
            deps.log?.("[mobileBridge] update_child_profile：尚无会话，忽略");
            break;
          }
          session.updateChildProfile(cmd.payload.childProfile);
          deps.log?.(
            `[mobileBridge] 已热更新档案 keys=${Object.keys(cmd.payload.childProfile).join(",") || "(empty)"}`,
          );
          break;
        case "get_system_logs": {
          const maxItems = cmd.payload.maxItems ?? 200;
          deps.emit({
            type: "system_logs_result",
            payload: {
              logs: deps.systemLog?.getRecent().slice(-maxItems) ?? [],
              logTotalCount: deps.systemLog?.totalCount() ?? 0,
            },
          });
          break;
        }
        case "client_log": {
          // RN 诊断日志写入统一 SystemLogBuffer（经 deps.log tee），应用内可查看/导出
          deps.log?.(cmd.payload.message);
          break;
        }
        default: {
          const _exhaustive: never = cmd;
          void _exhaustive;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log?.(`[mobileBridge] 命令处理失败: ${message}`);
      deps.emit({ type: "agent_error", payload: { message: childSafeErrorMessage("agent_error") } });
    }
  }

  // RN channel 回调是 fire-and-forget（void handleCommand），必须在此串行化，
  // 否则 update_child_profile / init / send_user_message 会并发踩到半销毁会话。
  //
  // 例外：confirm_response / abort / ping 必须旁路队列——
  // create_web_playground / image_generate 会在 send_user_message 内 await requestConfirm，
  // 若确认回包再入队，会与自身死锁，30s 超时默认拒绝 → 游戏/画画永远不打开。
  let commandTail: Promise<void> = Promise.resolve();

  /** 是否旁路命令串行队列（控制面命令，可在长任务阻塞时即时生效） */
  function shouldBypassCommandQueue(cmd: MobileNodeCommand): boolean {
    return (
      cmd.type === "confirm_response" ||
      cmd.type === "abort" ||
      cmd.type === "ping" ||
      cmd.type === "get_system_logs" ||
      cmd.type === "client_log"
    );
  }

  /** 入队处理命令；返回该命令完成的 Promise（便于测试 await） */
  function handleCommand(cmd: MobileNodeCommand): Promise<void> {
    if (shouldBypassCommandQueue(cmd)) {
      return handleCommandInner(cmd);
    }
    const run = commandTail.then(
      () => handleCommandInner(cmd),
      () => handleCommandInner(cmd),
    );
    commandTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    handleCommand,
    /** 切换 TTS 音色（RN 侧通过 _auth.ttsVoice 更新时调用） */
    setTtsVoice(voice: string): void {
      if (tts && "setVoice" in tts) {
        void (tts as { setVoice(v: string): Promise<void> }).setVoice(voice);
      }
    },
    /** 当前活跃会话 ID（调试/测试用） */
    getSessionId: () => sessionId,
    /** 当前系统提示词（热更新/档案注入断言用） */
    getSystemPrompt: () => session?.getSystemPrompt() ?? "",
    /** 释放全部资源 */
    dispose() {
      session?.dispose();
      session = undefined;
      sessionId = undefined;
    },
  };
}

export type MobileBridge = ReturnType<typeof createMobileBridge>;
