/**
 * mobile-config-provider — 移动端配置提供者（ConfigProvider 实现）
 *
 * 独立运行模式：用户在设置页配置模型提供商（OpenAI / Anthropic 兼容端点），
 * 客户端直连上游，不经 Gateway。
 *  - 有 providerConfig：resolveModel 返回用户配置的模型 + streamFnKind=direct，
 *    凭据（baseUrl/apiKey）由 streamFn 工厂从同一 providerConfig 解析。
 *  - 无 providerConfig：回退 purpose 占位 + gateway（用户尚未配置时的兜底）。
 */

import {
  ModelRouter,
  createFeatureFlags,
  type AgentRuntimeFeatureFlags,
  type ConfigProvider,
  type ProviderSource,
  type ProviderCredentials,
  type ModelOverride,
  type ResolvedModel,
} from "@lumo/agent-runtime";
import type { Model } from "@mariozechner/pi-ai";
import type { ProviderConfig } from "../bridge/schema.js";

export interface MobileConfigOptions {
  /** 默认用途槽（缺省 "chat"） */
  readonly defaultPurpose?: string;
  /** host 默认 feature flags 覆盖 */
  readonly defaultFeatureFlags?: Partial<AgentRuntimeFeatureFlags>;
  /** 模型路由器（缺省新建） */
  readonly modelRouter?: ModelRouter;
  /** 用户配置的模型提供商（存在则走 direct 直连；缺省回退 gateway） */
  readonly providerConfig?: ProviderConfig;
}

/** 协议 → pi-ai api 名。openai 交给 direct-stream 的 normalizeApi 转 openai-completions。 */
function apiForProtocol(protocol: ProviderConfig["protocol"]): string {
  return protocol === "anthropic" ? "anthropic-messages" : "openai";
}

/**
 * 创建移动端 ConfigProvider。
 *
 * - resolveModel：purpose 图槽解析（真实模型由 Gateway CapabilityResolver 定），
 *   来源恒为 cloud，streamFn 恒为 gateway。
 * - getProviderCredentials：恒返回空凭据——移动端不持有任何上游密钥。
 * - getFeatureFlags：host 默认 + 客户端 override 合并。
 */
export function createMobileConfigProvider(opts: MobileConfigOptions = {}): ConfigProvider {
  const router = opts.modelRouter ?? new ModelRouter();
  const baseFlags = createFeatureFlags(opts.defaultFeatureFlags);
  const defaultPurpose = opts.defaultPurpose ?? "chat";
  const providerConfig = opts.providerConfig;

  return {
    getProviderCredentials(_source: ProviderSource): ProviderCredentials {
      // 凭据由 direct streamFn 工厂从 providerConfig 解析；此处不承载密钥。
      return {};
    },

    resolveModel(purpose: string, sessionOverride?: ModelOverride): ResolvedModel {
      // 用户已配置提供商：直连其模型（direct）。凭据由 streamFn 工厂解析。
      if (providerConfig) {
        const model = {
          id: providerConfig.model,
          api: apiForProtocol(providerConfig.protocol),
          baseUrl: providerConfig.baseUrl,
        } as Model<string>;
        return { model, providerSource: "custom", streamFnKind: "direct" };
      }
      // 未配置：回退 purpose 占位 + gateway（兜底，用户配置前不可真正对话）。
      const effectivePurpose = sessionOverride?.modelRef ? sessionOverride.modelRef : (purpose || defaultPurpose);
      const model = sessionOverride?.modelRef
        ? router.resolveExplicitModelId(sessionOverride.modelRef)
        : router.resolve(effectivePurpose);
      return { model, providerSource: "cloud", streamFnKind: "gateway" };
    },

    getFeatureFlags(sessionOverride?: Partial<AgentRuntimeFeatureFlags>): AgentRuntimeFeatureFlags {
      if (!sessionOverride) return baseFlags;
      return { ...baseFlags, ...sessionOverride };
    },
  };
}
