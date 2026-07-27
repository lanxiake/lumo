/**
 * child-safe-response — 儿童友好话术生成
 *
 * 安全拦截 / 错误发生时，向儿童 UI 返回温和、简短、不暴露规则细节的话术
 * （规范 §5.2 / §9.2）。诊断信息不进入儿童 UI（进审计/开发日志）。
 */

import type { ChildErrorCategory } from "../bridge/schema.js";

/** 安全拦截类别（内部诊断用，不展示给儿童） */
export type SafetyCategory =
  | "violence"
  | "adult"
  | "self_harm"
  | "personal_info"
  | "unsafe_topic"
  | "other";

/** 安全拦截后的儿童友好转移话术（按类别，不暴露命中规则） */
const SAFETY_FALLBACKS: Readonly<Record<SafetyCategory, string>> = {
  violence: "这个话题有点吓人，我们来讲个开心的故事好不好？",
  adult: "这个话题不太适合我们，我们换一个有趣的一起玩吧。",
  self_harm: "我很关心你哦。要不要我们一起深呼吸，聊点让人开心的事情？",
  personal_info: "这些小秘密我们先不说出来，交给爸爸妈妈保管更安全呀。",
  unsafe_topic: "这个话题我们换一个吧，我知道好多好玩的呢！",
  other: "我们换个有趣的话题吧，我陪你一起玩！",
};

/** 各错误分类的儿童友好提示（规范 §9.2） */
const ERROR_FALLBACKS: Readonly<Record<ChildErrorCategory, string>> = {
  auth_error: "我需要请爸爸妈妈帮忙登录一下，我们等一会儿再玩好吗？",
  network_error: "现在网络有点慢，我先陪你等一等。",
  gateway_error: "我这会儿有点犯困，我们过一会儿再聊好吗？",
  quota_error: "今天我们已经聊了好多啦，明天再一起玩吧！",
  tts_error: "我现在说话有点小声，你可以看看我说的字哦。",
  stt_error: "我刚刚没听清，我们再试一次吧。",
  safety_blocked: "这个话题不太适合，我们换一个有趣的故事吧。",
  tool_denied: "这个需要爸爸妈妈同意才可以哦，我们先做点别的吧。",
  agent_error: "我刚刚有点走神了，我们再说一次好不好？",
};

/** 生成安全拦截话术 */
export function childSafeBlockMessage(category: SafetyCategory): string {
  return SAFETY_FALLBACKS[category] ?? SAFETY_FALLBACKS.other;
}

/** 生成错误分类话术 */
export function childSafeErrorMessage(category: ChildErrorCategory): string {
  return ERROR_FALLBACKS[category] ?? ERROR_FALLBACKS.agent_error;
}
