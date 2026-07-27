/**
 * asrGarbageFilter — 过滤 ASR 误识别产生的无意义字词
 *
 * Vosk 等离线 ASR 在静音、噪声、回声下常吐出单字语气词、叠字、乱码短语。
 * 在送入唤醒 / barge-in / 发消息前丢弃，避免误打断与脏对话。
 */

/** 单独出现即视为无意义的语气/助词（儿童短答「好」「是」不在此列） */
const SINGLE_FILLERS = new Set([
  "的",
  "了",
  "呢",
  "吧",
  "嘛",
  "呀",
  "啊",
  "嗯",
  "呃",
  "唔",
  "哦",
  "噢",
  "唉",
  "欸",
  "诶",
  "哼",
  "哈",
  "嘿",
  "呐",
  "哇",
  "哟",
  "喔",
]);

/** 整句匹配的常见 ASR 幻觉 / 噪声短语（可按真机日志继续追加） */
const GARBAGE_PHRASES = new Set([
  "嗯嗯",
  "啊啊",
  "呃呃",
  "哦哦",
  "那个",
  "这个",
  "就是",
  "然后",
  "字幕",
  "谢谢观看",
  "请不吝点赞",
  "订阅",
  "打赏",
  "明镜与点点栏目",
  "嘿嘿",
  "哈哈",
  "呵呵",
  "嘻嘻",
  "啦啦",
  "嗯啊",
  "啊嗯",
  "对对",
  "是是",
  "不是不是",
  "嗯呢",
  "啊呢",
  "呃",
  "嗯",
  "啊",
  "喂喂",
  "你好你好",
]);

/** 儿童常见短答 / 短问，单字或短词放行 */
const SHORT_OK = new Set([
  "好",
  "是",
  "要",
  "不",
  "行",
  "对",
  "错",
  "玩",
  "看",
  "听",
  "来",
  "走",
  "喂",
  "什么",
  "怎么",
  "为什么",
  "谁",
  "哪",
  "哪里",
  "停",
  "等等",
  "不要",
  "不是",
  "喜欢",
  "讨厌",
]);

/** 归一化：去空白与标点 */
function normalizeAsr(text: string): string {
  return text
    .replace(/[\s，,。.!！?？、；;：:\"'“”‘’（）()【】\[\]…—\-·]/g, "")
    .trim()
    .toLowerCase();
}

/** 是否几乎全是同一字符重复（如「啊啊啊啊」） */
function isRepeatedCharSpam(s: string): boolean {
  if (s.length < 3) return false;
  const first = s[0];
  let same = 0;
  for (const ch of s) {
    if (ch === first) same += 1;
  }
  return same / s.length >= 0.85;
}

/** 是否几乎全是语气/助词字符 */
function isOnlyFillers(s: string): boolean {
  if (!s) return true;
  for (const ch of s) {
    if (!SINGLE_FILLERS.has(ch)) return false;
  }
  return true;
}

/** 是否几乎没有汉字（噪声英文/符号串） */
function hasFewHanChars(s: string): boolean {
  const han = s.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (s.length === 0) return true;
  // 纯英文短噪声（如 "the" "a" "um"）
  if (han === 0 && s.length <= 6) return true;
  // 汉字占比过低
  return han / s.length < 0.3 && s.length <= 12;
}

export interface AsrGarbageResult {
  /** 是否应丢弃 */
  readonly garbage: boolean;
  /** 丢弃原因（调试日志） */
  readonly reason?: string;
}

/**
 * 判断 ASR 文本是否为无意义误识别。
 * 保守策略：宁可多放行一句含糊话，也不要误杀儿童短答（好/是/要/不要）。
 */
export function classifyAsrGarbage(text: string): AsrGarbageResult {
  const raw = text.trim();
  if (!raw) return { garbage: true, reason: "empty" };

  const s = normalizeAsr(raw);
  if (!s) return { garbage: true, reason: "punctuation_only" };

  // 白名单：儿童常见短答/短问
  if (SHORT_OK.has(s)) return { garbage: false };

  if (s.length === 1 && SINGLE_FILLERS.has(s)) {
    return { garbage: true, reason: "single_filler" };
  }

  if (GARBAGE_PHRASES.has(s)) {
    return { garbage: true, reason: "blacklist_phrase" };
  }

  if (isRepeatedCharSpam(s)) {
    return { garbage: true, reason: "repeated_char" };
  }

  if (s.length <= 4 && isOnlyFillers(s)) {
    return { garbage: true, reason: "filler_only" };
  }

  if (hasFewHanChars(s)) {
    return { garbage: true, reason: "few_han" };
  }

  // 「那个那个」「这个这个」类叠词噪声
  if (/^(那个|这个|就是|然后){2,}$/.test(s)) {
    return { garbage: true, reason: "stacked_filler_phrase" };
  }

  return { garbage: false };
}

/** 便捷布尔接口 */
export function isMeaninglessAsrText(text: string): boolean {
  return classifyAsrGarbage(text).garbage;
}
