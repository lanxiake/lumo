/**
 * mobile-stream-fn-factory — 移动端 streamFn 工厂（direct + gateway 分派）
 *
 * 独立运行模式：用户配置模型提供商后走 direct 直连（pi-ai streamSimple 直打
 * OpenAI / Anthropic 兼容端点），凭据（baseUrl/apiKey）从 providerConfig 本地解析，
 * 永不出 Node 进程。未配置时回退 gateway（兜底）。
 */

import {
  createStreamFnFactory,
  type StreamFnFactory,
  type StreamMetadata,
} from "@lumo/agent-runtime";
import type { ProviderConfig } from "../bridge/schema.js";

export interface MobileStreamFnDeps {
  /** 网关基础 URL（未配置 provider 时的兜底路径） */
  readonly gatewayUrl: string;
  /** 从安全存储读取 JWT（gateway 兜底路径用） */
  readonly getAuthToken: () => Promise<string>;
  /** 从设备绑定状态读取 deviceId（gateway 兜底路径用） */
  readonly getDeviceId: () => string | undefined;
  /** 用户配置的模型提供商（存在则 direct 分支用其凭据） */
  readonly providerConfig?: ProviderConfig;
  /** 宠物 ID（元数据） */
  readonly petId: string;
  /** 平台（如 ios / android） */
  readonly platform: string;
  /** App 版本 */
  readonly appVersion: string;
  /** 脱敏日志（不记录 apiKey/JWT 全文） */
  readonly log?: (msg: string) => void;
  /** LLM 请求即将发出（fetch 前） */
  readonly onLlmRequestStart?: () => void;
  /** 首个文本 token 到达 */
  readonly onLlmFirstToken?: () => void;
}

/**
 * 创建移动端 streamFn 工厂：按 ResolvedModel.streamFnKind 分派 direct / gateway。
 */
export function createMobileStreamFnFactory(deps: MobileStreamFnDeps): StreamFnFactory {
  return createStreamFnFactory({
    gateway: {
      gatewayUrl: deps.gatewayUrl,
      getAuthToken: deps.getAuthToken,
      getDeviceId: deps.getDeviceId,
      log: deps.log,
      onLlmRequestStart: deps.onLlmRequestStart ? () => deps.onLlmRequestStart?.() : undefined,
      onLlmFirstToken: deps.onLlmFirstToken ? () => deps.onLlmFirstToken?.() : undefined,
      // 默认关闭思考模式：面向儿童交互，响应延迟优先于推理深度。
      getMetadataExtras: (): Partial<StreamMetadata> => ({
        channel: "kids-mobile",
        thinkingEnabled: false,
      }),
    },
    direct: {
      // 凭据从 providerConfig 本地解析（永不下发/出进程）。baseUrl 已随 model 注入，
      // 此处主要提供 apiKey；缺省时 direct-stream 会填占位符供本地端点通过校验。
      resolveCredentials: () => ({
        baseUrl: deps.providerConfig?.baseUrl ?? "",
        apiKey: deps.providerConfig?.apiKey ?? "",
      }),
      log: deps.log,
    },
  });
}
