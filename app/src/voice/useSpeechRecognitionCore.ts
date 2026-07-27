/**
 * useSpeechRecognitionCore.ts — 纯逻辑，零 RN 运行时依赖
 *
 * 所有 react-native 依赖通过 opts 注入，便于测试脱离 RN 环境。
 * 生产入口见 useSpeechRecognition.ts（薄包装，注入 RN 默认值）。
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** NativeModule 接口 */
export interface SpeechRecognitionNative {
  isAvailable(): Promise<boolean>;
  startListening(locale: string): void;
  stopListening(): void;
  cancelListening(): void;
}

/** 识别结果 */
export interface SpeechResult {
  readonly text: string;
  readonly confidence: number;
}

/** 识别错误 */
export interface SpeechError {
  readonly code: string;
  readonly message: string;
}

/** 事件发射器（兼容 NativeEventEmitter 子集） */
export interface EventEmitterLike {
  addListener(event: string, callback: (evt: unknown) => void): { remove(): void };
}

/** 权限请求函数 */
export type RequestMicPermissionFn = () => Promise<boolean>;

/** Hook 选项 */
export interface UseSpeechRecognitionOptions {
  readonly nativeModule?: SpeechRecognitionNative | null;
  readonly requestPermission?: RequestMicPermissionFn;
  /** 注入事件发射器工厂（测试用）；生产由包装层注入 */
  readonly createEmitter?: (nativeModule: SpeechRecognitionNative) => EventEmitterLike | null;
}

export interface UseSpeechRecognitionResult {
  readonly listening: boolean;
  readonly result: SpeechResult | null;
  /** 识别过程中的 partial 文本（Vosk 可用时） */
  readonly partialResult: SpeechResult | null;
  readonly error: SpeechError | null;
  readonly available: boolean | null;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly cancel: () => void;
  readonly clear: () => void;
}

export function useSpeechRecognitionCore(
  opts: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionResult {
  const nativeModule = opts.nativeModule ?? null;
  const requestPermission = opts.requestPermission ?? (async () => true);
  const createEmitter = opts.createEmitter;

  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<SpeechResult | null>(null);
  const [partialResult, setPartialResult] = useState<SpeechResult | null>(null);
  const [error, setError] = useState<SpeechError | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const subsRef = useRef<Array<{ remove(): void }>>([]);
  const createEmitterRef = useRef(createEmitter);
  createEmitterRef.current = createEmitter;
  /** 与 listening 同步，用于 start 去重（避免状态机重复 start_listen） */
  const listeningRef = useRef(false);

  // 挂载时检测可用性
  useEffect(() => {
    if (!nativeModule) return;
    nativeModule
      .isAvailable()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, [nativeModule]);

  // 订阅原生事件（createEmitter 用 ref 避免不稳定引用导致反复重建）
  useEffect(() => {
    if (!nativeModule) return;
    const emitter = createEmitterRef.current?.(nativeModule);
    if (!emitter) return;

    const subs = [
      emitter.addListener("onSpeechStart", () => {
        listeningRef.current = true;
        setListening(true);
      }),
      emitter.addListener("onSpeechEnd", () => {
        listeningRef.current = false;
        setListening(false);
        setPartialResult(null);
      }),
      emitter.addListener("onSpeechResults", (evt: unknown) => {
        const e = evt as { text: string; confidence: number };
        listeningRef.current = false;
        setListening(false);
        setPartialResult(null);
        setResult({ text: e.text, confidence: e.confidence });
      }),
      emitter.addListener("onSpeechPartialResult", (evt: unknown) => {
        const e = evt as { text: string; confidence?: number };
        setPartialResult({ text: e.text, confidence: e.confidence ?? 0 });
      }),
      emitter.addListener("onSpeechError", (evt: unknown) => {
        const e = evt as { code: string; message: string };
        listeningRef.current = false;
        setListening(false);
        setPartialResult(null);
        setError({ code: e.code, message: e.message });
      }),
    ];
    subsRef.current = subs;

    return () => {
      subs.forEach((s) => s.remove());
      subsRef.current = [];
    };
  }, [nativeModule]);

  const start = useCallback(async () => {
    if (!nativeModule) {
      setError({ code: "not_available", message: "语音识别不可用" });
      return;
    }
    if (listeningRef.current) return;
    const permitted = await requestPermission();
    if (!permitted) {
      setError({ code: "permissions", message: "请在设置中开启麦克风权限" });
      return;
    }
    setError(null);
    setResult(null);
    nativeModule.startListening("zh-CN");
  }, [nativeModule, requestPermission]);

  const stop = useCallback(() => {
    // 立即同步 UI 状态,避免 Vosk stop 排队/事件丢失导致仍显示"聆听中"。
    listeningRef.current = false;
    setListening(false);
    nativeModule?.stopListening();
  }, [nativeModule]);

  const cancel = useCallback(() => {
    nativeModule?.cancelListening();
    listeningRef.current = false;
    setListening(false);
  }, [nativeModule]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { listening, result, partialResult, error, available, start, stop, cancel, clear };
}
