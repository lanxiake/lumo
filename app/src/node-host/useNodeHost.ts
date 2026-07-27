/**
 * useNodeHost — 在 RN 组件生命周期内启动/消费 nodeBridge
 *
 * 挂载时启动内嵌 Node（nodejs.start），订阅事件；卸载时释放监听。
 * 暴露 ping / initSession / sendMessage / reset，供 App 驱动真实 Agent 会话：
 *   - node_ready → 自动 init 一个会话（petId/agentId/sessionKey）。
 *   - sendMessage(text) → 下发 send_user_message，Node 侧 Agent loop 产出 delta/final。
 *   - lastEvent 供上层经 agentEventMapper 翻译成 AgentSignal 驱动宠物状态机。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { startNodeBridge, type NodeBridge, type NodeAuth } from "./nodeBridge";
import type { CreationMeta, InitPayload, MobileNodeEvent } from "../../node-runtime/src/bridge/schema";

/** 联调用默认会话参数（正式版由宠物选择/家长绑定决定） */
export const DEFAULT_INIT: InitPayload = {
  petId: "mao_pro",
  agentId: "assistant",
  sessionKey: "kids-mobile-dev",
  petName: "小猫姐姐",
};

export interface UseNodeHostOptions {
  /** 取当前设备凭据（每次向 node 发命令时注入 _auth，供 streamFn 打 Gateway） */
  readonly getAuth?: () => NodeAuth | undefined;
  /** node_ready 后自动 init 用的载荷（缺省 DEFAULT_INIT）；用于注入已恢复的小主人档案等 */
  readonly getInitPayload?: () => InitPayload;
  /**
   * 是否允许 node_ready 时自动 init（默认 true）。
   * 设为 false 可延后到小主人档案 hydrate 完成后再由上层手动 init，避免空档案竞态。
   */
  readonly shouldAutoInit?: () => boolean;
}

export interface UseNodeHostResult {
  /** Node 是否已上报就绪（node_ready） */
  readonly nodeReady: boolean;
  /** 会话是否已初始化（init_done） */
  readonly sessionReady: boolean;
  /** 最近一次收到的事件（调试展示 + 上层翻译成信号） */
  readonly lastEvent: MobileNodeEvent | null;
  /** 发送 ping */
  readonly ping: () => void;
  /** 初始化会话（缺省用 DEFAULT_INIT） */
  readonly initSession: (payload?: InitPayload) => void;
  /** 发送用户消息文本，触发 Agent 回复 */
  readonly sendMessage: (text: string, generationId?: number) => void;
  /** 直接合成一句话（不走 Agent / 不落聊天记录）；用于音色试听等 */
  readonly speakText: (text: string) => void;
  /** 游戏/互动页面朗读（走独立 game_tts_audio 通道，不驱动宠物状态机） */
  readonly speakGameText: (text: string, requestId?: string) => void;
  /** 中止当前 Agent 回复 */
  readonly abort: () => void;
  /** 重置当前会话 */
  readonly reset: () => void;
  /** 热更新小主人档案到当前会话 soul（不拆会话） */
  readonly updateChildProfile: (profile: InitPayload["childProfile"]) => void;
  /** 通知 Node 侧小游戏已关闭 */
  readonly closePlayground: (reason: "user" | "timeout", score?: number) => void;
  /** 同步已有创作元信息，供 Agent 复用感知 */
  readonly updateCreations: (creations: readonly CreationMeta[]) => void;
  /** 回应 Agent 的确认请求（confirm_request） */
  readonly sendConfirm: (requestId: string, approved: boolean) => void;
  /** 编辑已有游戏：投喂原始 html + 修改指令，就地更新同 gameId */
  readonly editCreation: (params: {
    gameId: string;
    title: string;
    html: string;
    instruction: string;
    generationId?: number;
  }) => void;
}

export function useNodeHost(options: UseNodeHostOptions = {}): UseNodeHostResult {
  const bridgeRef = useRef<NodeBridge | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // getAuth 用 ref 持有：凭据变化不应重挂 node（node 线程单例），只影响下次 send 注入。
  const getAuthRef = useRef(options.getAuth);
  getAuthRef.current = options.getAuth;
  const getInitPayloadRef = useRef(options.getInitPayload);
  getInitPayloadRef.current = options.getInitPayload;
  const shouldAutoInitRef = useRef(options.shouldAutoInit);
  shouldAutoInitRef.current = options.shouldAutoInit;
  const [nodeReady, setNodeReady] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [lastEvent, setLastEvent] = useState<MobileNodeEvent | null>(null);

  const initSession = useCallback((payload: InitPayload = DEFAULT_INIT) => {
    console.log(`[useNodeHost] 初始化会话 petId=${payload.petId} agentId=${payload.agentId}`);
    // re-init 期间先标未就绪，避免 RN 在 Node 异步建会话窗口内继续发消息。
    sessionIdRef.current = null;
    setSessionReady(false);
    bridgeRef.current?.send({ type: "init", payload }, getAuthRef.current?.());
  }, []);

  useEffect(() => {
    const bridge = startNodeBridge();
    bridgeRef.current = bridge;
    const unsub = bridge.subscribe((event) => {
      setLastEvent(event);
      console.log(`[useNodeHost] 收到事件 type=${event.type}`);
      if (event.type === "node_ready") {
        setNodeReady(true);
        // 档案尚未 hydrate 时延后 init，由上层在 profile 就绪后补发。
        if (shouldAutoInitRef.current && !shouldAutoInitRef.current()) {
          console.log("[useNodeHost] Node 就绪，等待档案 hydrate 后再 init");
          return;
        }
        console.log("[useNodeHost] Node 就绪，自动发送 init");
        const initPayload = getInitPayloadRef.current?.() ?? DEFAULT_INIT;
        bridge.send({ type: "init", payload: initPayload }, getAuthRef.current?.());
      } else if (event.type === "pong") {
        setNodeReady(true);
      } else if (event.type === "init_done") {
        sessionIdRef.current = event.payload.sessionId;
        setSessionReady(true);
        console.log(`[useNodeHost] 会话初始化完成 sessionId=${event.payload.sessionId}`);
      } else if (event.type === "agent_error") {
        console.error("[useNodeHost] agent_error:", event.payload.code, event.payload.message);
      }
    });
    return () => {
      unsub();
      bridge.dispose();
      bridgeRef.current = null;
      sessionIdRef.current = null;
    };
  }, []);

  const ping = useCallback(() => {
    console.log("[useNodeHost] ping");
    bridgeRef.current?.send({ type: "ping" });
  }, []);

  const sendMessage = useCallback((text: string, generationId = 0) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      console.warn("[useNodeHost] sendMessage 失败: 会话未初始化");
      return;
    }
    console.log(`[useNodeHost] 发送用户消息 gen=${generationId} text="${text}"`);
    bridgeRef.current?.send(
      { type: "send_user_message", payload: { text, sessionId, generationId } },
      getAuthRef.current?.(),
    );
  }, []);

  const speakText = useCallback((text: string) => {
    console.log(`[useNodeHost] 试听/直接合成 text="${text}"`);
    bridgeRef.current?.send({ type: "speak_text", payload: { text } }, getAuthRef.current?.());
  }, []);

  const speakGameText = useCallback((text: string, requestId?: string) => {
    console.log(`[useNodeHost] 游戏朗读 text="${text}" req=${requestId ?? "-"}`);
    bridgeRef.current?.send(
      { type: "speak_text_raw", payload: { text, ...(requestId ? { requestId } : {}) } },
      getAuthRef.current?.(),
    );
  }, []);

  const reset = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      console.warn("[useNodeHost] reset 失败: 会话未初始化");
      return;
    }
    console.log("[useNodeHost] 重置会话");
    bridgeRef.current?.send({ type: "reset_session", payload: { sessionId } });
    sessionIdRef.current = null;
    setSessionReady(false);
  }, []);

  const abort = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      console.warn("[useNodeHost] abort 失败: 会话未初始化");
      return;
    }
    console.log("[useNodeHost] abort 当前回复");
    bridgeRef.current?.send({ type: "abort", payload: { sessionId } });
  }, []);

  const closePlayground = useCallback((reason: "user" | "timeout", score?: number) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      console.warn("[useNodeHost] closePlayground 失败: 会话未初始化");
      return;
    }
    console.log(`[useNodeHost] 关闭 playground reason=${reason} score=${score ?? "-"}`);
    bridgeRef.current?.send(
      { type: "close_playground", payload: { sessionId, reason, score } },
      getAuthRef.current?.(),
    );
  }, []);

  const updateCreations = useCallback((creations: readonly CreationMeta[]) => {
    // 会话未就绪也可发送：Node 侧不依赖 sessionId，仅更新内存清单。
    bridgeRef.current?.send({ type: "update_creations", payload: { creations } });
  }, []);

  /** 将最新小主人档案热推入当前会话 soul（家长手动保存记忆时调用） */
  const updateChildProfile = useCallback((profile: InitPayload["childProfile"]) => {
    const childProfile = profile ?? {};
    console.log(
      `[useNodeHost] 热更新小主人档案 keys=${Object.keys(childProfile).join(",") || "(empty)"}`,
    );
    bridgeRef.current?.send({
      type: "update_child_profile",
      payload: { childProfile },
    });
  }, []);

  const sendConfirm = useCallback((requestId: string, approved: boolean) => {
    console.log(`[useNodeHost] 确认回应 requestId=${requestId} approved=${approved}`);
    bridgeRef.current?.send({ type: "confirm_response", payload: { requestId, approved } });
  }, []);

  const editCreation = useCallback(
    (params: { gameId: string; title: string; html: string; instruction: string; generationId?: number }) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        console.warn("[useNodeHost] editCreation 失败: 会话未初始化");
        return;
      }
      console.log(`[useNodeHost] 编辑游戏 gameId=${params.gameId}`);
      bridgeRef.current?.send(
        { type: "edit_creation", payload: { sessionId, ...params } },
        getAuthRef.current?.(),
      );
    },
    [],
  );

  return { nodeReady, sessionReady, lastEvent, ping, initSession, sendMessage, speakText, speakGameText, abort, reset, updateChildProfile, closePlayground, updateCreations, sendConfirm, editCreation };
}
