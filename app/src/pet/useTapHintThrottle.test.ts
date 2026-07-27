/**
 * @jest-environment jsdom
 */

/**
 * useTapHintThrottle 测试
 *
 * 验证防抖合并 + 冷却：连点只发一次（取最后文本）、冷却期内累积、冷却结束补发、卸载清 timer。
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { renderHook, act } from "@testing-library/react";
import { useTapHintThrottle } from "./useTapHintThrottle";

describe("useTapHintThrottle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("连点在防抖窗口内合并为一次发送，取最后一次文本", () => {
    const send = jest.fn();
    const { result } = renderHook(() =>
      useTapHintThrottle({ send, debounceMs: 700, cooldownMs: 4000 }),
    );

    act(() => {
      result.current("摸头");
      result.current("戳脸");
      result.current("挠脚");
    });
    // 防抖窗口未到，尚未发送
    expect(send).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("挠脚");
  });

  it("发送后进入冷却，冷却期内点击不立即发送", () => {
    const send = jest.fn();
    const { result } = renderHook(() =>
      useTapHintThrottle({ send, debounceMs: 700, cooldownMs: 4000 }),
    );

    act(() => {
      result.current("摸头");
      jest.advanceTimersByTime(700);
    });
    expect(send).toHaveBeenCalledTimes(1);

    // 冷却期内连点：不应再发
    act(() => {
      result.current("戳脸");
      result.current("挠脚");
      jest.advanceTimersByTime(1000);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("冷却结束后补发冷却期内的最后一次点击", () => {
    const send = jest.fn();
    const { result } = renderHook(() =>
      useTapHintThrottle({ send, debounceMs: 700, cooldownMs: 4000 }),
    );

    act(() => {
      result.current("摸头");
      jest.advanceTimersByTime(700);
    });
    expect(send).toHaveBeenLastCalledWith("摸头");

    act(() => {
      result.current("戳脸");
      result.current("挠脚"); // 冷却期内累积，取最后
    });
    // 冷却结束（4000ms）后补发
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith("挠脚");
  });

  it("冷却期内无点击则不补发", () => {
    const send = jest.fn();
    const { result } = renderHook(() =>
      useTapHintThrottle({ send, debounceMs: 700, cooldownMs: 4000 }),
    );

    act(() => {
      result.current("摸头");
      jest.advanceTimersByTime(700);
    });
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("卸载时清理 timer，不再触发发送", () => {
    const send = jest.fn();
    const { result, unmount } = renderHook(() =>
      useTapHintThrottle({ send, debounceMs: 700, cooldownMs: 4000 }),
    );

    act(() => {
      result.current("摸头");
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(send).not.toHaveBeenCalled();
  });
});
