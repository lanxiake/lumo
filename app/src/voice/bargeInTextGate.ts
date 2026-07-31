/**
 * bargeInTextGate — barge-in 文本字数门控
 *
 * 嘈杂 / 回声环境下：
 *  - 通用最少 2 汉字（final 发消息侧仍可用）
 *  - TTS 播放期打断要求至少 3 汉字，降低短回声误触
 */

/** 通用 barge-in / 有效文本最少汉字数 */
export const BARGE_IN_MIN_CHARS = 2;

/** TTS 播放期打断所需最少汉字数（更严） */
export const BARGE_IN_MIN_CHARS_WHILE_SPEAKING = 3;

/** 二次确认：首次合格 partial 到真正打断的最小间隔（250→150ms 降体感延迟） */
export const BARGE_IN_CONFIRM_MS = 150;

/** 归一化：去空白与常见标点 */
function normalizeForBargeIn(text: string): string {
  return text
    .replace(/[\s，,。.!！?？、；;：:\"'“”‘’（）()【】\[\]…—\-·]/g, "")
    .trim();
}

/**
 * 统计可用于 barge-in 判定的有效字数。
 * 优先计汉字；无汉字时回退去标点后长度。
 */
export function countBargeInChars(text: string): number {
  const s = normalizeForBargeIn(text);
  if (!s) return 0;
  const han = s.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (han > 0) return han;
  return s.length;
}

export interface MeetsBargeInMinCharsOptions {
  /** true：TTS 播放/AI 回复中的打断路径，用更严阈值 */
  readonly whileSpeaking?: boolean;
}

/** 是否达到打断 TTS 所需的最少字数 */
export function meetsBargeInMinChars(
  text: string,
  opts?: MeetsBargeInMinCharsOptions,
): boolean {
  const min = opts?.whileSpeaking ? BARGE_IN_MIN_CHARS_WHILE_SPEAKING : BARGE_IN_MIN_CHARS;
  return countBargeInChars(text) >= min;
}
