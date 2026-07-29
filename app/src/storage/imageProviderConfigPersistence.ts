/**
 * imageProviderConfigPersistence — 生图提供商配置持久化
 *
 * 用户在设置页填写的 OpenAI 兼容生图直连配置（baseUrl / apiKey / model）。
 * 缺省时生图工具回退 gateway 兜底。apiKey 属敏感字段：存 SharedPrefs（dev）/
 * 生产应换 keychain。整份 JSON 序列化存单键 kids.imageProviderConfig。
 */

import type { SecureStorage } from "../auth/secureStorage";
import type { ImageProviderConfig } from "../../node-runtime/src/bridge/schema";

const KEY = "kids.imageProviderConfig";

/** 读取已保存的生图配置；无 / 非法返回 null（视为未配置）。 */
export async function loadImageProviderConfig(storage: SecureStorage): Promise<ImageProviderConfig | null> {
  const raw = await storage.getItem(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ImageProviderConfig>;
    if (
      typeof p.baseUrl === "string" &&
      typeof p.apiKey === "string" &&
      typeof p.model === "string"
    ) {
      return { baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model };
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

/** 保存生图配置（整份覆盖）。 */
export async function saveImageProviderConfig(
  storage: SecureStorage,
  config: ImageProviderConfig,
): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(config));
}

/** 清除生图配置。 */
export async function clearImageProviderConfig(storage: SecureStorage): Promise<void> {
  await storage.removeItem(KEY);
}
