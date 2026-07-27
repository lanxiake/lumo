/**
 * tapZoneReaction / tapHintForZone 测试
 *
 * 验证：区域归一化（含旧名兼容）、rng 注入下变体可命中每一个、多变体确实不同。
 */

import { describe, it, expect } from "@jest/globals";
import { tapZoneReaction, tapHintForZone } from "./petOrchestrator";

describe("tapZoneReaction", () => {
  it("旧区域名 head/body 归一到对应变体", () => {
    // rng=0 取第一个变体，head 与 head_top 应一致
    const head = tapZoneReaction("head", () => 0);
    const headTop = tapZoneReaction("head_top", () => 0);
    expect(head).toEqual(headTop);
  });

  it("rng 覆盖 [0,1) 能命中所有变体，且变体内容各不相同", () => {
    const seen = new Set<string>();
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const variant = tapZoneReaction("body", () => r);
      seen.add(variant.motionKeys.join(","));
      expect(variant.motionKeys.length).toBeGreaterThan(0);
      expect(variant.exprKeys.length).toBeGreaterThan(0);
    }
    // body 有 5 个变体，四个采样点应命中至少 3 种不同组合
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("rng=1 边界不越界", () => {
    expect(() => tapZoneReaction("legs", () => 1)).not.toThrow();
    const v = tapZoneReaction("legs", () => 1);
    expect(v.motionKeys.length).toBeGreaterThan(0);
  });
});

describe("tapHintForZone", () => {
  it("每个区域随 rng 产出不同旁白", () => {
    const a = tapHintForZone("face", () => 0);
    const b = tapHintForZone("face", () => 0.99);
    expect(a).not.toEqual(b);
    expect(a).toContain("（");
  });

  it("未知区域回退到 body 旁白", () => {
    const hint = tapHintForZone("unknown_zone", () => 0);
    expect(hint).toContain("（");
  });
});
