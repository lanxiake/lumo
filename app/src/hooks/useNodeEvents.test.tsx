/**
 * @jest-environment jsdom
 */

/**
 * useNodeEvents 测试
 *
 * 验证 lastEvent → AppActions 分发逻辑。
 */

import { describe, it, expect, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import { useNodeEvents } from "./useNodeEvents";
import type { AppActions } from "./useAppActions";
import type { MobileNodeEvent } from "../../node-runtime/src/bridge/schema";

function makeActions(): AppActions & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    navigate: (target, reason) => calls.push({ type: "navigate", target, reason }),
    playSound: (sound, volume) => calls.push({ type: "playSound", sound, volume }),
    showToast: (text, style) => calls.push({ type: "showToast", text, style }),
    openGallery: (url, prompt) => calls.push({ type: "openGallery", url, prompt }),
    openPlayground: (html, title) => calls.push({ type: "openPlayground", html, title }),
    closePlayground: () => calls.push({ type: "closePlayground" }),
    closeOverlay: () => calls.push({ type: "closeOverlay" }),
    goBack: () => calls.push({ type: "goBack" }),
    deleteImage: (index) => calls.push({ type: "deleteImage", index }),
    deleteGame: (id) => calls.push({ type: "deleteGame", id }),
  };
}

describe("useNodeEvents", () => {
  it("navigate 事件调用 actions.navigate", () => {
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: { type: "navigate", payload: { target: "gallery", reason: "看看画" } } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toContainEqual({ type: "navigate", target: "gallery", reason: "看看画" });
  });

  it("play_sound 事件调用 actions.playSound", () => {
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: { type: "play_sound", payload: { sound: "success", volume: 0.7 } } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toContainEqual({ type: "playSound", sound: "success", volume: 0.7 });
  });

  it("show_toast 事件调用 actions.showToast", () => {
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: { type: "show_toast", payload: { text: "完成", style: "success" } } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toContainEqual({ type: "showToast", text: "完成", style: "success" });
  });

  it("image_ready 事件调用 actions.openGallery", () => {
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: { type: "image_ready", payload: { url: "https://x/a.png", prompt: "猫" } } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toContainEqual({ type: "openGallery", url: "https://x/a.png", prompt: "猫" });
  });

  it("非法 navigate target 不调用 action 并输出警告", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: { type: "navigate", payload: { target: "evil_screen", reason: "" } } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("非法 play_sound 名称不调用 action 并输出警告", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: { type: "play_sound", payload: { sound: "bomb", volume: 0.7 } } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("playground_open 事件调用 actions.openPlayground", () => {
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: {
          type: "playground_open",
          payload: { type: "game", title: "认颜色", html: "<html></html>" },
        } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toContainEqual({
      type: "openPlayground",
      html: "<html></html>",
      title: "认颜色",
    });
  });

  it("playground_close 事件调用 actions.closePlayground", () => {
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: {
          type: "playground_close",
          payload: { reason: "timeout" },
        } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toContainEqual({ type: "closePlayground" });
  });

  it("未知事件不调用任何 action", () => {
    const actions = makeActions();
    renderHook(({ event }) => useNodeEvents(event, actions), {
      initialProps: {
        event: { type: "agent_delta", payload: { text: "hi", fullText: "hi" } } as MobileNodeEvent,
      },
    });

    expect(actions.calls).toHaveLength(0);
  });
});
