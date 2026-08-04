/**
 * @vitest-environment jsdom
 *
 * useSpeechRecognitionCore.test.ts — SpeechRecognition Hook 核心逻辑单测
 *
 * 通过 opts 注入 mock，零 RN 运行时依赖。
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useSpeechRecognitionCore,
  type SpeechRecognitionNative,
  type EventEmitterLike,
  type RequestMicPermissionFn,
} from "./useSpeechRecognitionCore";

function createMockEmitter(): {
  emitter: EventEmitterLike;
  trigger(event: string, payload?: unknown): void;
} {
  const listeners = new Map<string, Array<(evt: unknown) => void>>();
  return {
    emitter: {
      addListener(event, callback) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(callback);
        return {
          remove() {
            const arr = listeners.get(event);
            if (arr) {
              const idx = arr.indexOf(callback);
              if (idx >= 0) arr.splice(idx, 1);
            }
          },
        };
      },
    },
    trigger(event, payload) {
      listeners.get(event)?.forEach((cb) => cb(payload));
    },
  };
}

function createMockNativeModule(
  overrides: Partial<SpeechRecognitionNative> = {},
): SpeechRecognitionNative {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    cancelListening: vi.fn(),
    ...overrides,
  };
}

const allowPermission: RequestMicPermissionFn = vi.fn().mockResolvedValue(true);
const denyPermission: RequestMicPermissionFn = vi.fn().mockResolvedValue(false);

describe("useSpeechRecognitionCore — 基础状态", () => {
  it("挂载后检测可用性", async () => {
    const mod = createMockNativeModule();
    const { emitter } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(mod.isAvailable).toHaveBeenCalledTimes(1);
  });

  it("初始状态：未在识别，无结果无错误", () => {
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({ nativeModule: null, requestPermission: allowPermission }),
    );
    expect(result.current.listening).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("NativeModule 为 null 时 available 保持 null", () => {
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({ nativeModule: null, requestPermission: allowPermission }),
    );
    expect(result.current.available).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("useSpeechRecognitionCore — 开始/停止/取消", () => {
  it("start 调用 nativeModule.startListening('zh-CN')", async () => {
    const mod = createMockNativeModule();
    const { emitter } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(mod.startListening).toHaveBeenCalledWith("zh-CN");
  });

  it("已在聆听时重复 start 不再调用 nativeModule", async () => {
    const mod = createMockNativeModule();
    const { emitter, trigger } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      trigger("onSpeechStart", undefined);
    });
    await act(async () => {
      await result.current.start();
    });
    expect(mod.startListening).toHaveBeenCalledTimes(1);
  });

  it("stop 调用 nativeModule.stopListening()", () => {
    const mod = createMockNativeModule();
    const { emitter } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    act(() => {
      result.current.stop();
    });
    expect(mod.stopListening).toHaveBeenCalledTimes(1);
  });

  it("cancel 调用 nativeModule.cancelListening()", () => {
    const mod = createMockNativeModule();
    const { emitter } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    act(() => {
      result.current.cancel();
    });
    expect(mod.cancelListening).toHaveBeenCalledTimes(1);
  });
});

describe("useSpeechRecognitionCore — 权限", () => {
  it("权限拒绝时设置错误且不调用 startListening", async () => {
    const mod = createMockNativeModule();
    const { emitter } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: denyPermission,
        createEmitter: () => emitter,
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.code).toBe("permissions");
    expect(mod.startListening).not.toHaveBeenCalled();
  });

  it("权限允许后才调用 startListening", async () => {
    const mod = createMockNativeModule();
    const { emitter } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(mod.startListening).toHaveBeenCalledWith("zh-CN");
  });
});

describe("useSpeechRecognitionCore — 事件驱动", () => {
  it("onSpeechStart → listening=true", () => {
    const mod = createMockNativeModule();
    const { emitter, trigger } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    act(() => {
      trigger("onSpeechStart");
    });
    expect(result.current.listening).toBe(true);
  });

  it("onSpeechResults → result 有值且 listening=false", () => {
    const mod = createMockNativeModule();
    const { emitter, trigger } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    act(() => {
      trigger("onSpeechResults", { text: "你好呀", confidence: 0.95 });
    });
    expect(result.current.listening).toBe(false);
    expect(result.current.result).toEqual({ text: "你好呀", confidence: 0.95 });
  });

  it("onSpeechError → error 有值且 listening=false", () => {
    const mod = createMockNativeModule();
    const { emitter, trigger } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    act(() => {
      trigger("onSpeechError", { code: "network_error", message: "网络错误" });
    });
    expect(result.current.listening).toBe(false);
    expect(result.current.error).toEqual({ code: "network_error", message: "网络错误" });
  });
});

describe("useSpeechRecognitionCore — 清除", () => {
  it("clear 清除结果和错误", () => {
    const mod = createMockNativeModule();
    const { emitter, trigger } = createMockEmitter();
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({
        nativeModule: mod,
        requestPermission: allowPermission,
        createEmitter: () => emitter,
      }),
    );
    act(() => {
      trigger("onSpeechError", { code: "no_match", message: "没听清" });
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clear();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });
});

describe("useSpeechRecognitionCore — NativeModule 不存在", () => {
  it("start 时设置 not_available 错误", async () => {
    const { result } = renderHook(() =>
      useSpeechRecognitionCore({ nativeModule: null, requestPermission: allowPermission }),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error?.code).toBe("not_available");
  });
});
