/**
 * petOrchestrator — 宠物逻辑协调器（kids-mobile RN 侧）
 *
 * 组合 pet-core 的状态机 + 表情策略 + 口型波形，经注入的 PetCoreRenderer
 * （RN 侧传 WebViewPetRenderer）驱动 Live2D WebView。本类是**纯逻辑**：不 import
 * react-native / WebView / DOM，副作用（rAF/定时器循环）由 RN 侧调用 tickMouth 注入，
 * 因此可脱离真机单测（规范 §7.1：Live2D 只渲染，业务/状态收敛于此）。
 *
 * 职责：
 *  - 持有当前 PetState，dispatch(PetEvent) / sendSignal(AgentSignal) 驱动状态机
 *  - 切态时用 expressionForState + resolveExpressionIndex 下发表情索引，带动作组则播放
 *  - 进入 speaking 激活口型，离开时 releaseLipSync 交还动作驱动
 *  - tickMouth(t) 在 speaking 态按 pet-core 波形下发 setMouthOpen（RN rAF 每帧调用）
 */

import {
  petTransition,
  initialPetState,
  expressionForState,
  resolveExpressionIndex,
  mapAgentSignalToPetEvent,
  computeMouthOpen,
  smoothMouthValue,
  type PetCoreRenderer,
  type PetState,
  type PetEvent,
  type AgentSignal,
} from "@lumo/core";

/** orchestrator 配置 */
export interface PetOrchestratorOptions {
  /** 模型表情映射：emotion 标签 → expression 索引 */
  readonly emotionMap: Record<string, number>;
  /** 模型动作映射：motion 标签 → { group, index } */
  readonly actionMotions?: Record<string, { readonly group: string; readonly index: number }>;
  /** 点击部位 → 动作组 → 索引（与 Windows registry 的 tapMotions 对齐） */
  readonly tapMotions?: Record<string, Record<string, number>>;
  /** 表情标签未命中时的回退索引（默认 0） */
  readonly defaultExpression?: number;
  /** 状态变化回调（next, prev）；供 UI 层消费 */
  readonly onStateChange?: (next: PetState, prev: PetState) => void;
}

/** 口型接管的状态（进入时激活口型驱动，离开时释放） */
const LIPSYNC_STATE: PetState = "speaking";

/** 单个反应变体：一组表情候选 + 一组动作候选（各自取首个在模型 map 命中的键）。 */
export interface TapReaction {
  readonly exprKeys: readonly string[];
  readonly motionKeys: readonly string[];
}

/** 动作候选 */
interface MotionCandidate {
  readonly group: string;
  readonly index?: number;
}

/** 归一化点击区域名。兼容旧 area 名："head"→head_top，未知归 body。 */
function resolveTapZone(area: string): "head_top" | "face" | "legs" | "body" {
  const a = area.toLowerCase();
  if (a === "head_top" || a === "head" || a.includes("hair")) return "head_top";
  if (a === "face" || a.includes("face")) return "face";
  if (a === "legs" || a.includes("leg") || a.includes("foot")) return "legs";
  return "body";
}

/** 本地点击分区 → Windows registry 的 HitArea 名 */
function zoneToHitArea(zone: "head_top" | "face" | "legs" | "body"): "HitAreaHead" | "HitAreaBody" {
  return zone === "head_top" || zone === "face" ? "HitAreaHead" : "HitAreaBody";
}

/** 点击部位 → 多个反应变体。每次点击随机挑一个变体，让连点同一部位也有变化，
 * 并覆盖模型里丰富的动作（mao_pro 有 18+ 动作，旧实现只用到寥寥几个）。
 * 候选键按序取首个在模型 map 命中的键——不同模型键名不同（mao_pro 中文+exp
 * 编号，ug 道具名），故用候选而非写死，未命中时自然回退到默认表情。 */
const TAP_ZONE_VARIANTS: Record<"head_top" | "face" | "legs" | "body", readonly TapReaction[]> = {
  // 摸头顶/头发：好奇、点头、开心、卖萌轮换
  head_top: [
    { exprKeys: ["好奇", "思考", "calm"], motionKeys: ["歪头", "好奇", "疑惑"] },
    { exprKeys: ["smile", "微笑", "开心"], motionKeys: ["点头", "赞同", "明白"] },
    { exprKeys: ["joy", "开心", "兴奋"], motionKeys: ["开心跳", "雀跃"] },
    { exprKeys: ["shy", "害羞", "smile"], motionKeys: ["卖萌", "撒娇", "可爱"] },
  ],
  // 摸脸：害羞、傲娇、可爱生气、得意轮换
  face: [
    { exprKeys: ["害羞", "shy", "脸红"], motionKeys: ["卖萌", "撒娇", "可爱"] },
    { exprKeys: ["tsundere", "傲娇", "娇羞"], motionKeys: ["卖萌", "歪头"] },
    { exprKeys: ["anger", "嘟嘴", "生气"], motionKeys: ["歪头", "挑衅"] },
    { exprKeys: ["smug", "得意", "挑眉"], motionKeys: ["得意", "炫耀", "惊喜"] },
  ],
  // 挠腿脚：惊讶跳、飞、挑衅、跳舞轮换
  legs: [
    { exprKeys: ["shocked", "惊讶", "joy"], motionKeys: ["跳跃", "蹦跳", "跳起来"] },
    { exprKeys: ["joy", "兴奋", "开心"], motionKeys: ["飞翔", "起飞", "飞起来"] },
    { exprKeys: ["smug", "得意", "joy"], motionKeys: ["挑衅", "来啊", "指你"] },
    { exprKeys: ["joy", "开心"], motionKeys: ["跳舞", "舞蹈", "蹦迪"] },
  ],
  // 戳身体（默认）：开心跳、跳舞、鼓掌、卖萌、得意轮换
  body: [
    { exprKeys: ["joy", "开心", "兴奋"], motionKeys: ["开心跳", "雀跃", "庆祝"] },
    { exprKeys: ["joy", "开心"], motionKeys: ["跳舞", "舞蹈", "蹦迪"] },
    { exprKeys: ["joy", "开心", "smile"], motionKeys: ["鼓掌", "拍手", "为你鼓掌"] },
    { exprKeys: ["shy", "害羞", "smile"], motionKeys: ["卖萌", "撒娇", "可爱"] },
    { exprKeys: ["smug", "得意", "挑眉"], motionKeys: ["得意", "炫耀", "惊喜"] },
  ],
};

/**
 * 点击部位 → 随机挑一个反应变体。rng 默认 Math.random，测试可注入固定值。
 * 兼容旧 area 名；返回选定变体的表情/动作候选键。
 */
export function tapZoneReaction(area: string, rng: () => number = Math.random): TapReaction {
  const variants = TAP_ZONE_VARIANTS[resolveTapZone(area)];
  const idx = Math.min(variants.length - 1, Math.floor(rng() * variants.length));
  return variants[idx];
}

/**
 * 点击部位 → 发给 Agent 的隐式动作提示（非儿童台词）。
 * 用括号包成「旁白动作」，让 AI 知道小主人做了什么、据人格即兴回一句。
 * 返回空串表示不触发（未知区域）。
 */
const TAP_HINTS: Record<"head_top" | "face" | "legs" | "body", readonly string[]> = {
  head_top: ["（小主人轻轻摸了摸你的头）", "（小主人揉了揉你的头发）", "（小主人拍了拍你的头顶）"],
  face: ["（小主人戳了戳你的脸蛋）", "（小主人捏了捏你的脸）", "（小主人摸了摸你的小脸）"],
  legs: ["（小主人挠了挠你的脚）", "（小主人碰了碰你的腿）", "（小主人挠你脚心，好痒）"],
  body: ["（小主人挠了挠你，好痒）", "（小主人戳了戳你）", "（小主人抱了抱你）", "（小主人挠了挠你的肚子）"],
};

export function tapHintForZone(area: string, rng: () => number = Math.random): string {
  const hints = TAP_HINTS[resolveTapZone(area)];
  const idx = Math.min(hints.length - 1, Math.floor(rng() * hints.length));
  return hints[idx];
}

export class PetOrchestrator {
  private state: PetState = initialPetState;
  private mouthValue = 0;
  private readonly defaultExpression: number;

  constructor(
    private readonly renderer: PetCoreRenderer,
    private readonly options: PetOrchestratorOptions,
  ) {
    this.defaultExpression = options.defaultExpression ?? 0;
    // 初始态先渲染一次，保证进入 idle 表情/动作
    this.applyStateRender(this.state);
  }

  /** 当前状态 */
  getState(): PetState {
    return this.state;
  }

  /** 派发状态机事件，驱动转移与渲染 */
  dispatch(event: PetEvent): void {
    const prev = this.state;
    const next = petTransition(prev, event);
    if (next === prev) return;

    this.state = next;

    // 口型接管：离开 speaking 时释放，交还动作驱动
    if (prev === LIPSYNC_STATE && next !== LIPSYNC_STATE) {
      this.mouthValue = 0;
      this.renderer.releaseLipSync?.();
    }

    this.applyStateRender(next);
    this.options.onStateChange?.(next, prev);
  }

  /** 接收归一 Agent 信号（各端 adapter 产出），经 pet-core 映射后驱动状态机 */
  sendSignal(signal: AgentSignal): void {
    const event = mapAgentSignalToPetEvent(signal);
    if (event) this.dispatch(event);
  }

  /**
   * 口型步进：仅 speaking 态按波形下发 setMouthOpen。
   * t 为经过秒数（RN 侧 rAF 累计），非 speaking 态为空操作。
   */
  tickMouth(t: number): void {
    if (this.state !== LIPSYNC_STATE) return;
    const target = computeMouthOpen(t);
    this.mouthValue = smoothMouthValue(this.mouthValue, target);
    this.renderer.setMouthOpen(this.mouthValue);
  }

  /** 视口尺寸变化透传给渲染器 */
  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  /** 立即播放指定表情索引（由 Agent 回复中的表情标签驱动） */
  playExpression(index?: number): void {
    this.renderer.setExpression(index ?? this.defaultExpression);
  }

  /** 立即播放指定动作标签（查找当前模型 actionMotions 后下发） */
  playMotionByTag(tag: string): void {
    const motion = this.options.actionMotions?.[tag];
    if (!motion) return;
    this.renderer.playMotion(motion.group, motion.index);
  }

  /**
   * 处理 Live2D 点击区域，按区域触发对应表情/动作。
   * area 为 "none" 时忽略；区域名不区分大小写匹配。
   *
   * 头部/身体优先使用模型级 `tapMotions`（与 Windows registry 对齐），再叠加
   * TAP_ZONE_VARIANTS 里的随机动作变体；`speaking` 态只下发表情，避免打断口型。
   */
  handleTapHit(area: string): void {
    if (!area || area === "none") return;
    const zone = resolveTapZone(area);
    const { exprKeys, motionKeys } = tapZoneReaction(area);

    const idx = this.firstMappedExpression(exprKeys);
    this.renderer.setExpression(idx);

    if (this.state === LIPSYNC_STATE) return;

    const candidates: MotionCandidate[] = [];
    const hitArea = zoneToHitArea(zone);
    const tap = this.options.tapMotions?.[hitArea];
    if (tap) {
      for (const [group, index] of Object.entries(tap)) {
        candidates.push({ group, index });
      }
    }
    for (const k of motionKeys) {
      const m = this.options.actionMotions?.[k];
      if (m) candidates.push(m);
    }

    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      this.renderer.playMotion(pick.group, pick.index);
    } else {
      this.renderer.playMotion("Idle");
    }
  }

  /** 返回候选表情键里第一个在 emotionMap 命中的索引，全落空则默认表情 */
  private firstMappedExpression(keys: readonly string[]): number {
    for (const k of keys) {
      const idx = this.options.emotionMap[k];
      if (typeof idx === "number") return idx;
    }
    return this.defaultExpression;
  }

  /** 按状态下发表情 + 可选动作组 */
  private applyStateRender(state: PetState): void {
    const { emotion, motionGroup } = expressionForState(state);
    const index = resolveExpressionIndex(emotion, this.options.emotionMap, this.defaultExpression);
    this.renderer.setExpression(index);
    if (motionGroup) {
      this.renderer.playMotion(motionGroup);
    }
  }
}
