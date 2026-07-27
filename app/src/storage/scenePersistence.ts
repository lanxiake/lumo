/**
 * scenePersistence — 场景背景选择持久化（全局单值，非按角色）
 *
 * 键 kids.sceneId，存当前选中的场景 id；未设置时上层回退到第一个内置场景。
 */

import type { SecureStorage } from "../auth/secureStorage";

const KEY = "kids.sceneId";

export async function loadSceneId(storage: SecureStorage): Promise<string | null> {
  const v = await storage.getItem(KEY);
  return v?.trim() || null;
}

export async function saveSceneId(storage: SecureStorage, sceneId: string): Promise<void> {
  await storage.setItem(KEY, sceneId);
}
