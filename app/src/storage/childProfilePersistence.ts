/**
 * childProfilePersistence — 小主人档案本地持久化
 *
 * AI 在对话中收集到的小主人偏好/特征存 SecureStorage（SharedPreferences）JSON，
 * 重启后恢复并在 init 时注入提示词。只存非敏感偏好——不存住址/电话/证件等隐私。
 */

import type { SecureStorage } from "../auth/secureStorage";
import type { ChildProfile } from "../../node-runtime/src/bridge/schema";

export const CHILD_PROFILE_KEY = "kids.childProfile";

/** 档案是否含有至少一项有效信息（用于判断是否需要注入 / 补发 init）。 */
export function profileHasContent(profile: ChildProfile): boolean {
  if (profile.name?.trim()) return true;
  if (typeof profile.age === "number") return true;
  if (profile.gender) return true;
  if (typeof profile.heightCm === "number") return true;
  if (profile.likes && profile.likes.length > 0) return true;
  if (profile.dislikes && profile.dislikes.length > 0) return true;
  if (profile.personality?.trim()) return true;
  if (profile.learning?.trim()) return true;
  return false;
}

/** 从本地读取档案；无或损坏时返回空档案。 */
export async function loadChildProfile(storage: SecureStorage): Promise<ChildProfile> {
  const raw = await storage.getItem(CHILD_PROFILE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeProfile(parsed);
  } catch {
    return {};
  }
}

/** 覆盖写入档案。 */
export async function saveChildProfile(
  storage: SecureStorage,
  profile: ChildProfile,
): Promise<void> {
  await storage.setItem(CHILD_PROFILE_KEY, JSON.stringify(profile));
}

/**
 * 将增量 patch 合并进已存档案并持久化，返回合并后的完整档案。
 * likes/dislikes 数组按去重并集追加（保留已有 + 新增），其余字段以 patch 覆盖。
 */
export async function mergeChildProfile(
  storage: SecureStorage,
  patch: ChildProfile,
): Promise<ChildProfile> {
  const current = await loadChildProfile(storage);
  const merged = mergeProfile(current, sanitizeProfile(patch));
  await saveChildProfile(storage, merged);
  return merged;
}

/** 纯合并逻辑（无 IO），便于单测。 */
export function mergeProfile(current: ChildProfile, patch: ChildProfile): ChildProfile {
  const merged: ChildProfile = {
    ...current,
    ...stripUndefined(patch),
    likes: unionArrays(current.likes, patch.likes),
    dislikes: unionArrays(current.dislikes, patch.dislikes),
  };
  // 若合并后数组为空则删除该键，保持档案干净
  return stripEmptyArrays(merged);
}

/** 去重并集，两侧皆空时返回 undefined（由 stripEmptyArrays 清理） */
function unionArrays(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!a && !b) return undefined;
  const set = new Set<string>();
  for (const x of a ?? []) if (x.trim()) set.add(x.trim());
  for (const x of b ?? []) if (x.trim()) set.add(x.trim());
  return set.size > 0 ? Array.from(set) : undefined;
}

function stripUndefined(p: ChildProfile): ChildProfile {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as ChildProfile;
}

function stripEmptyArrays(p: ChildProfile): ChildProfile {
  const out = { ...p } as Record<string, unknown>;
  if (Array.isArray(out.likes) && out.likes.length === 0) delete out.likes;
  if (Array.isArray(out.dislikes) && out.dislikes.length === 0) delete out.dislikes;
  return out as ChildProfile;
}

/** 校验/清洗外部数据，只保留已知字段与合法类型。 */
function sanitizeProfile(value: unknown): ChildProfile {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof row.name === "string") out.name = row.name;
  if (typeof row.age === "number" && Number.isFinite(row.age)) out.age = row.age;
  if (row.gender === "男孩" || row.gender === "女孩" || row.gender === "保密") out.gender = row.gender;
  if (typeof row.heightCm === "number" && Number.isFinite(row.heightCm)) out.heightCm = row.heightCm;
  if (Array.isArray(row.likes)) out.likes = row.likes.filter((x): x is string => typeof x === "string");
  if (Array.isArray(row.dislikes)) out.dislikes = row.dislikes.filter((x): x is string => typeof x === "string");
  if (typeof row.personality === "string") out.personality = row.personality;
  if (typeof row.learning === "string") out.learning = row.learning;
  return stripEmptyArrays(out as ChildProfile);
}
