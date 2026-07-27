/**
 * @vitest-environment jsdom
 */

/**
 * useConversationMode 测试
 *
 * 验证 normal / phone_call 手动切换。
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversationMode } from "./useConversationMode";

describe("useConversationMode", () => {
  it("默认模式为 normal", () => {
    const { result } = renderHook(() => useConversationMode());
    expect(result.current.mode).toBe("normal");
  });

  it("enterPhoneCall 进入 phone_call", () => {
    const { result } = renderHook(() => useConversationMode());
    act(() => result.current.enterPhoneCall());
    expect(result.current.mode).toBe("phone_call");
  });

  it("exitPhoneCall 回到 normal", () => {
    const { result } = renderHook(() => useConversationMode());
    act(() => result.current.enterPhoneCall());
    act(() => result.current.exitPhoneCall());
    expect(result.current.mode).toBe("normal");
  });

  it("wakeUp 从 normal 进入 phone_call", () => {
    const { result } = renderHook(() => useConversationMode());
    act(() => result.current.wakeUp());
    expect(result.current.mode).toBe("phone_call");
  });

  it("onModeChange 在模式切换时触发", () => {
    const onModeChange = vi.fn();
    const { result } = renderHook(() => useConversationMode({ onModeChange }));
    act(() => result.current.enterPhoneCall());
    expect(onModeChange).toHaveBeenCalledWith("phone_call", "normal");
  });

  it("3 分钟无输入不会自动进入 standby", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useConversationMode());
    act(() => result.current.enterPhoneCall());
    act(() => vi.advanceTimersByTime(3 * 60 * 1000));
    expect(result.current.mode).toBe("phone_call");
    vi.useRealTimers();
  });
});
