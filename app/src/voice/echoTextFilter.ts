/**
 * echoTextFilter — 弱回声文本过滤（Phase 4 lite）
 *
 * 将 STT 结果与最近一段 TTS 文本比对：若高度相似/被包含，视为扬声器回声而非用户插话。
 *
 * 真机常见失败形态：
 *  - 叠字：你好你好呀
 *  - 语气词前缀：哇你好… / 嗯嗯嗯小佳佳…
 *  - 单字抖音：佳佳佳佳佳
 *  → sanitize 后再做包含 / 覆盖率 / 子序列判定。
 */

/** 句首常见语气/填充（回声 ASR 常带） */
const LEADING_FILLERS_RE = /^[哇嗯喂啊呃哦噢嘿哈欸诶唔哼呐哟喔]+/u;

/** 归一化：去空白与常见标点，小写（对中文无影响） */
export function normalizeEchoText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s，,。.!！?？、；;：:\"'“”‘’（）()【】\[\]…—\-]/g, "")
    .trim();
}

/**
 * 折叠连续重复片段：你好你好呀 → 你好呀；哎呀哎呀哎呀 → 哎呀。
 */
export function collapseRepeatedChunks(s: string): string {
  let result = s;
  for (let guard = 0; guard < 24; guard += 1) {
    let changed = false;
    for (let len = Math.floor(result.length / 2); len >= 1; len -= 1) {
      const re = new RegExp(`(.{${len}})\\1+`, "u");
      const next = result.replace(re, "$1");
      if (next.length < result.length) {
        result = next;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return result;
}

/** 折叠连续同一字符：佳佳佳佳 → 佳；嗯嗯嗯 → 嗯 */
export function collapseCharStutter(s: string): string {
  return s.replace(/(.)\1+/gu, "$1");
}

/**
 * 回声比对用清洗：去标点 → 去句首语气词 → 折叠短语叠字 → 折叠单字抖音。
 */
export function sanitizeForEchoCompare(text: string): string {
  let s = normalizeEchoText(text);
  s = s.replace(LEADING_FILLERS_RE, "");
  s = collapseRepeatedChunks(s);
  s = collapseCharStutter(s);
  return s;
}

/**
 * STT 有多少比例字符能按顺序在 TTS 中找到（子序列匹配）。
 */
export function subsequenceRatio(stt: string, tts: string): number {
  if (!stt) return 1;
  if (!tts) return 0;
  let j = 0;
  let matched = 0;
  for (let i = 0; i < stt.length; i += 1) {
    const ch = stt[i]!;
    while (j < tts.length && tts[j] !== ch) j += 1;
    if (j < tts.length && tts[j] === ch) {
      matched += 1;
      j += 1;
    }
  }
  return matched / stt.length;
}

/**
 * 最长公共子串（STT 与 TTS）。短中文串上 O(n²) 可接受。
 */
export function longestCommonSubstring(a: string, b: string): string {
  if (!a || !b) return "";
  let best = "";
  for (let i = 0; i < a.length; i += 1) {
    for (let len = best.length + 1; i + len <= a.length; len += 1) {
      const sub = a.slice(i, i + len);
      if (b.includes(sub)) best = sub;
      else break;
    }
  }
  return best;
}

/**
 * 计算字符 bigram Jaccard 相似度（0~1）。
 */
export function bigramJaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const grams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const g of ga) {
    if (gb.has(g)) inter += 1;
  }
  const union = ga.size + gb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * STT bigram 有多少比例出现在 TTS 中（单向覆盖率）。
 */
export function bigramCoverage(stt: string, tts: string): number {
  if (!stt || !tts) return 0;
  if (stt.length < 2) return tts.includes(stt) ? 1 : 0;
  let total = 0;
  let hit = 0;
  for (let i = 0; i < stt.length - 1; i += 1) {
    total += 1;
    if (tts.includes(stt.slice(i, i + 2))) hit += 1;
  }
  return total === 0 ? 0 : hit / total;
}

/**
 * 计算「折叠压缩率」：文本经叠字/重复短语折叠后缩短的比例（0~1）。
 *
 * 语种无关思路：ASR 把粤语/方言音硬套普通话音素时，常吐出高度重复的串
 * （如「嘿嘿嘿嘿姐姐姐姐姐姐…改改改」）。真人说话极少这样结巴，
 * 因此高压缩率是「扬声器回声 / ASR 幻觉」的强信号，且完全不依赖 TTS 文本。
 *
 * @param text 原始 STT 文本
 * @returns 压缩率，越接近 1 表示重复越严重
 */
export function repetitionCollapseRatio(text: string): number {
  const s = normalizeEchoText(text);
  if (s.length < 4) return 0;
  const collapsed = collapseCharStutter(collapseRepeatedChunks(s));
  if (!collapsed) return 1;
  return 1 - collapsed.length / s.length;
}

/**
 * 判断文本是否为「重度重复回声」（语种无关）。
 *
 * 用于跨语种 / 方言场景：此时 TTS 文本与 STT 无法比相似度，
 * 改用文本自身的重复特征识别回声。
 *
 * @param text STT 文本
 * @param opts.minLength 生效的最小归一化长度（默认 4，短句不判，避免误杀）
 * @param opts.ratioThreshold 压缩率阈值（默认 0.4）
 * @returns 是否判为重度重复回声
 */
export function hasHeavyRepetition(
  text: string,
  opts?: { readonly minLength?: number; readonly ratioThreshold?: number },
): boolean {
  const minLength = opts?.minLength ?? 4;
  const ratioThreshold = opts?.ratioThreshold ?? 0.4;
  const s = normalizeEchoText(text);
  if (s.length < minLength) return false;
  return repetitionCollapseRatio(text) >= ratioThreshold;
}

export interface LooksLikeEchoOptions {
  /** bigram 重叠阈值 */
  readonly jaccardThreshold?: number;
  /** STT→TTS bigram 覆盖率阈值 */
  readonly coverageThreshold?: number;
  /** 子序列匹配阈值 */
  readonly subsequenceThreshold?: number;
  /** STT 最短有效长度，默认 2 */
  readonly minSttLength?: number;
  /**
   * barge：打断路径（偏松，避免挡真插话；依赖能量门控）
   * final：定稿路径（偏严，避免回声进对话）
   */
  readonly profile?: "barge" | "final";
}

/**
 * 判断 STT 文本是否像是 TTS 回声。
 */
export function looksLikeTtsEcho(
  sttText: string,
  ttsText: string,
  opts?: LooksLikeEchoOptions,
): boolean {
  const profile = opts?.profile ?? "final";
  const threshold = opts?.jaccardThreshold ?? (profile === "barge" ? 0.65 : 0.55);
  const coverageThreshold = opts?.coverageThreshold ?? (profile === "barge" ? 0.85 : 0.75);
  const subseqThreshold = opts?.subsequenceThreshold ?? (profile === "barge" ? 0.85 : 0.72);
  const minLen = opts?.minSttLength ?? 2;

  const rawA = normalizeEchoText(sttText);
  const b = normalizeEchoText(ttsText);
  if (!rawA || !b || rawA.length < minLen) return false;

  if (b.includes(rawA)) return true;
  if (rawA.includes(b) && b.length >= minLen) return true;

  const a = sanitizeForEchoCompare(sttText);
  if (!a || a.length < minLen) {
    return true;
  }

  if (b.includes(a)) return true;
  if (a.includes(b) && b.length >= minLen) return true;

  const collapsedOnly = collapseRepeatedChunks(rawA.replace(LEADING_FILLERS_RE, ""));
  if (collapsedOnly.length >= minLen && b.includes(collapsedOnly)) return true;

  if (bigramJaccard(a, b) >= threshold) return true;
  if (bigramJaccard(rawA, b) >= threshold) return true;

  if (bigramCoverage(a, b) >= coverageThreshold) return true;

  if (subsequenceRatio(a, b) >= subseqThreshold) return true;

  // final 路径额外：叠字 + LCS，挡住「小佳佳佳佳…」类回声定稿
  if (profile === "final") {
    const stem = normalizeEchoText(sttText).replace(LEADING_FILLERS_RE, "");
    if (stem.length >= minLen) {
      const lcs = longestCommonSubstring(stem, b);
      const ratio = lcs.length / stem.length;
      if (lcs.length >= 5) return true;
      if (lcs.length >= 3 && ratio >= 0.35) return true;
      if (lcs.length >= 3 && (/(.)\1{2,}/u.test(stem) || collapseRepeatedChunks(stem) !== stem)) {
        return true;
      }
    }
  }

  return false;
}
