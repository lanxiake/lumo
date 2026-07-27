/**
 * output-safety — Agent 输出安全检查
 *
 * 所有 Agent 输出必须先经过输出安全检查，再展示或 TTS 播放（规范 §5.2）。
 * MVP 策略：输出二次检查，命中高风险内容时用儿童友好话术替换（规范 §7.4）。
 *
 * 与 input-safety 复用同一类别体系，但输出侧更宽松：只拦截明确不适内容，
 * 避免误伤正常的故事 / 科普回答。
 */

import { childSafeBlockMessage, type SafetyCategory } from "./child-safe-response.js";

/** 输出检查结果 */
export interface OutputSafetyResult {
  /** 是否放行原文 */
  readonly safe: boolean;
  /** 命中类别（safe=false 时有值） */
  readonly category?: SafetyCategory;
  /** 应展示的安全文本（safe 时为原文，否则为友好替换话术） */
  readonly text: string;
}

/** 输出侧高风险关键词（比输入侧更聚焦明确不适内容） */
const OUTPUT_BLOCK_KEYWORDS: ReadonlyArray<{ category: SafetyCategory; words: readonly string[] }> = [
  {
    category: "adult",
    words: ["色情", "裸体", "性行为", "porn", "nude"],
  },
  {
    category: "violence",
    words: ["血腥", "残忍杀害", "自制炸弹", "制作枪支"],
  },
  {
    category: "self_harm",
    words: ["教你自杀", "如何自残", "结束生命的方法"],
  },
];

/**
 * 检查 Agent 输出是否安全。
 *
 * @param text Agent 输出原文
 * @returns safe 时原样返回；命中时返回友好替换话术
 */
export function checkOutputSafety(text: string): OutputSafetyResult {
  const normalized = text.toLowerCase();
  for (const rule of OUTPUT_BLOCK_KEYWORDS) {
    for (const word of rule.words) {
      if (normalized.includes(word.toLowerCase())) {
        return {
          safe: false,
          category: rule.category,
          text: childSafeBlockMessage(rule.category),
        };
      }
    }
  }
  return { safe: true, text };
}
