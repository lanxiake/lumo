/**
 * secureStorage — 安全凭据存储抽象（接口先行）
 *
 * 设备 token / deviceId 属敏感凭据，生产须落 iOS Keychain / Android Keystore
 * （规范 §5.2：JWT/deviceToken 入安全存储，禁明文日志）。本文件只定义接口 +
 * 开发期实现，native keychain 实现后续接入，上层依赖接口不依赖具体实现。
 */

import { NativeModules } from "react-native";

export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** 凭据键名（集中管理，避免散落字面量） */
export const SecureKeys = {
  deviceToken: "kids.deviceToken",
  deviceId: "kids.deviceId",
  rememberedUsername: "kids.rememberedUsername",
  rememberedPassword: "kids.rememberedPassword",
  rememberCredentials: "kids.rememberCredentials",
  tokenExpiresAt: "kids.tokenExpiresAt",
  // 家长用户 JWT：访问 requireUser 守卫的用户级接口（积分等），生产不认设备 token。
  userAccessToken: "kids.userAccessToken",
  userRefreshToken: "kids.userRefreshToken",
} as const;

/**
 * 开发期内存实现：不加密、不持久化。仅用于单测。
 */
export class InMemorySecureStorage implements SecureStorage {
  private readonly map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

interface SharedPrefsModule {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const SHARED_PREFS = (NativeModules as Record<string, unknown>).SharedPrefs as
  | SharedPrefsModule
  | undefined;

/**
 * SharedPreferences 实现：Android dev 联调持久化（重启不丢）。
 * 注意：不加密，生产须换 keychain/keystore。
 */
export class SharedPrefsStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    if (!SHARED_PREFS) return null;
    try {
      return await SHARED_PREFS.getItem(key);
    } catch {
      return null;
    }
  }
  async setItem(key: string, value: string): Promise<void> {
    if (!SHARED_PREFS) return;
    await SHARED_PREFS.setItem(key, value);
  }
  async removeItem(key: string): Promise<void> {
    if (!SHARED_PREFS) return;
    await SHARED_PREFS.removeItem(key);
  }
}
