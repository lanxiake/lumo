/**
 * useVoiceSession — 语音会话编排 Hook
 *
 * 组合 ConversationMode + VoiceSessionController + STT/TTS/abort 副作用执行。
 * App 只应通过本 Hook 开麦/关麦/打断，避免散落 effect 导致状态失控。
 *
 * Phase 1：状态收敛
 * Phase 2：phone_call 软 barge-in
 * Phase 3：standby 唤醒常听
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PetEvent, PetState } from "@lumo/core";
import {
  useConversationMode,
  type ConversationMode,
  type UseConversationModeOptions,
} from "../conversation/useConversationMode";
import {
  createVoiceSessionController,
  type VoiceEffect,
  type VoicePhase,
  type VoiceSessionController,
} from "./voiceSessionController";
import type { AudioPlayerEvent } from "../pet/AudioPlayerView";

/**
 * AI 正在回复的宠物态（打断按钮可见；phone_call 下语音可 barge-in）。
 * 不含 listening：聆听是等用户说话，不应显示打断。
 */
export const AI_REPLYING_STATES: ReadonlySet<PetState> = new Set([
  "thinking",
  "tts_converting",
  "speaking",
]);

/** @deprecated 使用 AI_REPLYING_STATES；保留别名避免外部旧引用断裂 */
export const ACTIVE_PET_STATES = AI_REPLYING_STATES;

export interface UseVoiceSessionOptions {
  readonly petVisible: boolean;
  readonly petState: PetState;
  readonly sessionReady: boolean;
  readonly startSpeech: () => void;
  readonly stopSpeech: () => void;
  readonly clearSpeech: () => void;
  readonly abort: () => void;
  readonly stopTts: () => void;
  readonly dispatch: (event: PetEvent) => void;
  readonly sendMessage: (text: string, generationId: number) => void;
  readonly appendUserMessage: (text: string) => void;
  readonly recordUserMessage: (text: string) => void;
  readonly onModeChange?: UseConversationModeOptions["onModeChange"];
  /**
   * 全双工开关（阶段二：由 App 探测 DuplexAudio.isAecAvailable() 后传入）。
   * 默认 false（半双工，TTS 播放期关麦）。
   */
  readonly duplexEnabled?: boolean;
}

export interface UseVoiceSessionResult {
  readonly mode: ConversationMode;
  readonly phase: VoicePhase;
  readonly generationId: number;
  readonly enterPhoneCall: () => void;
  readonly exitPhoneCall: () => void;
  /** phone_call 下手动切换麦克风静音 */
  readonly toggleMic: () => void;
  /** 麦克风是否已被手动静音 */
  readonly micMuted: boolean;
  readonly handleInterrupt: () => void;
  readonly onAudioEvent: (evt: AudioPlayerEvent) => void;
  readonly handleSpeechResult: (text: string) => void;
  readonly handleSpeechPartial: (text: string) => void;
  /** sherpa VAD 声学端点：用户开始说话（barge-in 长度门控起点） */
  readonly handleVadSpeechStart: () => void;
  /** sherpa VAD 声学端点：用户停止说话 */
  readonly handleVadSpeechEnd: () => void;
  /** 麦克风实时电平（barge-in 能量地板门控） */
  readonly handleMicLevel: (level: number) => void;
  readonly handleTextSend: (text: string) => boolean;
  /** 发送触摸隐式提示给 Agent（不落聊天记录）；@returns 是否已发送 */
  readonly sendHintMessage: (text: string) => boolean;
  readonly shouldPlayTts: (generationId: number) => boolean;
  /** 注入即将播放的 TTS 文本（agent_final），供回声文本过滤 */
  readonly setLastTtsText: (text: string) => void;
  /**
   * 本轮无音频产出（空回复/TTS失败/错误/音频过期丢弃）时兜底续听。
   * 修复连续对话卡死：无 play_end 时麦克风永不重开。
   */
  readonly handleTurnEndedWithoutAudio: () => void;
}

/**
 * 语音会话 Hook：把控制器 effects 落到真实设备与宠物状态机。
 */
export function useVoiceSession(options: UseVoiceSessionOptions): UseVoiceSessionResult {
  const {
    petVisible,
    petState,
    sessionReady,
    startSpeech,
    stopSpeech,
    clearSpeech,
    abort,
    stopTts,
    dispatch,
    sendMessage,
    appendUserMessage,
    recordUserMessage,
    onModeChange,
    duplexEnabled = false,
  } = options;

  const controllerRef = useRef<VoiceSessionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createVoiceSessionController({
      mode: "normal",
      petVisible,
      duplexEnabled,
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.setPetVisible(petVisible);
  }, [controller, petVisible]);

  useEffect(() => {
    controller.setDuplexEnabled(duplexEnabled);
  }, [controller, duplexEnabled]);

  const runEffects = useCallback(
    (effects: readonly VoiceEffect[]) => {
      for (const effect of effects) {
        switch (effect.type) {
          case "start_listen":
            if (effect.dispatchMicStart) {
              dispatch({ type: "MIC_START" });
            }
            startSpeech();
            break;
          case "stop_listen":
            stopSpeech();
            break;
          case "stop_tts":
            stopTts();
            break;
          case "abort_agent":
            abort();
            break;
          case "pet_mic_start":
            dispatch({ type: "MIC_START" });
            break;
          case "pet_mic_stop":
            dispatch({ type: "MIC_STOP" });
            break;
          case "pet_abort":
            dispatch({ type: "ABORT" });
            break;
          case "pet_user_send":
            dispatch({ type: "USER_SEND" });
            break;
          case "pet_tts_ready":
            dispatch({ type: "TTS_READY" });
            break;
          case "pet_audio_end":
            dispatch({ type: "AUDIO_END" });
            break;
          case "send_message":
            sendMessage(effect.text, effect.generationId);
            break;
          case "reset_inactivity":
            // standby 已移除：无操作
            break;
          default: {
            const _exhaustive: never = effect;
            void _exhaustive;
          }
        }
      }
    },
    [abort, dispatch, sendMessage, startSpeech, stopSpeech, stopTts],
  );

  const {
    mode,
    enterPhoneCall: enterModePhoneCall,
    exitPhoneCall: exitModePhoneCall,
  } = useConversationMode({
    petVisible,
    onModeChange: (next, prev) => {
      controller.setMode(next);
      if (next === "normal" && prev === "phone_call") {
        runEffects(controller.silenceForModeChange({ abortAgent: true }));
      }
      onModeChange?.(next, prev);
    },
  });

  useEffect(() => {
    controller.setMode(mode);
  }, [controller, mode]);

  const enterPhoneCall = useCallback(() => {
    enterModePhoneCall();
    controller.setMode("phone_call");
    runEffects(controller.beginPhoneCallListening());
    setMicMuted(false);
  }, [controller, enterModePhoneCall, runEffects]);

  const exitPhoneCall = useCallback(() => {
    exitModePhoneCall();
  }, [exitModePhoneCall]);

  const [micMuted, setMicMuted] = useState(false);

  const toggleMic = useCallback(() => {
    if (controller.isMicMuted()) {
      runEffects(controller.unmuteMic());
    } else {
      runEffects(controller.muteMic());
    }
    setMicMuted(controller.isMicMuted());
  }, [controller, runEffects]);

  const handleInterrupt = useCallback(() => {
    runEffects(controller.interrupt("button", { resumeListen: true }));
  }, [controller, runEffects]);

  const onAudioEvent = useCallback(
    (evt: AudioPlayerEvent) => {
      if (evt.type === "play_start") {
        runEffects(controller.onTtsPlayStart());
      } else if (evt.type === "play_end") {
        runEffects(controller.onTtsPlayEnd());
        controller.onPlaybackFinished();
      } else if (evt.type === "play_error") {
        runEffects(controller.onTtsPlayError());
        controller.onPlaybackFinished();
      } else if (evt.type === "level") {
        // Phase 4 lite：喇叭仍响时延长回声冷却
        controller.onPlaybackLevel(evt.value);
      }
    },
    [controller, runEffects],
  );

  const handleVadSpeechStart = useCallback(() => {
    controller.onSpeechStarted();
  }, [controller]);

  const handleVadSpeechEnd = useCallback(() => {
    controller.onSpeechEnded();
  }, [controller]);

  /** 麦克风能量 → 方案 B 门控 */
  const handleMicLevel = useCallback(
    (level: number) => {
      controller.onMicLevel(level);
    },
    [controller],
  );

  const handleSpeechPartial = useCallback(
    (text: string) => {
      const result = controller.onSpeechPartial(text, {
        sessionReady,
        aiReplying: AI_REPLYING_STATES.has(petState),
      });
      runEffects(result.effects);
    },
    [controller, petState, runEffects, sessionReady],
  );

  const handleSpeechResult = useCallback(
    (text: string) => {
      const result = controller.onSpeechFinal(text, {
        sessionReady,
        aiReplying: AI_REPLYING_STATES.has(petState),
      });
      if (result.userText) {
        appendUserMessage(result.userText);
        recordUserMessage(result.userText);
      }
      if (result.ignoredAsGarbage) {
        // normal 模式按住说话已触发 MIC_STOP → thinking；垃圾识别时回 idle，避免卡住
        if (mode === "normal") {
          dispatch({ type: "ABORT" });
        }
      }
      runEffects(result.effects);
      clearSpeech();
    },
    [
      appendUserMessage,
      clearSpeech,
      controller,
      dispatch,
      mode,
      petState,
      recordUserMessage,
      runEffects,
      sessionReady,
    ],
  );

  /** @returns 是否已发送 */
  const handleTextSend = useCallback(
    (text: string): boolean => {
      if (!sessionReady) return false;
      const result = controller.onTextSend(text);
      if (!result.userText) return false;
      appendUserMessage(result.userText);
      recordUserMessage(result.userText);
      runEffects(result.effects);
      return true;
    },
    [appendUserMessage, controller, recordUserMessage, runEffects, sessionReady],
  );

  /**
   * 发送触摸隐式提示给 Agent（点击身体部位触发）。
   * 与 handleTextSend 不同：不落聊天记录、不显示用户气泡；仅驱动 Agent 即兴回一句。
   * @returns 是否已发送
   */
  const sendHintMessage = useCallback(
    (text: string): boolean => {
      if (!sessionReady) return false;
      const result = controller.onHintSend(text);
      if (result.effects.length === 0) return false;
      runEffects(result.effects);
      return true;
    },
    [controller, runEffects, sessionReady],
  );

  const shouldPlayTts = useCallback(
    (audioGenerationId: number) => controller.shouldPlayTts(audioGenerationId),
    [controller],
  );

  const setLastTtsText = useCallback(
    (text: string) => {
      controller.setLastTtsText(text);
    },
    [controller],
  );

  const handleTurnEndedWithoutAudio = useCallback(() => {
    runEffects(controller.onTurnEndedWithoutAudio());
  }, [controller, runEffects]);

  const snap = controller.getSnapshot();

  return {
    mode,
    phase: snap.phase,
    generationId: snap.generationId,
    enterPhoneCall,
    exitPhoneCall,
    toggleMic,
    micMuted,
    handleInterrupt,
    onAudioEvent,
    handleSpeechResult,
    handleSpeechPartial,
    handleVadSpeechStart,
    handleVadSpeechEnd,
    handleMicLevel,
    handleTextSend,
    sendHintMessage,
    shouldPlayTts,
    setLastTtsText,
    handleTurnEndedWithoutAudio,
  };
}
