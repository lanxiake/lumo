/**
 * index — 移动端 Node 宿主入口
 *
 * 初始化移动端 Node 宿主，接收 RN bridge 消息，把 Agent 事件发回 RN
 * （计划 §4.1）。
 *
 * transport：nodejs-mobile-react-native 的 channel（Node 侧 require 内置模块
 * "rn-bridge"）。为保持 node-runtime 可独立 tsc / vitest（无 RN 依赖），
 * transport 绑定在此入口动态解析，核心逻辑全在 createMobileBridge（transport 无关）。
 */

import { createMobileBridge } from "./bridge/mobileBridge.js";
import { getPetModelConfig } from "./config/model-registry.js";
import type { ImageProviderConfig, MobileNodeCommand, MobileNodeEvent, ProviderConfig } from "./bridge/schema.js";
import { createRemoteLogShipper, type ClientLogEntry } from "./host/remote-log-shipper.js";
import { createSystemLogBuffer } from "./perf/system-logs.js";
import { startPerfMonitor } from "./perf/perf-monitor.js";
import { ensureOpenAiV1 } from "./host/provider-url.js";

/**
 * 事件 → 远程日志映射（仅错误 + 关键事件；返回 null 表示不上报）。
 * 儿童安全：不上报对话原文（delta/final），只上报错误码与生命周期打点。
 */
function eventToClientLog(event: MobileNodeEvent): ClientLogEntry | null {
  switch (event.type) {
    case "agent_error":
      return {
        level: "error",
        event: "agent_error",
        message: event.payload.code ?? "agent_error",
      };
    case "safety_blocked":
      return { level: "warn", event: "safety_blocked", meta: { category: event.payload.category } };
    case "tts_failed":
      return { level: "warn", event: "tts_failed", message: event.payload.code };
    case "init_done":
      return { level: "info", event: "init_done", meta: { sessionId: event.payload.sessionId } };
    case "node_ready":
      return { level: "info", event: "node_ready" };
    default:
      return null;
  }
}

/** rn-bridge channel 的最小接口（nodejs-mobile-react-native 提供） */
interface RnBridgeChannel {
  on(event: "message", listener: (msg: string) => void): void;
  send(msg: string): void;
}
interface RnBridgeModule {
  channel: RnBridgeChannel;
}

/** 解析 rn-bridge（仅在 nodejs-mobile 运行时可用；其它环境返回 undefined） */
function resolveRnBridge(): RnBridgeModule | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("rn-bridge") as RnBridgeModule;
    return mod;
  } catch {
    return undefined;
  }
}

/** 环境变量读取网关配置（密钥不在此，JWT 由 RN 经消息注入或安全存储桥接） */
function envConfig() {
  return {
    gatewayUrl: process.env.LUMO_GATEWAY_URL?.trim() || "http://127.0.0.1:18789",
    platform: process.env.KIDS_MOBILE_PLATFORM?.trim() || process.platform,
    appVersion: process.env.KIDS_MOBILE_APP_VERSION?.trim() || "0.0.0",
  };
}

/** 启动宿主：绑定 rn-bridge channel（若可用），返回 bridge handle */
export function startMobileHost(): void {
  const rn = resolveRnBridge();
  if (!rn) {
    // 非 nodejs-mobile 环境（如本地测试）：不绑定 transport。
    process.stderr.write("[kids-mobile] rn-bridge 不可用，宿主未绑定 transport\n");
    return;
  }

  const cfg = envConfig();

  // JWT / deviceId / gatewayUrl 由 RN 侧持有，经 _auth 注入。移动端无 process.env，
  // gatewayUrl 缺省用 env / 占位，RN 下发后覆盖（生产从 apiBaseUrl 派生同源主机）。
  let cachedToken = "";
  let cachedDeviceId: string | undefined;
  let cachedGatewayUrl = cfg.gatewayUrl;
  // 用户配置的模型提供商（含 apiKey）——经 _auth 下发，内存缓存，不落日志。
  let cachedProviderConfig: ProviderConfig | undefined;
  // 生图提供商配置（含 apiKey）——同上，缺省时生图回退 gateway。
  let cachedImageProviderConfig: ImageProviderConfig | undefined;

  const logShipper = createRemoteLogShipper({
    getGatewayUrl: () => cachedGatewayUrl,
    getAuthToken: async () => cachedToken,
    getDeviceId: () => cachedDeviceId,
    platform: cfg.platform,
  });

  // 系统日志内存缓冲（运行/错误/turn_timing 日志）：设置页「系统日志」统一查看。
  // nodeLog = tee：既写 stderr（原行为）又入缓冲，供 RN get_system_logs 回读。
  const systemLog = createSystemLogBuffer();
  const nodeLog = (msg: string): void => {
    process.stderr.write(`[kids-mobile] ${msg}\n`);
    systemLog.push(msg);
  };

  // 性能监控：周期采集 CPU/内存写入系统日志（设置页「系统日志」可查）。
  startPerfMonitor({ log: nodeLog });

  const bridge = createMobileBridge({
    emit: (event: MobileNodeEvent) => {
      rn.channel.send(JSON.stringify(event));
      const logEntry = eventToClientLog(event);
      if (logEntry) logShipper.ship(logEntry);
    },
    getGatewayUrl: () => cachedGatewayUrl,
    getAuthToken: async () => cachedToken,
    getDeviceId: () => cachedDeviceId,
    getProviderConfig: () => cachedProviderConfig,
    getImageProviderConfig: () => cachedImageProviderConfig,
    platform: cfg.platform,
    appVersion: cfg.appVersion,
    // MVP 占位人格解析：真实实现从内置宠物配置 / 云端同步读取。
    resolvePetPersona: (petId) => `我是你的宠物伙伴（${petId}），最喜欢和你一起玩、一起学新东西啦！`,
    resolvePetPersonaAddon: (petId) => getPetModelConfig(petId).personaAddon,
    log: nodeLog,
    systemLog,
  });

  rn.channel.on("message", (raw: string) => {
    let cmd: MobileNodeCommand;
    try {
      const parsed = JSON.parse(raw) as MobileNodeCommand & {
        _auth?: {
          token?: string;
          deviceId?: string;
          gatewayUrl?: string;
          ttsVoice?: string;
          providerConfig?: ProviderConfig | null;
          imageProviderConfig?: ImageProviderConfig | null;
        };
      };
      // 允许 RN 在任意消息上携带 _auth 更新安全凭据（不进日志）
      if (parsed._auth) {
        if (typeof parsed._auth.token === "string") cachedToken = parsed._auth.token;
        if (typeof parsed._auth.deviceId === "string") cachedDeviceId = parsed._auth.deviceId;
        if (typeof parsed._auth.gatewayUrl === "string" && parsed._auth.gatewayUrl.trim()) {
          cachedGatewayUrl = parsed._auth.gatewayUrl.trim();
        }
        if (typeof parsed._auth.ttsVoice === "string" && parsed._auth.ttsVoice.trim()) {
          bridge.setTtsVoice(parsed._auth.ttsVoice.trim());
        }
        // providerConfig：对象则缓存，null 则清除（用户在设置页删除配置）。
        if (parsed._auth.providerConfig === null) {
          cachedProviderConfig = undefined;
        } else if (parsed._auth.providerConfig && typeof parsed._auth.providerConfig === "object") {
          const pc = parsed._auth.providerConfig;
          if (
            (pc.protocol === "openai" || pc.protocol === "anthropic") &&
            typeof pc.baseUrl === "string" &&
            typeof pc.apiKey === "string" &&
            typeof pc.model === "string"
          ) {
            // openai 兼容端点漏填 /v1 时补全（anthropic SDK 自拼 /v1/messages，不动）
            cachedProviderConfig =
              pc.protocol === "openai" ? { ...pc, baseUrl: ensureOpenAiV1(pc.baseUrl) } : pc;
          }
        }
        // imageProviderConfig：同上语义（OpenAI 兼容图像端点，无 protocol 字段）。
        if (parsed._auth.imageProviderConfig === null) {
          cachedImageProviderConfig = undefined;
        } else if (parsed._auth.imageProviderConfig && typeof parsed._auth.imageProviderConfig === "object") {
          const ic = parsed._auth.imageProviderConfig;
          if (
            typeof ic.baseUrl === "string" &&
            typeof ic.apiKey === "string" &&
            typeof ic.model === "string"
          ) {
            // 图像端点恒为 OpenAI 兼容（拼 /images/generations），同样补 /v1
            cachedImageProviderConfig = { ...ic, baseUrl: ensureOpenAiV1(ic.baseUrl) };
          }
        }
      }
      cmd = parsed;
    } catch {
      process.stderr.write("[kids-mobile] 收到非法 JSON 消息，已忽略\n");
      return;
    }
    void bridge.handleCommand(cmd);
  });

  process.stderr.write("[kids-mobile] 宿主已启动并绑定 rn-bridge\n");

  // 通知 RN 宿主就绪：RN 侧 useNodeHost 收到 node_ready 后自动发 init 建会话。
  // 缺此 emit 会导致 RN 永远等不到就绪信号、从不发 init（链路断裂）。
  rn.channel.send(JSON.stringify({ type: "node_ready" } satisfies MobileNodeEvent));
  logShipper.ship({ level: "info", event: "node_ready" });
  process.stderr.write("[kids-mobile] 已发送 node_ready\n");
}

// 作为 nodejs-mobile 主脚本运行时自动启动
startMobileHost();

export { createMobileBridge } from "./bridge/mobileBridge.js";
export type { MobileNodeCommand, MobileNodeEvent } from "./bridge/schema.js";
