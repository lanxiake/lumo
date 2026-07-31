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
      deps.emit({ type: "agent_error", payload: { message: childSafeErrorMessage("tts_error"), code: "tts_error" } });
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
        requestConfirm: (kind, title) => requestConfirm(kind, title),
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
    // 新一轮发送作废上一轮未完成的 TTS
    invalidatePendingTts();
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
    deps.log?.(`[mobileBridge] 编辑游戏 gameId=${payload.gameId} 指令=${payload.instruction}`);
    // 以用户消息形式投喂修改指令；Agent 会先 get_edit_target 看原码，再生成改好版本。
    await handleSendUserMessage(
      `我想把《${payload.title}》这个小游戏改一改：${payload.instruction}`,
      payload.generationId ?? 0,
    );
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
          finalizeCurrentTurn("abort");
          session?.dispose();
          session = undefined;
          sessionId = undefined;
          break;
        case "abort":
          invalidatePendingTts();
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
