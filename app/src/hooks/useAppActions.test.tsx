/**
 * @jest-environment jsdom
 */

/**
 * useAppActions 测试
 *
 * 验证 navigate / playSound / showToast / openGallery / closeOverlay 行为。
 */

import { describe, it, expect, jest } from "@jest/globals";
import { renderHook, act } from "@testing-library/react";
import { useAppActions } from "./useAppActions";

describe("useAppActions", () => {
  it("navigate 到 gallery 打开 overlay，navigate 到 pet_stage 关闭 overlay", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => {
      result.current.actions.navigate("gallery");
    });
    expect(result.current.state.overlayOpen).toBe(true);
    expect(result.current.state.currentScreen).toBe("gallery");

    act(() => {
      result.current.actions.navigate("pet_stage");
    });
    expect(result.current.state.overlayOpen).toBe(false);
  });

  it("非法 target 被忽略", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useAppActions());

    act(() => {
      result.current.actions.navigate("unknown" as never);
    });

    expect(result.current.state.overlayOpen).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("showToast 显示并在 3 秒后隐藏", () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAppActions());

    act(() => {
      result.current.actions.showToast("真棒", "success");
    });
    expect(result.current.state.toast.visible).toBe(true);
    expect(result.current.state.toast.text).toBe("真棒");
    expect(result.current.state.toast.style).toBe("success");

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.state.toast.visible).toBe(false);
    jest.useRealTimers();
  });

  it("openGallery 添加图片并打开 gallery overlay", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => {
      result.current.actions.openGallery("https://example.com/a.png", "一只猫");
    });

    expect(result.current.state.galleryImages).toHaveLength(1);
    expect(result.current.state.galleryImages[0].url).toBe("https://example.com/a.png");
    expect(result.current.state.galleryImages[0].prompt).toBe("一只猫");
    expect(result.current.state.overlayOpen).toBe(true);
    expect(result.current.state.currentScreen).toBe("gallery");
  });

  it("closeOverlay 关闭 overlay", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => result.current.actions.navigate("gallery"));
    expect(result.current.state.overlayOpen).toBe(true);

    act(() => result.current.actions.closeOverlay());
    expect(result.current.state.overlayOpen).toBe(false);
  });

  it("设置→我的画→goBack 回到设置，再 goBack 关闭 overlay", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => result.current.actions.navigate("settings"));
    act(() => result.current.actions.navigate("gallery"));
    expect(result.current.state.currentScreen).toBe("gallery");
    expect(result.current.state.overlayOpen).toBe(true);

    act(() => result.current.actions.goBack());
    expect(result.current.state.currentScreen).toBe("settings");
    expect(result.current.state.overlayOpen).toBe(true);

    act(() => result.current.actions.goBack());
    expect(result.current.state.overlayOpen).toBe(false);
    expect(result.current.state.currentScreen).toBe("pet_stage");
  });

  it("设置→游戏/聊天 goBack 均回到设置", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => result.current.actions.navigate("settings"));
    act(() => result.current.actions.navigate("game_history"));
    act(() => result.current.actions.goBack());
    expect(result.current.state.currentScreen).toBe("settings");

    act(() => result.current.actions.navigate("chat_history"));
    act(() => result.current.actions.goBack());
    expect(result.current.state.currentScreen).toBe("settings");
  });

  it("closeOverlay 清空整栈（不停留在设置）", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => result.current.actions.navigate("settings"));
    act(() => result.current.actions.navigate("gallery"));
    act(() => result.current.actions.closeOverlay());
    expect(result.current.state.overlayOpen).toBe(false);
    expect(result.current.state.currentScreen).toBe("pet_stage");
  });

  it("openPlayground 打开 playground，closePlayground 关闭", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => {
      result.current.actions.openPlayground("<html>game</html>", "认颜色");
    });
    expect(result.current.state.playground.open).toBe(true);
    expect(result.current.state.playground.html).toBe("<html>game</html>");
    expect(result.current.state.playground.title).toBe("认颜色");

    act(() => {
      result.current.actions.closePlayground();
    });
    expect(result.current.state.playground.open).toBe(false);
    expect(result.current.state.playground.html).toBe("");
  });

  it("openPlayground 带 existingId 时不新增游戏历史", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => {
      result.current.actions.openPlayground("<html>game</html>", "认颜色");
    });
    expect(result.current.state.gameHistory).toHaveLength(1);

    act(() => {
      result.current.actions.openPlayground("<html>game</html>", "认颜色", { existingId: "game-1" });
    });
    expect(result.current.state.gameHistory).toHaveLength(1);
    expect(result.current.state.playground.open).toBe(true);
  });

  it("openPlayground 带 replaceId 时就地替换而非新增", () => {
    const { result } = renderHook(() => useAppActions());

    act(() => {
      result.current.actions.openPlayground("<html>v1</html>", "泡泡");
    });
    const created = result.current.state.gameHistory[0];
    expect(result.current.state.gameHistory).toHaveLength(1);

    act(() => {
      result.current.actions.openPlayground("<html>v2</html>", "泡泡", { replaceId: created.id });
    });
    expect(result.current.state.gameHistory).toHaveLength(1);
    expect(result.current.state.gameHistory[0].id).toBe(created.id);
    expect(result.current.state.gameHistory[0].html).toBe("<html>v2</html>");
  });

  it("openGallery / 新游戏触发 onResourceCreated", () => {
    const created: string[] = [];
    const { result } = renderHook(() =>
      useAppActions({ onResourceCreated: (info) => created.push(info.kind) }),
    );
    act(() => {
      result.current.actions.openGallery("data:image/png;base64,AA", "猫");
    });
    act(() => {
      result.current.actions.openPlayground("<html>g</html>", "数数");
    });
    expect(created).toEqual(["image", "game"]);
  });
});
