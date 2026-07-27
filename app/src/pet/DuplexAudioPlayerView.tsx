/**
 * DuplexAudioPlayerView — 原生 AudioTrack TTS 播放器（全双工模式）
 *
 * AudioPlayerView 的原生替代品：同一 AudioPlayerHandle 接口，
 * 但调用 DuplexAudioModule（VOICE_COMMUNICATION + AEC）而非 WebView HTML5 Audio。
 *
 * 级别事件：优先使用原生 onDuplexPlayLevel（真实 PCM RMS，供 barge-in 能量门控）；
 * 若短时未收到则降级模拟口型。
 *
 * speak()：不支持（DuplexAudio 无 WebSpeech），emit play_error 降级。
 */

import React, { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { DeviceEventEmitter, NativeModules, View } from "react-native";
import type { AudioPlayerEvent, AudioPlayerHandle } from "./AudioPlayerView";

/** 模拟口型发送间隔（原生 level 缺失时的降级） */
const SIM_LEVEL_INTERVAL_MS = 120;

export interface DuplexAudioPlayerViewProps {
  readonly onEvent?: (event: AudioPlayerEvent) => void;
}

export const DuplexAudioPlayerView = forwardRef<AudioPlayerHandle, DuplexAudioPlayerViewProps>(
  function DuplexAudioPlayerView(props, ref) {
    const onEventRef = useRef(props.onEvent);
    onEventRef.current = props.onEvent;

    const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** 收到过真实 play level 后不再用随机模拟 */
    const hasRealLevelRef = useRef(false);
    /**
     * 同轮 TTS 分段队列：一次用户消息里 Agent 中途调用工具会产生多段 agent_final →
     * 多个 tts_audio，若每段都直接 playTts 会互相掐断（native 每次 ++playEpoch+stop）。
     * 故播放中再来的分段入队，待当前段 play_end 后顺次播放；队列非空时不外抛 play_end，
     * 让状态机把整轮视为一段连续 speaking。stop()/新一轮 清空队列。
     */
    const queueRef = useRef<string[]>([]);
    /** 当前是否有段在播放（用于区分入队 vs 直接播） */
    const playingRef = useRef(false);

    const emit = useCallback((event: AudioPlayerEvent) => {
      onEventRef.current?.(event);
    }, []);

    const stopSimLevel = useCallback(() => {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    }, []);

    const startSimLevelFallback = useCallback(() => {
      stopSimLevel();
      hasRealLevelRef.current = false;
      simTimerRef.current = setInterval(() => {
        if (hasRealLevelRef.current) return;
        emit({ type: "level", value: 0.25 + Math.random() * 0.3 });
      }, SIM_LEVEL_INTERVAL_MS);
    }, [emit, stopSimLevel]);

    const clearPlayTimeout = useCallback(() => {
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
    }, []);

    /** 向 native 下发一段音频（含超时兜底），不处理队列语义 */
    const startNativePlay = useCallback(
      (audioBase64: string) => {
        clearPlayTimeout();
        playTimeoutRef.current = setTimeout(() => {
          emit({ type: "play_error", message: "DuplexAudio 播放指令未响应" });
        }, 5000);
        playingRef.current = true;
        NativeModules.DuplexAudio?.playTts(audioBase64).catch((err: unknown) => {
          clearPlayTimeout();
          stopSimLevel();
          playingRef.current = false;
          queueRef.current = [];
          emit({ type: "play_error", message: String(err) });
        });
      },
      [clearPlayTimeout, emit, stopSimLevel],
    );

    useEffect(() => {
      const subs = [
        DeviceEventEmitter.addListener("onDuplexPlayStart", () => {
          clearPlayTimeout();
          startSimLevelFallback();
          emit({ type: "play_start" });
        }),
        DeviceEventEmitter.addListener("onDuplexPlayLevel", (e: { level?: number }) => {
          const level = typeof e?.level === "number" ? e.level : 0;
          hasRealLevelRef.current = true;
          stopSimLevel();
          emit({ type: "level", value: Math.max(0, Math.min(1, level)) });
        }),
        DeviceEventEmitter.addListener("onDuplexPlayEnd", () => {
          clearPlayTimeout();
          // 队列还有同轮后续分段：顺次播放，不外抛 play_end（整轮视为连续 speaking）
          const next = queueRef.current.shift();
          if (next !== undefined) {
            startNativePlay(next);
            return;
          }
          stopSimLevel();
          playingRef.current = false;
          emit({ type: "level", value: 0 });
          emit({ type: "play_end" });
        }),
        DeviceEventEmitter.addListener("onDuplexPlayError", (e: { message?: string }) => {
          clearPlayTimeout();
          stopSimLevel();
          emit({ type: "level", value: 0 });
          emit({ type: "play_error", message: e?.message ?? "unknown" });
        }),
      ];
      return () => {
        subs.forEach((s) => s.remove());
        stopSimLevel();
        clearPlayTimeout();
      };
    }, [emit, startSimLevelFallback, stopSimLevel, clearPlayTimeout]);

    useImperativeHandle(
      ref,
      () => ({
        play: (audioBase64: string) => {
          // 已有段在播 → 入队，待当前段 play_end 顺次播放（同轮工具调用多段不互相掐断）。
          if (playingRef.current) {
            queueRef.current.push(audioBase64);
            return;
          }
          startNativePlay(audioBase64);
        },
        speak: (_text: string) => {
          emit({ type: "play_error", message: "DuplexAudioPlayer 不支持 speak()" });
        },
        stop: () => {
          clearPlayTimeout();
          stopSimLevel();
          // 打断/新一轮：清空同轮待播队列，避免旧分段在打断后继续冒出来。
          queueRef.current = [];
          playingRef.current = false;
          emit({ type: "level", value: 0 });
          NativeModules.DuplexAudio?.stopTts().catch(() => {});
        },
      }),
      [emit, stopSimLevel, clearPlayTimeout, startNativePlay],
    );

    return <View />;
  },
);
