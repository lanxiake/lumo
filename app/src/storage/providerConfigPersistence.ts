/**
 * providerConfigPersistence — 模型提供商配置持久化
 *
 * 用户在设置页填写的 OpenAI / Anthropic 直连配置（协议 / baseUrl / apiKey / model）。
 * 独立运行模式下这是唯一的模型来源，客户端直连上游，不经 Gateway。
 *
 * apiKey 属敏感字段：存 SharedPrefs（dev）/生产应换 keychain。整份配置 JSON 序列化
 * 存单键 kids.providerConfig，读时校验 protocol 枚举，非法则视为未配置。
 */

import type { SecureStorage } from "../auth/secureStorage";
import type { ProviderConfig } from "../../node-runtime/src/bridge/schema";

const KEY = "kids.providerConfig";

/** 读取已保存的提供商配置；无 / 非法返回 null（视为未配置）。 */
export async function loadProviderConfig(storage: SecureStorage): Promise<ProviderConfig | null> {
  const raw = await storage.getItem(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ProviderConfig>;
    if (
      (p.protocol === "openai" || p.protocol === "anthropic") &&
      typeof p.baseUrl === "string" &&
      typeof p.apiKey === "string" &&
      typeof p.model === "string"
    ) {
      return { protocol: p.protocol, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model };
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

/** 保存提供商配置（整份覆盖）。 */
export async function saveProviderConfig(
  storage: SecureStorage,
  config: ProviderConfig,
): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(config));
}

/** 清除提供商配置。 */
export async function clearProviderConfig(storage: SecureStorage): Promise<void> {
  await storage.removeItem(KEY);
}
