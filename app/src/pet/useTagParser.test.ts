/**
 * @jest-environment jsdom
 */

/**
 * useTagParser 测试
 *
 * 覆盖阶段1 bug 修复场景：agent_final 一次性携带标签（不经过 delta 阶段）时，
 * feed() 仍需正确剥离标签并触发 onExpression/onMotion。
 */

import { describe, it, expect, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import { useTagParser } from "./useTagParser";

const emotionMap = { 开心: 3, 难过: 5 };

describe("useTagParser", () => {
  it("delta 无标签、final 一次性携带标签时仍触发 onExpression/onMotion", () => {
    const onExpression = jest.fn();
    const onMotion = jest.fn();
    const { result } = renderHook(() =>
      useTagParser({ emotionMap, onExpression, onMotion }),
    );

    // 模拟 App.tsx 中 agent_delta 阶段：纯文本，无标签
    const deltaClean = result.current.feed("你好呀");
    expect(deltaClean).toBe("你好呀");
    expect(onExpression).not.toHaveBeenCalled();
    expect(onMotion).not.toHaveBeenCalled();

    // 模拟 agent_final：整段文本（含 delta 已发送内容 + 新增标签）一次性到达
    const finalClean = result.current.feed("，很高兴见到你[开心][motion:挥手]");
    expect(finalClean).toBe("，很高兴见到你");
    expect(onExpression).toHaveBeenCalledWith(3, "开心");
    expect(onMotion).toHaveBeenCalledWith("挥手");
  });

  it("同一标签跨 delta 和 final 只触发一次（去重）", () => {
    const onExpression = jest.fn();
    const onMotion = jest.fn();
    const { result } = renderHook(() =>
      useTagParser({ emotionMap, onExpression, onMotion }),
    );

    result.current.feed("今天天气不错[开心]");
    expect(onExpression).toHaveBeenCalledTimes(1);

    // final 重复携带同一标签（例如服务端整段回传）不应再次触发
    result.current.feed("今天天气不错[开心]，我们出去玩吧");
    expect(onExpression).toHaveBeenCalledTimes(1);
  });

  it("reset 后可重新触发同名标签", () => {
    const onExpression = jest.fn();
    const onMotion = jest.fn();
    const { result } = renderHook(() =>
      useTagParser({ emotionMap, onExpression, onMotion }),
    );

    result.current.feed("[开心]你好");
    expect(onExpression).toHaveBeenCalledTimes(1);

    result.current.reset();
    result.current.feed("[开心]下一轮");
    expect(onExpression).toHaveBeenCalledTimes(2);
  });

  it("未知标签名不触发 onExpression（emotionMap 无映射）", () => {
    const onExpression = jest.fn();
    const onMotion = jest.fn();
    const { result } = renderHook(() =>
      useTagParser({ emotionMap, onExpression, onMotion }),
    );

    const clean = result.current.feed("[未知情绪]你好");
    expect(clean).toBe("你好");
    expect(onExpression).not.toHaveBeenCalled();
  });
});
