/**
 * voiceSessionController — 语音会话纯逻辑控制器
 *
 * 单一真相源：决定何时开麦/关麦/停播/abort，以及 generationId / 回声冷却门控。
 * 无 React / 无原生依赖，便于单测。副作用以 VoiceEffect 列表返回，由 Hook 执行。
 *
 * Phase 1：状态收敛与竞态修复
 * Phase 2：phone_call 软 barge-in（播放期开麦 + echoGuard）
 * Phase 4 lite：播放音量延长冷却 + TTS 文本相似度过滤（真 VAD/AEC 另开）
 * 嘈杂打断优化：barge-in 需 ≥2 汉字；原生 NS/AGC + 提高 VAD 阈值
 *
 * standby / 唤醒词已移除：仅保留 normal / phone_call 二态。
 *
 * 设计：.qoder/design/kids-pet-app/kids-mobile-voice-session-design.md
 */

import type { ConversationMode } from "../conversation/useConversationMode";
import { hasHeavyRepetition, looksLikeTtsEcho } from "./echoTextFilter";
import { classifyAsrGarbage } from "./asrGarbageFilter";
import { meetsBargeInMinChars, countBargeInChars, BARGE_IN_CONFIRM_MS } from "./bargeInTextGate";

/** 设备层相位（非宠物表情态） */
export type VoicePhase = "idle" | "listening" | "processing" | "speaking";

/** 打断原因 */
export type InterruptReason = "button" | "barge_in" | "mode_change" | "new_utterance";

/** TTS 开始后忽略 STT 的冷却窗口（防扬声器回声误触发打断） */
export const DEFAULT_ECHO_GUARD_MS = 350;

/**
 * 播放音量超过该阈值时延长回声冷却（Phase 4 lite：用 TTS 能量近似「喇叭仍在响」）。
 * AudioPlayerView level 为 0~1。
 */
export const PLAYBACK_ECHO_LEVEL = 0.12;

/**
 * 开播后仅在此窗口内允许用 level 延长冷却，避免整段朗读都无法语音打断。
 * 窗口之后主要靠文本相似度过滤回声。
 */
export const MAX_LEVEL_ECHO_EXTEND_MS = 2500;

/**
 * TTS 播放完全结束后仍需保持一小段时间冷却，防止末尾回声被 Vosk 重新识别为新一轮输入。
 * 渲染侧通知播放完毕后缩短为 SHORTENED_POST_SPEECH_COOLDOWN_MS。
 */
export const POST_SPEECH_COOLDOWN_MS = 1200;
export const SHORTENED_POST_SPEECH_COOLDOWN_MS = 700;

/** 两次有效打断之间的最小间隔（防双击/回声连续触发） */
export const INTERRUPT_COOLDOWN_MS = 700;

/** barge-in 时用户语音段至少持续多久才视为有效插话（过滤短促噪声） */
export const BARGE_IN_MIN_SPEECH_MS = 300;

/**
 * mic 绝对地板：低于此值视为环境噪声/静默，不触发打断。
 *
 * 关键实测结论（华为 MTN-AN80，2026-07-24）：硬件 AEC 之后 mic RMS 被整体压到
 * 极低区间（人声开口也只有 0.01~0.11），而 play 数字 PCM RMS 达 0.5~0.67——两者
 * 完全不在一个量级，「mic ≥ play*ratio」的能量比方案在带 AEC 的设备上恒不成立，
 * 人声再大也打不断。故放弃能量比，能量门只保留「地板判断」：mic 高于地板即视为
 * 有声音，是否回声改由文本过滤链（repeat/echo/garbage/min_chars/二次确认）区分。
 * 地板取 0.025：略高于纯静默底噪（观测 ~0.01），又不挡住被华为 AEC 压到
 * 0.02~0.03 的真实近场人声（原 0.04 观测偏高、近场语音常被误判静默而打不断）。
 */
export const BARGE_IN_MIN_MIC_LEVEL = 0.025;

/**
 * Phase 4 预留：真 VAD「检测到用户开口」回调。
 * 当前由 playback level 延长冷却 + 文本相似度近似，未接 Silero/Sherpa。
 */
export type VadSpeechStartHandler = () => void;

/** 控制器对外快照 */
export interface VoiceSessionSnapshot {
  readonly mode: ConversationMode;
  readonly phase: VoicePhase;
  readonly generationId: number;
  readonly echoGuardUntil: number;
  readonly postSpeechCooldownUntil: number;
}

/** 由 Hook / App 执行的副作用指令 */
export type VoiceEffect =
  | { readonly type: "start_listen"; readonly dispatchMicStart: boolean }
  | { readonly type: "stop_listen" }
  | { readonly type: "stop_tts" }
  | { readonly type: "abort_agent" }
  | { readonly type: "pet_mic_start" }
  | { readonly type: "pet_mic_stop" }
  | { readonly type: "pet_abort" }
  | { readonly type: "pet_user_send" }
  | { readonly type: "pet_tts_ready" }
  | { readonly type: "pet_audio_end" }
  | { readonly type: "send_message"; readonly text: string; readonly generationId: number }
  | { readonly type: "reset_inactivity" };

/** STT 定稿后的处理结果（供 App 更新聊天记录等） */
export interface SpeechFinalResult {
  readonly effects: readonly VoiceEffect[];
  /** 是否应作为用户消息展示/落库 */
  readonly userText?: string;
  /** 是否因回声冷却丢弃（调用方无需展示） */
  readonly ignoredAsEcho?: boolean;
  /** 是否因 ASR 垃圾文本丢弃 */
  readonly ignoredAsGarbage?: boolean;
}

export interface VoiceSessionControllerOptions {
  /** 当前会话模式（由 useConversationMode 驱动） */
  mode: ConversationMode;
  /** 宠物是否可见（false 时 play_end 不自动再听） */
  petVisible: boolean;
  /** 回声冷却毫秒，默认 DEFAULT_ECHO_GUARD_MS */
  echoGuardMs?: number;
  /** 可注入时钟（单测） */
  now?: () => number;
  /**
   * 全双工开关（阶段二：硬件 AEC 可用时开启）。
   * true 时 TTS 播放期不关麦，靠 AEC 抑制回声 + VAD/文本过滤判打断；
   * false（默认）沿用半双工：TTS 播放期直接关麦规避自循环。
   */
  duplexEnabled?: boolean;
  /** 诊断日志（barge-in 决策），注入后写入应用内系统日志；默认不记录 */
  log?: (msg: string) => void;
}

/**
 * 创建语音会话控制器。
 * 可变内部状态；每次操作返回需执行的 effects。
 */
export function createVoiceSessionController(initial?: Partial<VoiceSessionControllerOptions>) {
  let mode: ConversationMode = initial?.mode ?? "normal";
  let phase: VoicePhase = "idle";
  let generationId = 0;
  let petVisible = initial?.petVisible ?? true;
  let duplexEnabled = initial?.duplexEnabled ?? false;
  let echoGuardUntil = 0;
  /** TTS 播放结束后的回声冷却截止 */
  let postSpeechCooldownUntil = 0;
  /** 最近一次有效打断时间 */
  let lastInterruptTime = 0;
  /** 当前识别到的用户语音段起始时间（用于 barge-in 长度门控） */
  let speechStartedAt = 0;
  /** phone_call 下用户手动关闭麦克风（静音）；true 时不自动续听 */
  let micMuted = false;
  /** 最近一次将播放/已播放的 TTS 文本（用于回声文本过滤） */
  let lastTtsText = "";
  /** 本次 TTS play_start 时间戳 */
  let playStartedAt = 0;
  /**
   * 当前语音段是否已通过 partial 触发过 barge-in。
   * 全双工下 partial 可能连续多次到达；触发一次即够（TTS 已停），
   * 不应重复 interrupt（每次都要停麦再开麦，造成长时间无法识别）。
   * 也用于 onSpeechFinal：同段语音的最终结果不应被打断冷却误判为回声丢弃。
   */
  let bargeInTriggeredForUtterance = false;
  /**
   * 二次确认：首次出现「非回声且字数够」的 partial 时间戳；
   * 需再等 BARGE_IN_CONFIRM_MS 且仍非回声才真正打断。
   */
  let bargeArmAt = 0;
  let bargeArmText = "";
  /** 最近 mic / 播放 RMS（0~1）；mic 用于地板门控，play 仅半双工回声冷却/日志 */
  let lastMicLevel = 0;
  let lastPlaybackLevel = 0;
  /** 是否收到过 mic 采样（未收到时不挡打断，兼容冷启动与单测） */
  let micLevelSeen = false;
  const echoGuardMs = initial?.echoGuardMs ?? DEFAULT_ECHO_GUARD_MS;
  const now = initial?.now ?? (() => Date.now());
  const log = initial?.log ?? (() => {});

  /** 清除二次确认武装 */
  function clearBargeArm(): void {
    bargeArmAt = 0;
    bargeArmText = "";
  }

  /**
   * TTS 播放期能量门控：近场人声应明显大于扬声器残余。
   * 非 speaking 不限制；尚无 mic 采样时不挡；播放很静时仅要求 mic 过地板。
   */
  function passesEnergyGate(): boolean {
    if (phase !== "speaking") return true;
    if (!micLevelSeen) return true;
    // 仅地板判断：AEC 后 mic 与 play 不同量级，不再比播放峰值。是否回声交给文本过滤链。
    return lastMicLevel >= BARGE_IN_MIN_MIC_LEVEL;
  }

  /** 读取当前快照 */
  function getSnapshot(): VoiceSessionSnapshot {
    return { mode, phase, generationId, echoGuardUntil, postSpeechCooldownUntil };
  }

  /** 同步外部会话模式（不产生副作用；副作用由 onModeChange 路径显式调用） */
  function setMode(next: ConversationMode): void {
    mode = next;
  }

  /** 同步宠物可见性 */
  function setPetVisible(visible: boolean): void {
    petVisible = visible;
  }

  /** 同步全双工开关（由 App 根据 isAecAvailable() 探测结果驱动） */
  function setDuplexEnabled(enabled: boolean): void {
    duplexEnabled = enabled;
  }

  /** 记录即将播放的 TTS 文本（agent_final 时由 App 注入） */
  function setLastTtsText(text: string): void {
    lastTtsText = text.trim();
  }

  /** 递增 generation，使旧 TTS 失效 */
  function bumpGeneration(): number {
    generationId += 1;
    return generationId;
  }

  /** 是否应播放该 generation 的 TTS */
  function shouldPlayTts(audioGenerationId: number): boolean {
    return audioGenerationId === generationId;
  }

  /** 当前是否处于回声冷却窗 */
  function isInEchoGuard(): boolean {
    return now() < echoGuardUntil;
  }

  /** 当前是否处于 TTS 播放结束后的回声冷却窗 */
  function isInPostSpeechCooldown(): boolean {
    return now() < postSpeechCooldownUntil;
  }

  /** 当前是否处于任何需要丢弃 STT 的冷却窗 */
  function isAnyCooldownActive(): boolean {
    return isInEchoGuard() || isInPostSpeechCooldown();
  }

  /** 渲染侧通知 TTS 已完全播放完毕，缩短播后冷却 */
  function onPlaybackFinished(): void {
    const remaining = postSpeechCooldownUntil - now();
    if (remaining > SHORTENED_POST_SPEECH_COOLDOWN_MS) {
      postSpeechCooldownUntil = now() + SHORTENED_POST_SPEECH_COOLDOWN_MS;
    }
    // 播放结束：清空播放电平
    lastPlaybackLevel = 0;
  }

  /**
   * Phase 4 lite + 方案 B：TTS 播放音量回调。
   * 始终更新 lastPlaybackLevel；半双工仍可用 level 短窗延长 echoGuard。
   * 全双工改走 mic/play 能量比，不再延长 echoGuard（否则很难语音打断）。
   */
  function onPlaybackLevel(level: number): void {
    lastPlaybackLevel = level;
    if (duplexEnabled) return;
    if (mode !== "phone_call" || phase !== "speaking") return;
    if (echoGuardUntil === 0) return;
    if (level < PLAYBACK_ECHO_LEVEL) return;
    if (playStartedAt <= 0 || now() - playStartedAt > MAX_LEVEL_ECHO_EXTEND_MS) return;
    echoGuardUntil = Math.max(echoGuardUntil, now() + echoGuardMs);
  }

  /** 麦克风 RMS（Sherpa onMicLevel） */
  function onMicLevel(level: number): void {
    lastMicLevel = level;
    micLevelSeen = true;
  }

  /** 原生层检测到用户开始说话（用于 barge-in 长度门控） */
  function onSpeechStarted(): void {
    speechStartedAt = now();
    bargeInTriggeredForUtterance = false;
    clearBargeArm();
  }

  /**
   * 原生层检测到用户语音结束。
   * 不在此重置 bargeInTriggeredForUtterance：VAD 静音判定和 ASR 定稿是两条独立管线，
   * VAD end 可能早于/晚于 final 到达；提前重置会让 onSpeechFinal 又用回过期的
   * lastInterruptTime 冷却判定，重新丢弃自己刚触发的这句话。该 flag 只在
   * onSpeechStarted（下一段语音开始）或 onSpeechFinal 处理完成后重置。
   */
  function onSpeechEnded(): void {
    speechStartedAt = 0;
  }

  /** 丢弃无效 STT 后续听（回声 / 垃圾识别） */
  function discardAndContinueListen(kind: "echo" | "garbage"): SpeechFinalResult {
    const base = {
      effects: [{ type: "start_listen" as const, dispatchMicStart: false }],
    };
    if (kind === "echo") return { ...base, ignoredAsEcho: true };
    return { ...base, ignoredAsGarbage: true };
  }

  /** 当前模式是否应在丢弃后自动续听 */
  function shouldContinueListenAfterDiscard(): boolean {
    return canAutoListen();
  }

  /**
   * 完整打断：停播 + abort + 作废 generation。
   * @param resumeListen phone_call 下是否恢复聆听（按钮打断=true；新一轮发言前=false）
   */
  function interrupt(
    reason: InterruptReason,
    opts?: { readonly resumeListen?: boolean },
  ): VoiceEffect[] {
    const resumeListen = opts?.resumeListen ?? true;
    const newGen = bumpGeneration();
    echoGuardUntil = 0;
    postSpeechCooldownUntil = 0;
    // barge_in 后仍可能收到同段 ASR final（回声叠字）；保留 lastTtsText 供 final 回声过滤。
    // 其他打断（按钮/新发言/切模式）清空，避免误伤后续真实输入。
    if (reason !== "barge_in") {
      lastTtsText = "";
    }
    lastInterruptTime = now();
    const effects: VoiceEffect[] = [
      { type: "stop_tts" },
      { type: "abort_agent" },
      { type: "pet_abort" },
      { type: "stop_listen" },
      { type: "reset_inactivity" },
    ];
    phase = "idle";
    if (resumeListen && canAutoListen()) {
      phase = "listening";
      effects.push({ type: "start_listen", dispatchMicStart: true });
    }
    return effects;
  }

  /**
   * 模式切换时的设备清理（挂断 → normal）。
   * @param abortAgent 是否中止 Agent（挂断=true）
   */
  function silenceForModeChange(opts?: { readonly abortAgent?: boolean }): VoiceEffect[] {
    bumpGeneration();
    echoGuardUntil = 0;
    postSpeechCooldownUntil = 0;
    phase = "idle";
    const effects: VoiceEffect[] = [{ type: "stop_listen" }, { type: "stop_tts" }];
    if (opts?.abortAgent) {
      effects.push({ type: "abort_agent" }, { type: "pet_abort" });
    }
    return effects;
  }

  /** phone_call 下是否应自动续听（未静音 + 可见） */
  function canAutoListen(): boolean {
    return mode === "phone_call" && petVisible && !micMuted;
  }

  /** 手动关闭麦克风（phone_call）：停麦并回 idle，不再自动续听 */
  function muteMic(): VoiceEffect[] {
    micMuted = true;
    phase = "idle";
    return [{ type: "pet_mic_stop" }, { type: "stop_listen" }];
  }

  /** 手动开启麦克风（phone_call）：恢复聆听 */
  function unmuteMic(): VoiceEffect[] {
    micMuted = false;
    if (mode !== "phone_call" || !petVisible || phase === "speaking") return [];
    phase = "listening";
    return [{ type: "start_listen", dispatchMicStart: true }];
  }

  /** 是否处于手动静音 */
  function isMicMuted(): boolean {
    return micMuted;
  }

  /** 进入 phone_call 后开始连续听 */
  function beginPhoneCallListening(): VoiceEffect[] {
    micMuted = false;
    if (!petVisible) return [];
    phase = "listening";
    return [{ type: "start_listen", dispatchMicStart: true }];
  }

  /**
   * TTS 开始播放。
   * - 半双工（默认）：phone_call / normal 均关麦，避免 TTS 被识别为用户输入
   *   （没有硬件 AEC 时，同一设备同时放音+拾音必然产生自循环）。
   * - 全双工（duplexEnabled）：不关麦，靠 AEC 抑制回声，speaking 期仍能
   *   收到 partial/final 用于 barge-in 判定（见 onSpeechPartial/onSpeechFinal）。
   */
  function onTtsPlayStart(): VoiceEffect[] {
    phase = "speaking";
    playStartedAt = now();
    // 全双工：开播后短窗忽略 STT，挡住扬声器起振回声；之后主要靠文本回声过滤。
    // 下限 800→600ms：起振回声一般 <500ms，缩短窗口让用户更早能打断。
    echoGuardUntil = duplexEnabled ? now() + Math.max(echoGuardMs, 600) : 0;
    const effects: VoiceEffect[] = [{ type: "pet_tts_ready" }];
    if (!duplexEnabled) effects.push({ type: "stop_listen" });
    return effects;
  }

  /**
   * TTS 播放结束：回 idle；phone_call 下自动再听。
   * 强制 stop→start 以重置 Vosk，避免长时间监听后状态漂移导致下一轮无响应。
   */
  function onTtsPlayEnd(): VoiceEffect[] {
    echoGuardUntil = 0;
    lastTtsText = "";
    playStartedAt = 0;
    lastPlaybackLevel = 0;
    phase = "idle";
    const effects: VoiceEffect[] = [{ type: "pet_audio_end" }];
    if (canAutoListen()) {
      phase = "listening";
      postSpeechCooldownUntil = now() + POST_SPEECH_COOLDOWN_MS;
      effects.push({ type: "stop_listen" }, { type: "start_listen", dispatchMicStart: true });
    }
    return effects;
  }

  /**
   * 本轮对话结束但没有产生可播放音频（空回复 / TTS 合成失败 / agent 错误 /
   * 音频因 generation 过期被丢弃）。此时不会有 play_end 事件触发续听，
   * phone_call 下必须在此兜底重开麦克风，否则连续对话会永久卡在无法聆听
   * （表现：不显示"聆听中"、必须挂断重开）。
   *
   * 幂等：仅在当前不处于 speaking（正在播/将播音频）时才重听，避免与正常
   * onTtsPlayStart/End 路径打架。
   */
  function onTurnEndedWithoutAudio(): VoiceEffect[] {
    if (phase === "speaking") return [];
    echoGuardUntil = 0;
    lastTtsText = "";
    playStartedAt = 0;
    phase = "idle";
    const effects: VoiceEffect[] = [{ type: "pet_audio_end" }];
    if (canAutoListen()) {
      phase = "listening";
      postSpeechCooldownUntil = now() + POST_SPEECH_COOLDOWN_MS;
      effects.push({ type: "stop_listen" }, { type: "start_listen", dispatchMicStart: true });
    }
    return effects;
  }

  /** TTS 播放错误：与 play_end 同等处理宠物态；phone_call 下恢复聆听 */
  function onTtsPlayError(): VoiceEffect[] {
    echoGuardUntil = 0;
    lastTtsText = "";
    playStartedAt = 0;
    phase = "idle";
    const effects: VoiceEffect[] = [{ type: "pet_audio_end" }];
    if (canAutoListen()) {
      phase = "listening";
      postSpeechCooldownUntil = now() + POST_SPEECH_COOLDOWN_MS;
      effects.push({ type: "stop_listen" }, { type: "start_listen", dispatchMicStart: true });
    }
    return effects;
  }

  /**
   * 处理 STT 中间结果（partial）。
   * 仅用于 phone_call 软 barge-in：需过回声过滤 + 字数门控 + 二次确认后才打断。
   */
  function onSpeechPartial(
    text: string,
    opts: { sessionReady: boolean; aiReplying: boolean },
  ): SpeechFinalResult {
    // 半双工：phone_call TTS 播放期间麦克风已关，partial 不应触发任何动作。
    // 全双工：speaking 期麦克风仍开，允许走到下方的 barge-in 判定。
    if (!duplexEnabled && mode === "phone_call" && phase === "speaking") return { effects: [] };
    // 本段语音已触发过 barge-in（TTS 已停）：不重复 interrupt，
    // 否则每个 partial 都重启一次麦克风，导致长时间无法识别下一句。
    if (bargeInTriggeredForUtterance) return { effects: [] };

    const trimmed = text.trim();
    if (!trimmed || !opts.sessionReady) return { effects: [] };
    if (mode !== "phone_call") return { effects: [] };
    if (phase !== "speaking" && !opts.aiReplying) return { effects: [] };
    // TTS 开播后的初始回声冷却期内不响应 partial
    if (isInEchoGuard()) return { effects: [] };
    // 打断冷却
    if (now() - lastInterruptTime < INTERRUPT_COOLDOWN_MS) return { effects: [] };

    const chars = countBargeInChars(trimmed);
    // 方案 B：音量门控 —— 人声需明显大于 TTS 残余，否则视为回声/环境声
    if (!passesEnergyGate()) {
      clearBargeArm();
      log(`[barge] partial 拒:能量门 mic=${lastMicLevel.toFixed(3)} 字="${trimmed}"`);
      return { effects: [] };
    }

    // ASR 垃圾或回声文本不触发打断，并撤销武装
    const garbage = classifyAsrGarbage(trimmed);
    if (garbage.garbage) {
      clearBargeArm();
      log(`[barge] partial 拒:垃圾识别 字="${trimmed}"`);
      return { effects: [] };
    }
    if (lastTtsText && looksLikeTtsEcho(trimmed, lastTtsText, { profile: "barge" })) {
      clearBargeArm();
      log(`[barge] partial 拒:回声 字="${trimmed}"`);
      return { effects: [] };
    }
    // 语种无关：跨语种/方言时文本无法比相似度，改用重复特征识别回声
    if (hasHeavyRepetition(trimmed)) {
      clearBargeArm();
      log(`[barge] partial 拒:重复串 字="${trimmed}"`);
      return { effects: [] };
    }

    // 播放期至少 3 汉字，避免短回声/噪声
    if (!meetsBargeInMinChars(trimmed, { whileSpeaking: true })) {
      clearBargeArm();
      log(`[barge] partial 拒:字数<3 (${chars}) 字="${trimmed}"`);
      return { effects: [] };
    }

    // 二次确认：首次合格只武装，持续 BARGE_IN_CONFIRM_MS 且文本仍有效才打断
    if (bargeArmAt <= 0) {
      bargeArmAt = now();
      bargeArmText = trimmed;
      log(`[barge] partial 武装 字数=${chars} 字="${trimmed}"`);
      return { effects: [] };
    }
    const armedMs = now() - bargeArmAt;
    if (armedMs < BARGE_IN_CONFIRM_MS) {
      bargeArmText = trimmed;
      return { effects: [] };
    }

    bargeInTriggeredForUtterance = true;
    clearBargeArm();
    log(`[barge] partial 触发打断! 字数=${chars} mic=${lastMicLevel.toFixed(3)} 字="${trimmed}"`);
    // partial 打断不发送消息，必须立即恢复聆听，否则麦克风永久关闭
    return { effects: interrupt("barge_in", { resumeListen: true }) };
  }

  /**
   * 处理 STT 定稿文本。
   * - 先过滤 ASR 垃圾字词
   * - phone_call + speaking：半双工下麦克风已关，此分支不应触发
   * - phone_call + AI 回复中：先打断再发送
   */
  function onSpeechFinal(
    text: string,
    opts: { sessionReady: boolean; aiReplying: boolean },
  ): SpeechFinalResult {
    const trimmed = text.trim();
    // 半双工：TTS 播放期间不接收任何识别结果（麦克风已关，不应有结果）。
    // 全双工：speaking 期麦克风仍开，视为 barge-in 触发（等同 aiReplying 路径）。
    if (phase === "speaking" && !duplexEnabled) return { effects: [] };
    if (!trimmed || !opts.sessionReady) {
      return { effects: [] };
    }

    // ASR 误识别垃圾：不打断、不发消息；通话中续听
    const garbage = classifyAsrGarbage(trimmed);
    if (garbage.garbage) {
      if (shouldContinueListenAfterDiscard()) {
        return discardAndContinueListen("garbage");
      }
      return { ignoredAsGarbage: true, effects: [] };
    }

    // TTS 回声（含叠字）：不打断、不发消息。partial 漏判打断后，final 仍可能是回声整句。
    if (mode === "phone_call" && lastTtsText && looksLikeTtsEcho(trimmed, lastTtsText, { profile: "final" })) {
      speechStartedAt = 0;
      bargeInTriggeredForUtterance = false;
      clearBargeArm();
      if (shouldContinueListenAfterDiscard()) {
        return discardAndContinueListen("echo");
      }
      return { ignoredAsEcho: true, effects: [] };
    }
    // 语种无关：重度重复串（跨语种回声/ASR 幻觉），播放/回复期不发消息
    if (
      mode === "phone_call" &&
      (phase === "speaking" || opts.aiReplying) &&
      hasHeavyRepetition(trimmed)
    ) {
      speechStartedAt = 0;
      bargeInTriggeredForUtterance = false;
      clearBargeArm();
      if (shouldContinueListenAfterDiscard()) {
        return discardAndContinueListen("echo");
      }
      return { ignoredAsEcho: true, effects: [] };
    }

    // Phase 2/4：播放期相关保护在半双工下已不生效（speaking 阶段直接返回），
    // 保留 post-speech cooldown 处理 TTS 结束后的尾音回声。
    if (mode === "phone_call" && isInPostSpeechCooldown()) {
      speechStartedAt = 0;
      return discardAndContinueListen("echo");
    }

    const effects: VoiceEffect[] = [];
    // 本段语音已经在 partial 阶段触发过 barge-in（TTS 已停，冷却时间戳已刷新）：
    // 不要用同一段语音自己制造的 lastInterruptTime/speechStartedAt 去判定它自己是回声，
    // 否则这句最终识别结果会被当作打断冷却/回声误丢弃，永远送不到 Agent。
    if (mode === "phone_call" && opts.aiReplying && !bargeInTriggeredForUtterance) {
      // 打断冷却：防止回声/双击连续触发
      if (now() - lastInterruptTime < INTERRUPT_COOLDOWN_MS) {
        speechStartedAt = 0;
        return discardAndContinueListen("echo");
      }
      // barge-in 长度门控：短于阈值的语音段视为噪声/回声
      if (speechStartedAt > 0) {
        const speechMs = now() - speechStartedAt;
        if (speechMs < BARGE_IN_MIN_SPEECH_MS) {
          speechStartedAt = 0;
          log(`[barge] final 拒:语音段过短 ${speechMs}ms 字="${trimmed}"`);
          return discardAndContinueListen("echo");
        }
      }
      // 字数门控：播放/回复中不足 3 汉字不打断也不发（更严，挡短回声）
      if (!meetsBargeInMinChars(trimmed, { whileSpeaking: true })) {
        speechStartedAt = 0;
        clearBargeArm();
        log(`[barge] final 拒:字数<3 (${countBargeInChars(trimmed)}) 字="${trimmed}"`);
        return discardAndContinueListen("echo");
      }
      clearBargeArm();
      log(`[barge] final 触发打断! 字数=${countBargeInChars(trimmed)} 字="${trimmed}"`);
      effects.push(...interrupt("barge_in", { resumeListen: false }));
    }

    // 自动聆听会进入 listening；发消息前先 MIC_STOP → thinking
    if (phase === "listening") {
      effects.push({ type: "pet_mic_stop" });
    }

    const gen = bumpGeneration();
    phase = "processing";
    speechStartedAt = 0;
    bargeInTriggeredForUtterance = false;
    effects.push(
      { type: "pet_user_send" },
      { type: "send_message", text: trimmed, generationId: gen },
      { type: "reset_inactivity" },
    );
    return { effects, userText: trimmed };
  }

  /**
   * 文本框发送：bump generation 并返回 send effects。
   */
  function onTextSend(text: string): SpeechFinalResult {
    const trimmed = text.trim();
    if (!trimmed) return { effects: [] };
    const gen = bumpGeneration();
    phase = "processing";
    return {
      userText: trimmed,
      effects: [
        { type: "pet_user_send" },
        { type: "send_message", text: trimmed, generationId: gen },
        { type: "reset_inactivity" },
      ],
    };
  }

  /**
   * 点击身体部位的隐式提示发送：与 onTextSend 同样 bump generation + 走 send_message，
   * 但**不返回 userText**——调用方据此不落聊天记录、不显示用户气泡（触摸是隐式交互，
   * 不该像用户打字一样出现在对话流里）。generationId 确保回复 TTS 不被 shouldPlayTts 丢弃。
   */
  function onHintSend(text: string): SpeechFinalResult {
    const trimmed = text.trim();
    if (!trimmed) return { effects: [] };
    const gen = bumpGeneration();
    phase = "processing";
    return {
      effects: [
        { type: "pet_user_send" },
        { type: "send_message", text: trimmed, generationId: gen },
        { type: "reset_inactivity" },
      ],
    };
  }

  return {
    getSnapshot,
    setMode,
    setPetVisible,
    setDuplexEnabled,
    setLastTtsText,
    bumpGeneration,
    shouldPlayTts,
    isInEchoGuard,
    isInPostSpeechCooldown,
    onPlaybackLevel,
    onMicLevel,
    onPlaybackFinished,
    onSpeechStarted,
    onSpeechEnded,
    interrupt,
    silenceForModeChange,
    muteMic,
    unmuteMic,
    isMicMuted,
    beginPhoneCallListening,
    onTtsPlayStart,
    onTtsPlayEnd,
    onTtsPlayError,
    onTurnEndedWithoutAudio,
    onSpeechPartial,
    onSpeechFinal,
    onTextSend,
    onHintSend,
  };
}

export type VoiceSessionController = ReturnType<typeof createVoiceSessionController>;
