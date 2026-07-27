/**
 * sherpaSpeechRecognition.ts — 将 sherpa-onnx 原生模块包装成 SpeechRecognitionNative 接口
 *
 * sherpa-onnx 在设备本地离线运行（OnlineRecognizer 流式 + Silero VAD），完全不走网关/云端。
 * 与 voskSpeechRecognition.ts 保持相同抽象，使引擎可灰度切换、可单测。
 *
 * 原生事件（SherpaAsrModule.kt 通过 DeviceEventEmitter 发出）：
 *   onSpeechStart / onSpeechPartialResult / onSpeechResults / onSpeechEnd / onSpeechError
 *   onVadSpeechStart / onVadSpeechEnd  ← Silero VAD 声学端点，供状态机 barge-in 长度门控
 *
 * 原生方法为 Promise 风格：initialize() / isAvailable() / start() / stop()。
 */

import type {
  SpeechRecognitionNative,
  EventEmitterLike,
  SpeechResult,
  SpeechError,
} from "./useSpeechRecognitionCore";

/** sherpa 原生事件名（含 VAD 端点） */
export type SherpaEventName =
  | "onSpeechStart"
  | "onSpeechEnd"
  | "onSpeechResults"
  | "onSpeechPartialResult"
  | "onSpeechError"
  | "onVadSpeechStart"
  | "onVadSpeechEnd"
  | "onMicLevel";

/** sherpa 原生模块最小接口（便于单测注入 mock） */
export interface SherpaAsrNative {
  initialize(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
}

/** 原生事件订阅器最小接口（对齐 RN NativeEventEmitter / DeviceEventEmitter 子集） */
export interface NativeEventSubscriber {
  addListener(
    event: SherpaEventName,
    listener: (payload: unknown) => void,
  ): { remove(): void };
}

interface SherpaEventMap {
  onSpeechStart: undefined;
  onSpeechEnd: undefined;
  onSpeechResults: SpeechResult;
  onSpeechPartialResult: SpeechResult;
  onSpeechError: SpeechError;
}

type SherpaEventCallback<E extends keyof SherpaEventMap> = (
  payload: SherpaEventMap[E],
) => void;

/**
 * 事件分发器：把原生 sherpa 事件桥接为 useSpeechRecognitionCore 期望的事件名。
 * VAD 端点事件（onVadSpeechStart/End）通过独立回调透出，不进入 core 的识别流。
 */
export class SherpaEventDispatcher implements EventEmitterLike {
  private listeners = new Map<
    keyof SherpaEventMap,
    Array<SherpaEventCallback<keyof SherpaEventMap>>
  >();

  addListener(
    event: string,
    callback: (evt: unknown) => void,
  ): { remove(): void } {
    const key = event as keyof SherpaEventMap;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    const list = this.listeners.get(key)!;
    const typed = callback as SherpaEventCallback<keyof SherpaEventMap>;
    list.push(typed);
    return {
      remove: () => {
        const arr = this.listeners.get(key);
        if (!arr) return;
        const idx = arr.indexOf(typed);
        if (idx >= 0) arr.splice(idx, 1);
      },
    };
  }

  emit<E extends keyof SherpaEventMap>(
    event: E,
    payload: SherpaEventMap[E],
  ): void {
    this.listeners.get(event)?.forEach((cb) => {
      (cb as SherpaEventCallback<E>)(payload);
    });
  }
}

/** VAD 端点 + mic 能量回调（供状态机 barge-in 门控） */
export interface SherpaVadHandlers {
  onVadSpeechStart?: () => void;
  onVadSpeechEnd?: () => void;
  /** 麦克风 RMS 0~1（方案 B 能量比） */
  onMicLevel?: (level: number) => void;
}

/**
 * sherpa 识别器：串行化 start/stop（native 内部亦幂等），桥接原生事件到分发器。
 * 与 VoskRecognizer 职责对等。
 */
export class SherpaRecognizer {
  private loadPromise: Promise<boolean> | null = null;
  private loaded = false;
  private active = false;
  private opChain: Promise<void> = Promise.resolve();
  readonly emitter = new SherpaEventDispatcher();
  private nativeSubs: Array<{ remove(): void }> = [];
  private vadHandlers: SherpaVadHandlers = {};

  constructor(
    private readonly native: SherpaAsrNative,
    private readonly subscriber: NativeEventSubscriber,
  ) {
    this.bindNativeEvents();
  }

  /** 注册 VAD 端点回调（状态机接入点） */
  setVadHandlers(handlers: SherpaVadHandlers): void {
    this.vadHandlers = handlers;
  }

  /** 桥接原生事件 → 分发器 / VAD 回调 */
  private bindNativeEvents(): void {
    const map: Array<[SherpaEventName, (payload: unknown) => void]> = [
      ["onSpeechStart", () => this.emitter.emit("onSpeechStart", undefined)],
      ["onSpeechEnd", () => this.emitter.emit("onSpeechEnd", undefined)],
      [
        "onSpeechResults",
        (p) => {
          const e = (p ?? {}) as { text?: string; confidence?: number };
          this.emitter.emit("onSpeechResults", {
            text: e.text ?? "",
            confidence: e.confidence ?? 1,
          });
        },
      ],
      [
        "onSpeechPartialResult",
        (p) => {
          const e = (p ?? {}) as { text?: string; confidence?: number };
          this.emitter.emit("onSpeechPartialResult", {
            text: e.text ?? "",
            confidence: e.confidence ?? 0,
          });
        },
      ],
      [
        "onSpeechError",
        (p) => {
          const e = (p ?? {}) as { code?: string; message?: string };
          this.emitter.emit("onSpeechError", {
            code: e.code ?? "sherpa_error",
            message: e.message ?? "unknown",
          });
        },
      ],
      ["onVadSpeechStart", () => this.vadHandlers.onVadSpeechStart?.()],
      ["onVadSpeechEnd", () => this.vadHandlers.onVadSpeechEnd?.()],
      [
        "onMicLevel",
        (p) => {
          const level = (p as { level?: number } | null)?.level;
          if (typeof level === "number") this.vadHandlers.onMicLevel?.(level);
        },
      ],
    ];
    this.nativeSubs = map.map(([name, cb]) =>
      this.subscriber.addListener(name, cb),
    );
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opChain.then(fn);
    this.opChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** 检测模型是否已加载（首次触发 initialize） */
  async isAvailable(): Promise<boolean> {
    if (this.loaded) return true;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.native
      .initialize()
      .then((ok) => {
        this.loaded = ok;
        return ok;
      })
      .catch((error) => {
        console.warn("[Sherpa] 初始化模型失败:", error);
        this.loaded = false;
        return false;
      });

    return this.loadPromise;
  }

  /** 开始聆听（幂等） */
  async start(): Promise<void> {
    await this.enqueue(async () => {
      if (this.active) {
        console.log("[Sherpa] start skipped: already active");
        return;
      }
      const available = await this.isAvailable();
      if (!available) {
        this.emitter.emit("onSpeechError", {
          code: "model_not_loaded",
          message: "语音模型未加载",
        });
        return;
      }
      try {
        console.log("[Sherpa] startListening called");
        await this.native.start();
        this.active = true;
      } catch (error) {
        this.active = false;
        this.emitter.emit("onSpeechError", {
          code: "start_failed",
          message: String(error),
        });
      }
    });
  }

  /** 停止聆听（排队执行） */
  stop(): void {
    void this.enqueue(async () => {
      if (!this.active) {
        console.log("[Sherpa] stop skipped: not active");
        return;
      }
      this.active = false;
      try {
        await this.native.stop();
      } catch (error) {
        console.warn("[Sherpa] stop 异常:", error);
      }
    });
  }

  /** 取消聆听（与 stop 等价） */
  cancel(): void {
    this.stop();
  }

  /** 释放原生事件订阅（测试/热重载用） */
  dispose(): void {
    this.nativeSubs.forEach((s) => s.remove());
    this.nativeSubs = [];
  }
}

let recognizerSingleton: SherpaRecognizer | null = null;

/** 懒加载 sherpa 原生模块，避免 Jest 环境加载未 link 的原生模块 */
function getRecognizerSingleton(): SherpaRecognizer {
  if (!recognizerSingleton) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules, NativeEventEmitter } = require("react-native");
    const native = NativeModules.SherpaAsr as SherpaAsrNative;
    const emitter = new NativeEventEmitter(NativeModules.SherpaAsr);
    recognizerSingleton = new SherpaRecognizer(native, emitter);
  }
  return recognizerSingleton;
}

/** 符合 SpeechRecognitionNative 接口的 sherpa 适配器 */
export const sherpaNativeModule: SpeechRecognitionNative = {
  isAvailable: () => getRecognizerSingleton().isAvailable(),
  startListening: () => {
    void getRecognizerSingleton().start();
  },
  stopListening: () => getRecognizerSingleton().stop(),
  cancelListening: () => getRecognizerSingleton().cancel(),
};

/** 创建符合 core 要求的事件发射器 */
export function createSherpaEmitter(): EventEmitterLike {
  return getRecognizerSingleton().emitter;
}

/** 注册 VAD 端点回调（在 useVoiceSession 接状态机时调用） */
export function setSherpaVadHandlers(handlers: SherpaVadHandlers): void {
  getRecognizerSingleton().setVadHandlers(handlers);
}

/** 单测用：基于 mock native + subscriber 创建独立识别器 */
export function createSherpaRecognizerForTest(
  native: SherpaAsrNative,
  subscriber: NativeEventSubscriber,
): SherpaRecognizer {
  return new SherpaRecognizer(native, subscriber);
}
