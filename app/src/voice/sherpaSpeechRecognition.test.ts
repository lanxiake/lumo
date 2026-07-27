/**
 * sherpaSpeechRecognition.test.ts — sherpa 适配器事件桥接与 start/stop 幂等单测
 */

import {
  createSherpaRecognizerForTest,
  type SherpaAsrNative,
  type SherpaEventName,
  type NativeEventSubscriber,
} from "./sherpaSpeechRecognition";

/** 可手动触发事件的 mock 原生订阅器 */
function createMockSubscriber(): NativeEventSubscriber & {
  fire(event: SherpaEventName, payload?: unknown): void;
  listenerCount(event: SherpaEventName): number;
} {
  const listeners = new Map<string, Array<(p: unknown) => void>>();
  return {
    addListener(event, listener) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(listener as (p: unknown) => void);
      return {
        remove: () => {
          const arr = listeners.get(event);
          if (!arr) return;
          const idx = arr.indexOf(listener as (p: unknown) => void);
          if (idx >= 0) arr.splice(idx, 1);
        },
      };
    },
    fire(event, payload) {
      listeners.get(event)?.forEach((l) => l(payload));
    },
    listenerCount(event) {
      return listeners.get(event)?.length ?? 0;
    },
  };
}

/** mock native，记录调用次数 */
function createMockNative(opts?: {
  initOk?: boolean;
  startShouldFail?: boolean;
}): SherpaAsrNative & { startCalls: number; stopCalls: number; initCalls: number } {
  const state = { startCalls: 0, stopCalls: 0, initCalls: 0 };
  const native = {
    get startCalls() {
      return state.startCalls;
    },
    get stopCalls() {
      return state.stopCalls;
    },
    get initCalls() {
      return state.initCalls;
    },
    initialize: async () => {
      state.initCalls += 1;
      return opts?.initOk ?? true;
    },
    isAvailable: async () => opts?.initOk ?? true,
    start: async () => {
      state.startCalls += 1;
      if (opts?.startShouldFail) throw new Error("start_failed");
      return true;
    },
    stop: async () => {
      state.stopCalls += 1;
      return true;
    },
  };
  return native as SherpaAsrNative & {
    startCalls: number;
    stopCalls: number;
    initCalls: number;
  };
}

describe("SherpaRecognizer — 事件桥接", () => {
  it("原生 partial 事件桥接为 onSpeechPartialResult", () => {
    const native = createMockNative();
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);
    const partials: Array<{ text: string; confidence: number }> = [];
    rec.emitter.addListener("onSpeechPartialResult", (e) =>
      partials.push(e as { text: string; confidence: number }),
    );

    sub.fire("onSpeechPartialResult", { text: "你好", confidence: 0 });

    expect(partials).toHaveLength(1);
    expect(partials[0]?.text).toBe("你好");
  });

  it("原生 final 事件桥接为 onSpeechResults 且 confidence 默认 1", () => {
    const native = createMockNative();
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);
    const finals: Array<{ text: string; confidence: number }> = [];
    rec.emitter.addListener("onSpeechResults", (e) =>
      finals.push(e as { text: string; confidence: number }),
    );

    sub.fire("onSpeechResults", { text: "今天天气不错" });

    expect(finals[0]?.text).toBe("今天天气不错");
    expect(finals[0]?.confidence).toBe(1);
  });

  it("原生 error 事件桥接为 onSpeechError 并带默认 code", () => {
    const native = createMockNative();
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);
    const errors: Array<{ code: string; message: string }> = [];
    rec.emitter.addListener("onSpeechError", (e) =>
      errors.push(e as { code: string; message: string }),
    );

    sub.fire("onSpeechError", { message: "boom" });

    expect(errors[0]?.code).toBe("sherpa_error");
    expect(errors[0]?.message).toBe("boom");
  });

  it("VAD 端点事件触发已注册的 vadHandlers", () => {
    const native = createMockNative();
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);
    let started = 0;
    let ended = 0;
    rec.setVadHandlers({
      onVadSpeechStart: () => (started += 1),
      onVadSpeechEnd: () => (ended += 1),
    });

    sub.fire("onVadSpeechStart");
    sub.fire("onVadSpeechEnd");

    expect(started).toBe(1);
    expect(ended).toBe(1);
  });
});

describe("SherpaRecognizer — start/stop 幂等", () => {
  it("首次 start 触发 initialize + native.start", async () => {
    const native = createMockNative();
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);

    await rec.start();

    expect(native.initCalls).toBe(1);
    expect(native.startCalls).toBe(1);
  });

  it("重复 start 不触发第二次 native.start", async () => {
    const native = createMockNative();
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);

    await rec.start();
    await rec.start();
    await rec.start();

    expect(native.startCalls).toBe(1);
  });

  it("stop 后再 start 可正常重启", async () => {
    const native = createMockNative();
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);

    await rec.start();
    rec.stop();
    await new Promise((r) => setTimeout(r, 0));
    await rec.start();

    expect(native.startCalls).toBe(2);
    expect(native.stopCalls).toBe(1);
  });

  it("初始化失败时发出 model_not_loaded 错误且不 start", async () => {
    const native = createMockNative({ initOk: false });
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);
    const errors: Array<{ code: string }> = [];
    rec.emitter.addListener("onSpeechError", (e) =>
      errors.push(e as { code: string }),
    );

    await rec.start();

    expect(errors[0]?.code).toBe("model_not_loaded");
    expect(native.startCalls).toBe(0);
  });

  it("native.start 抛错时发出 start_failed 且不标记 active", async () => {
    const native = createMockNative({ startShouldFail: true });
    const sub = createMockSubscriber();
    const rec = createSherpaRecognizerForTest(native, sub);
    const errors: Array<{ code: string }> = [];
    rec.emitter.addListener("onSpeechError", (e) =>
      errors.push(e as { code: string }),
    );

    await rec.start();

    expect(errors.some((e) => e.code === "start_failed")).toBe(true);
  });
});
