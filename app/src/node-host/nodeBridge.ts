/**
 * nodeBridge — RN 侧 ↔ nodejs-mobile 宿主 的通信封装
 *
 * 职责（计划 §4.2，RN 半边）：
 *  - 启动内嵌 Node（nodejs.start("main.js")），只启动一次。
 *  - 下发 MobileNodeCommand（JSON 序列化经 channel.send）。
 *  - 订阅 MobileNodeEvent（channel message → JSON.parse → 分发给监听者）。
 *  - 安全凭据（JWT/deviceId）经命令附带的 `_auth` 字段注入，不进普通日志。
 *
 * 类型复用 node-runtime 的 bridge schema（单一数据源），RN 与 Node 共享同一协议。
 * 约束：本层只做传输，不含宠物状态/表情逻辑（那些在 petOrchestrator）。
 */

import nodejs from "nodejs-mobile-react-native";
import type {
  MobileNodeCommand,
  MobileNodeEvent,
  ProviderConfig,
} from "../../node-runtime/src/bridge/schema";

/** 设备内 Node 入口文件名（相对 nodejs-assets/nodejs-project/） */
const NODE_MAIN = "main.js";

/** 安全凭据：随命令注入 Node 侧，Node 用内存缓存，不落普通日志 */
export interface NodeAuth {
  readonly token?: string;
  readonly deviceId?: string;
  /**
   * 网关 HTTP 基础 URL（如 http://127.0.0.1:18789）。streamFn 据此打
   * {gatewayUrl}/v1/llm/stream。移动端无 process.env，故由 RN 侧从
   * apiBaseUrl 派生后经 _auth 下发；缺省时 Node 侧回退 env / 占位。
   */
  readonly gatewayUrl?: string;
  /**
   * TTS 音色 ID（如 zh-CN-XiaoxiaoNeural）。由设置页经 _auth 下发给 Node 侧，
   * 切换后下次合成生效，无需重启。
   */
  readonly ttsVoice?: string;
  /**
   * 用户配置的模型提供商（含 apiKey）。由设置页经 _auth 下发给 Node 侧内存缓存，
   * 下次 init/发送生效。null 表示清除配置；undefined 表示本次不更新。
   */
  readonly providerConfig?: ProviderConfig | null;
}

/** 事件监听器 */
export type NodeEventListener = (event: MobileNodeEvent) => void;

export interface NodeBridge {
  /** 下发命令；auth 存在时附带 _auth 供 Node 更新凭据 */
  send(command: MobileNodeCommand, auth?: NodeAuth): void;
  /** 订阅所有 Node 事件，返回取消订阅函数 */
  subscribe(listener: NodeEventListener): () => void;
  /** 释放（移除底层 channel 监听） */
  dispose(): void;
}

/** nodejs-mobile channel 的 addListener 返回 RN EventSubscription（靠 .remove() 取消） */
interface EventSubscriptionLike {
  remove(): void;
}

/** Node 线程是否已启动（模块级，跨组件重挂只 start 一次） */
let nodeStarted = false;
/**
 * Node 是否已发过 node_ready（模块级）。node_ready 仅在 Node 启动时发一次；
 * 组件重挂（StrictMode / 退登→登录 / 热重载）会新建 bridge 订阅，但 Node 不会
 * 重发，导致新订阅者永远收不到 → UI 卡「启动中」。故记住就绪态，新订阅补发。
 */
let nodeIsReady = false;

/**
 * 创建并启动 nodeBridge。整个 App 生命周期只应调用一次
 * （nodejs.start 启动单一 Node 线程）。
 */
export function startNodeBridge(): NodeBridge {
  const listeners = new Set<NodeEventListener>();

  // channel 传来的是 Node 侧 send 的 JSON 字符串（可能带多参，取第一个）。
  const onMessage = (...args: unknown[]): void => {
    const raw = args[0];
    if (typeof raw !== "string") {
      console.warn("[nodeBridge] 收到非字符串消息", typeof raw);
      return;
    }
    let event: MobileNodeEvent;
    try {
      event = JSON.parse(raw) as MobileNodeEvent;
    } catch {
      console.warn("[nodeBridge] 收到非法 JSON 消息，已忽略");
      return;
    }
    console.log(`[nodeBridge] 收到事件 type=${event.type}`);
    if (event.type === "node_ready" || event.type === "pong") nodeIsReady = true;
    for (const l of listeners) l(event);
  };

  // nodejs-mobile 的 channel 继承 RN EventEmitter：addListener 返回 EventSubscription，
  // 取消订阅靠 subscription.remove()（无 removeListener 方法，误用会 TypeError 崩溃）。
  const subscription = nodejs.channel.addListener("message", onMessage) as
    | EventSubscriptionLike
    | undefined;
  // nodejs.start 启动单一 Node 线程，一个 App 生命周期只能调一次；React 严格模式/热更
  // 会重复挂载 useEffect，故用模块级 guard 防止重复 start（重复会崩或起多实例）。
  if (!nodeStarted) {
    console.log("[nodeBridge] 启动内嵌 Node 线程...");
    try {
      nodejs.start(NODE_MAIN);
      nodeStarted = true;
      console.log("[nodeBridge] 内嵌 Node 线程启动成功");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[nodeBridge] 启动内嵌 Node 线程失败:", message);
      throw err;
    }
  } else {
    console.log("[nodeBridge] 内嵌 Node 线程已启动，跳过重复 start");
  }

  return {
    send(command: MobileNodeCommand, auth?: NodeAuth): void {
      const hasAuth =
        auth &&
        (auth.token ||
          auth.deviceId ||
          auth.gatewayUrl ||
          auth.ttsVoice ||
          auth.providerConfig !== undefined);
      const payload = hasAuth
        ? {
            ...command,
            _auth: {
              token: auth!.token,
              deviceId: auth!.deviceId,
              gatewayUrl: auth!.gatewayUrl,
              ttsVoice: auth!.ttsVoice,
              providerConfig: auth!.providerConfig,
            },
          }
        : command;
      console.log(`[nodeBridge] 发送命令 type=${command.type}`);
      try {
        nodejs.channel.send(JSON.stringify(payload));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[nodeBridge] 发送命令失败 type=${command.type}:`, message);
      }
    },
    subscribe(listener: NodeEventListener): () => void {
      listeners.add(listener);
      // Node 已就绪但本订阅是重挂后新建的：补发一次 node_ready，避免卡「启动中」。
      // 异步派发，确保调用方 useEffect 已完成 setState 接线后再触发。
      if (nodeIsReady) {
        setTimeout(() => {
          if (listeners.has(listener)) listener({ type: "node_ready" });
        }, 0);
      }
      return () => listeners.delete(listener);
    },
    dispose(): void {
      listeners.clear();
      // RN EventSubscription.remove()；老版本兜底 removeAllListeners（类型未声明，结构化窄化）。
      if (subscription?.remove) {
        subscription.remove();
      } else {
        const legacy = nodejs.channel as unknown as {
          removeAllListeners?: (event: string) => void;
        };
        if (typeof legacy.removeAllListeners === "function") {
          legacy.removeAllListeners("message");
        }
      }
    },
  };
}
