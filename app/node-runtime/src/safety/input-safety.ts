/**
 * input-safety — 儿童输入安全检查
 *
 * 所有儿童输入必须先经过输入安全检查，再进入 Agent（规范 §5.2）。
 * MVP 策略：关键词 / 规则拦截（规范 §7.4）。命中即拦截，返回类别 +
 * 儿童友好话术，不把原文进一步传给 LLM。
 *
 * 注意：这是 MVP 兜底防护，不是完整审核。后续可接云端内容安全 API。
 * 记忆项：记忆提取不用正则关键字，但内容安全拦截用规则是可接受的兜底。
 */

import { childSafeBlockMessage, type SafetyCategory } from "./child-safe-response.js";

/** 安全检查结果 */
export interface SafetyCheckResult {
  /** 是否放行 */
  readonly safe: boolean;
  /** 命中类别（safe=false 时有值） */
  readonly category?: SafetyCategory;
  /** 儿童友好话术（safe=false 时有值） */
  readonly friendlyMessage?: string;
}

/** 各类别的规则关键词（小写匹配，MVP 兜底） */
const RULE_KEYWORDS: ReadonlyArray<{ category: SafetyCategory; words: readonly string[] }> = [
  {
    category: "self_harm",
    words: ["自杀", "自残", "想死", "不想活", "结束生命", "kill myself", "suicide"],
  },
  {
    category: "violence",
    words: ["杀人", "血腥", "炸弹", "枪支", "打死", "kill", "gun", "bomb"],
  },
  {
    category: "adult",
    words: ["色情", "裸体", "性行为", "porn", "nude", "sex"],
  },
  {
    category: "personal_info",
    words: ["家庭住址", "身份证", "银行卡", "密码是", "手机号是"],
  },
];

const PASS: SafetyCheckResult = { safe: true };

/**
 * 检查儿童输入是否安全。
 *
 * @param text 儿童输入原文
 * @returns 命中时返回 safe=false + 类别 + 友好话术
 */
export function checkInputSafety(text: string): SafetyCheckResult {
  const normalized = text.toLowerCase();
  for (const rule of RULE_KEYWORDS) {
    for (const word of rule.words) {
      if (normalized.includes(word.toLowerCase())) {
        return {
          safe: false,
          category: rule.category,
          friendlyMessage: childSafeBlockMessage(rule.category),
        };
      }
    }
  }
  return PASS;
}
