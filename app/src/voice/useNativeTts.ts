/**
 * useNativeTts.ts — 封装 Android TextToSpeech NativeModule
 *
 * 通过 NativeEventEmitter 监听 onTtsStart/onTtsEnd/onTtsError 事件，
 * 驱动宠物状态机（speaking → idle）+ 口型模拟。
 *
 * 零外部依赖，复用已有 SpeechRecognitionPackage 注册的原生模块。
 */
import { useEffect, useRef, useCallback, useState } from "react";
import { NativeModules, NativeEventEmitter, Platform, type NativeModule } from "react-native";

interface NativeTtsModule {
  isAvailable(): Promise<boolean>;
  speak(text: string, utteranceId: string): void;
  stop(): void;
}

const TTS_MODULE = (NativeModules as Record<string, unknown>).TextToSpeech as
  | NativeTtsModule
  | undefined;

export interface UseNativeTtsResult {
  readonly available: boolean | null;
  readonly speaking: boolean;
  readonly speak: (text: string) => void;
  readonly stop: () => void;
}

/** 生成唯一 utteranceId */
function makeId(): string {
  return `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function useNativeTts(onEvent?: (type: "start" | "end" | "error", utteranceId: string) => void): UseNativeTtsResult {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!TTS_MODULE || Platform.OS !== "android") {
      setAvailable(false);
      return;
    }
    TTS_MODULE.isAvailable().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (!TTS_MODULE || Platform.OS !== "android") return;

    const emitter = new NativeEventEmitter(
      NativeModules.TextToSpeech as unknown as NativeModule,
    );

    const subs = [
      emitter.addListener("onTtsStart", (evt: { utteranceId?: string }) => {
        setSpeaking(true);
        onEventRef.current?.("start", evt.utteranceId ?? "");
      }),
      emitter.addListener("onTtsEnd", (evt: { utteranceId?: string }) => {
        setSpeaking(false);
        onEventRef.current?.("end", evt.utteranceId ?? "");
      }),
      emitter.addListener("onTtsError", (evt: { utteranceId?: string }) => {
        setSpeaking(false);
        onEventRef.current?.("error", evt.utteranceId ?? "");
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!TTS_MODULE || available !== true) return;
    TTS_MODULE.stop();
    const id = makeId();
    TTS_MODULE.speak(text, id);
  }, [available]);

  const stop = useCallback(() => {
    TTS_MODULE?.stop();
    setSpeaking(false);
  }, []);

  return { available, speaking, speak, stop };
}
