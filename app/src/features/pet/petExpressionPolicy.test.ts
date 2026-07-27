// 契约回归：验证 pet-core 的 expressionForState / resolveExpressionIndex 满足
// kids-mobile 关心的状态→表情语义。自研 petExpressionPolicy.ts（name-based）已删除，
// 改用 pet-core 的 index-based 表情策略（emotion 语义标签 → 模型 emotionMap → expression 索引）。
import { describe, it, expect } from "vitest";
import {
  expressionForState,
  resolveExpressionIndex,
  type PetState,
} from "@lumo/core";

const ALL_STATES: PetState[] = [
  "idle",
  "listening",
  "recognizing",
  "thinking",
  "tts_converting",
  "speaking",
  "safety_blocked",
  "offline_fallback",
  "network_error",
];

describe("expressionForState — 每个状态都有确定表情语义", () => {
  it("所有状态映射到非空 emotion 标签，无 undefined", () => {
    for (const s of ALL_STATES) {
      const se = expressionForState(s);
      expect(typeof se.emotion).toBe("string");
      expect(se.emotion.length).toBeGreaterThan(0);
    }
  });

  it("纯函数：同状态恒返回同表情", () => {
    expect(expressionForState("idle")).toEqual(expressionForState("idle"));
  });

  it("关键状态语义符合儿童预期（emotion 标签）", () => {
    expect(expressionForState("speaking").emotion).toBe("joy");
    expect(expressionForState("network_error").emotion).toBe("sadness");
    expect(expressionForState("thinking").emotion).toBe("calm");
    expect(expressionForState("safety_blocked").emotion).toBe("calm");
    expect(expressionForState("idle").emotion).toBe("neutral");
  });

  it("说话/待机带动作组，思考态无动作组", () => {
    expect(expressionForState("speaking").motionGroup).toBe("Talk");
    expect(expressionForState("idle").motionGroup).toBe("Idle");
    expect(expressionForState("thinking").motionGroup).toBeUndefined();
  });
});

describe("resolveExpressionIndex — emotion 标签经模型 emotionMap 解析为索引", () => {
  const emotionMap = { neutral: 0, joy: 3, sadness: 5, calm: 2 };

  it("命中 emotionMap 返回对应索引", () => {
    expect(resolveExpressionIndex("joy", emotionMap)).toBe(3);
    expect(resolveExpressionIndex("sadness", emotionMap)).toBe(5);
  });

  it("未命中回退 defaultExpression（默认 0）", () => {
    expect(resolveExpressionIndex("unknown", emotionMap)).toBe(0);
    expect(resolveExpressionIndex("unknown", emotionMap, 9)).toBe(9);
  });

  it("状态→表情→索引 全链路：speaking 经 emotionMap 得 joy 的索引", () => {
    const se = expressionForState("speaking");
    expect(resolveExpressionIndex(se.emotion, emotionMap)).toBe(3);
  });
});
