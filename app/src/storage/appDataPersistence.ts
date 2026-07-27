/**
 * appDataPersistence — 画廊图片与游戏历史的本地持久化
 *
 * 使用 SharedPreferences 存储 JSON，重启后可恢复「我的画」「我的游戏」。
 * 与聊天 SQLite 独立：Android 当前禁用了 op-sqlite，故采用 SharedPrefs 方案。
 */

import type { SecureStorage } from "../auth/secureStorage";
import type { GalleryImage, GameEntry } from "../hooks/useAppActions";

/** SharedPrefs 键名 */
export const AppDataKeys = {
  galleryImages: "kids.galleryImages",
  gameHistory: "kids.gameHistory",
} as const;

/**
 * 从本地存储读取画廊图片列表。
 */
export async function loadGalleryImages(storage: SecureStorage): Promise<readonly GalleryImage[]> {
  const raw = await storage.getItem(AppDataKeys.galleryImages);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGalleryImage);
  } catch {
    return [];
  }
}

/**
 * 将画廊图片列表写入本地存储。
 */
export async function saveGalleryImages(
  storage: SecureStorage,
  images: readonly GalleryImage[],
): Promise<void> {
  await storage.setItem(AppDataKeys.galleryImages, JSON.stringify(images));
}

/**
 * 从本地存储读取游戏历史列表。
 */
export async function loadGameHistory(storage: SecureStorage): Promise<readonly GameEntry[]> {
  const raw = await storage.getItem(AppDataKeys.gameHistory);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGameEntry);
  } catch {
    return [];
  }
}

/**
 * 将游戏历史列表写入本地存储。
 */
export async function saveGameHistory(
  storage: SecureStorage,
  games: readonly GameEntry[],
): Promise<void> {
  await storage.setItem(AppDataKeys.gameHistory, JSON.stringify(games));
}

/**
 * 归一化去重键：用于「语义等价」判断，避免上游对同一提示词/标题
 * 返回不同 URL/HTML 时精确去重失效。
 * 处理：去首尾/内部多余空白、转小写、去标点与 emoji、去常见噪声后缀词。
 */
export function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    // 去除标点、符号、emoji（保留中日韩、字母、数字、空白）
    .replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-z0-9\s]/gu, "")
    // 去常见噪声后缀词（仅在词尾，保守处理）
    .replace(/(小游戏|游戏|的画|图片|一张|一个)$/u, "")
    // 折叠所有空白
    .replace(/\s+/gu, "")
    .trim();
}

/**
 * 画廊图片去重：按归一化提示词（无提示词回退 url）语义去重，保留最新（createdAt 最大）。
 * Agent 可能对同一提示词重复出图（URL/data URI 不同），导致「我的画」里堆相似的图。
 * 输出保持原相对顺序（追加序），无重复时返回原引用。
 */
export function dedupeGalleryImages(images: readonly GalleryImage[]): readonly GalleryImage[] {
  return dedupeByNormalizedKey(images, (img) => normalizeKey(img.prompt ?? img.url));
}

/**
 * 游戏历史去重：按归一化标题语义去重，保留最新（createdAt 最大）。
 * Agent 可能对同一主题重复生成不同 HTML，导致「我的游戏」里堆相似的游戏。
 * 输出保持原相对顺序，无重复时返回原引用。
 */
export function dedupeGameHistory(games: readonly GameEntry[]): readonly GameEntry[] {
  return dedupeByNormalizedKey(games, (game) => normalizeKey(game.title));
}

/**
 * 通用归一化去重：同键保留 createdAt 最大者，输出按各键「最新条目」的原相对顺序稳定排列。
 * 无重复时返回原引用（避免无谓的新数组，兼顾 React 引用比较）。
 */
function dedupeByNormalizedKey<T extends { readonly createdAt: number }>(
  items: readonly T[],
  keyOf: (item: T) => string,
): readonly T[] {
  // 先选出每个键的最新条目
  const latestByKey = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    const prev = latestByKey.get(key);
    if (!prev || item.createdAt >= prev.createdAt) {
      latestByKey.set(key, item);
    }
  }
  if (latestByKey.size === items.length) return items;
  // 按原相对顺序输出「被选中」的条目（每键只出现一次）
  const emitted = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (emitted.has(key)) continue;
    emitted.add(key);
    const chosen = latestByKey.get(key);
    if (chosen) result.push(chosen);
  }
  return result;
}

/** 校验画廊图片项结构 */
function isGalleryImage(value: unknown): value is GalleryImage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.url === "string" && typeof row.createdAt === "number";
}

/** 校验游戏历史项结构 */
function isGameEntry(value: unknown): value is GameEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.html === "string" &&
    typeof row.createdAt === "number"
  );
}
