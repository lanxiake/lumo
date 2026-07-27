/**
 * mobile-prompt-context-provider — 移动端提示词上下文供给（PromptContextProvider）
 *
 * 允许注入（规范 §3.4）：宠物人格、儿童称呼、最近会话摘要、本地短期记忆、
 * 当前时间/语言/平台、儿童安全规则。
 *
 * 禁止注入（规范 §3.4）：JWT、deviceToken、家长敏感信息、完整通讯录/定位/相册。
 *
 * soul 内容承载宠物人格 + 儿童称呼 + 儿童安全规则；skills 由 getSkills 供给。
 * 小主人档案支持运行时热更新（家长手动改记忆 / AI 增量），经 getSoulContentLive 注入每轮提示词。
 */

import type {
  PromptContextProvider,
  SkillInfo,
  CustomAgentInfo,
  UserDeviceInfo,
  McpServerHint,
  ContextFile,
} from "@lumo/agent-runtime";
import childPetPromptTemplate from "../prompts/child-pet.prompt.md?raw";
import { renderPromptTemplate } from "../prompts/render-prompt.js";
import type { ChildProfile } from "../bridge/schema.js";

export interface MobilePromptContextDeps {
  /** 宠物人格描述（人格设定，非敏感） */
  readonly petPersona: string;
  /** 角色名字（用户可自定义；覆盖 personaAddon 内置名字，供自称与回应） */
  readonly petName?: string;
  /** 模型专属的表情/动作标签与 persona 追加说明（来自 model-registry） */
  readonly personaAddon?: string;
  /** 儿童称呼（如"小明"，非敏感） */
  readonly childNickname?: string;
  /** 小主人档案（已收集的偏好与基础特征，注入提示词个性化对话） */
  readonly childProfile?: ChildProfile;
  /** 最近会话摘要（本地短期记忆，可选） */
  readonly recentSummary?: string;
  /** 平台标识（如 "kids-mobile/ios"） */
  readonly platform?: string;
  /** 语言（缺省 zh-CN） */
  readonly language?: string;
  /** 技能列表供给（skill_list/skill_search 用），未注入则空 */
  readonly getSkills?: () => readonly SkillInfo[];
}

/** 可热更新档案的 PromptContext 句柄 */
export interface MobilePromptContextHandle extends PromptContextProvider {
  /** 覆盖小主人档案并重建 soul 缓存 */
  setChildProfile(profile: ChildProfile | undefined): void;
  /** 同步读取当前 soul（供 setSystemPrompt 热刷新） */
  getSoulContentLive(): string;
}

/** 收集引导：始终附在档案后，提示 AI 在对话中自然补全缺失信息 */
const PROFILE_COLLECT_HINT =
  "在自然聊天中留意并逐步了解小主人的名字、年龄、性别、喜欢和不喜欢的东西、性格、学习状况等，" +
  "了解到新信息时用 `update_child_profile` 悄悄记下来（不要生硬盘问，更不要打断玩耍去查户口）。" +
  "根据已知信息投其所好地聊天。严禁询问或记录住址、电话、学校班级、家长联系方式等隐私。";

/** 把小主人档案格式化为提示词段落 */
function buildChildSection(nickname: string | undefined, profile: ChildProfile | undefined): string {
  const lines: string[] = [];
  const name = profile?.name ?? nickname;
  if (name) {
    lines.push(`- 名字/称呼：${name}（用亲切的称呼和 TA 说话，尊重名字，不拿名字开玩笑）`);
  }
  if (typeof profile?.age === "number") lines.push(`- 年龄：${profile.age} 岁（按这个年龄调整用词和话题深浅）`);
  if (profile?.gender) lines.push(`- 性别：${profile.gender}`);
  if (typeof profile?.heightCm === "number") lines.push(`- 身高：${profile.heightCm} 厘米`);
  if (profile?.likes && profile.likes.length > 0) lines.push(`- 喜欢：${profile.likes.join("、")}`);
  if (profile?.dislikes && profile.dislikes.length > 0) lines.push(`- 不喜欢：${profile.dislikes.join("、")}`);
  if (profile?.personality) lines.push(`- 性格：${profile.personality}`);
  if (profile?.learning) lines.push(`- 学习状况：${profile.learning}`);

  if (lines.length === 0) {
    return `目前还不太了解小主人，先用"小朋友""小主人"等亲切称呼交流。\n\n${PROFILE_COLLECT_HINT}`;
  }
  // 显式要求按已知档案回答身份问题，避免模型把「我叫什么」答成宠物名或假装不认识。
  const answerKnownHint =
    "当小主人问「我叫什么」「我多少岁」「你知道我是男孩还是女孩吗」等时，" +
    "请根据上面已知信息直接、准确地回答，不要说不知道或还没了解；" +
    "小主人问的是 TA 自己的名字/年龄，不是你的名字。";
  return `你已经了解到关于小主人的信息：\n${lines.join("\n")}\n\n${answerKnownHint}\n\n${PROFILE_COLLECT_HINT}`;
}

/** 近期摘要段落 */
function buildRecentSummarySection(summary: string | undefined): string {
  if (!summary || summary.trim().length === 0) {
    return "暂无近期对话记忆。";
  }
  return summary.trim();
}

/** 构造 soul 内容：基于结构化模板填充动态字段，并追加模型专属标签说明 */
function buildSoulContent(deps: MobilePromptContextDeps): string {
  const base = renderPromptTemplate(childPetPromptTemplate, {
    petIdentity: deps.petPersona,
    childSection: buildChildSection(deps.childNickname, deps.childProfile),
    recentSummary: buildRecentSummarySection(deps.recentSummary),
    language: deps.language ?? "zh-CN",
    platform: deps.platform ?? "kids-mobile",
    currentTime: new Date().toISOString(),
  });
  const addon = deps.personaAddon?.trim();
  const withAddon = addon ? `${base}\n\n---\n\n${addon}` : base;
  const name = deps.petName?.trim();
  // 用户自定义名字优先级最高：放在最后覆盖 personaAddon 里的内置名字。
  const nameDirective = name
    ? `\n\n---\n\n你的名字叫「${name}」。小主人给你取了这个名字，请以此自称，被问到叫什么时回答「${name}」，忽略前文其它自称。`
    : "";
  return `${withAddon}${nameDirective}`;
}

/**
 * 创建移动端 PromptContextProvider（支持档案热更新）。
 *
 * customAgents / userDevices / mcpHints / contextFiles 均为空（移动端不暴露
 * 设备列表 / MCP / 本地文件；避免泄漏隐私）。
 */
export function createMobilePromptContextProvider(
  deps: MobilePromptContextDeps,
): MobilePromptContextHandle {
  let current: MobilePromptContextDeps = { ...deps };
  let soul = buildSoulContent(current);
  const getSkills = deps.getSkills;

  return {
    getSkills: async () => (getSkills ? getSkills() : ([] as readonly SkillInfo[])),
    getCustomAgents: async () => [] as readonly CustomAgentInfo[],
    getUserDevices: async () => [] as readonly UserDeviceInfo[],
    getSoulContent: async () => soul,
    getSoulContentLive: () => soul,
    getContextFiles: () => [] as readonly ContextFile[],
    getMcpServerHints: () => [] as readonly McpServerHint[],
    setChildProfile(profile: ChildProfile | undefined): void {
      current = { ...current, childProfile: profile };
      soul = buildSoulContent(current);
    },
  };
}
