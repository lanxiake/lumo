/**
 * responsiveLayout 单测 — 档位派生 + 布局参数
 */

import { describe, it, expect } from "vitest";
import { resolveLayoutMode, layoutMetricsFor } from "./responsiveLayout.js";

describe("resolveLayoutMode", () => {
  it("手机竖屏（<600 短边）→ phone-portrait", () => {
    expect(resolveLayoutMode(390, 844)).toBe("phone-portrait"); // iPhone 类
    expect(resolveLayoutMode(360, 800)).toBe("phone-portrait"); // 常见 Android
  });

  it("手机横屏仍归 phone-portrait（儿童 App 主打竖屏）", () => {
    expect(resolveLayoutMode(844, 390)).toBe("phone-portrait");
  });

  it("平板竖屏（短边>=600 且竖）→ tablet-portrait", () => {
    expect(resolveLayoutMode(768, 1024)).toBe("tablet-portrait"); // iPad 类
    expect(resolveLayoutMode(600, 960)).toBe("tablet-portrait"); // 7" 边界
  });

  it("平板横屏（短边>=600 且横）→ tablet-landscape", () => {
    expect(resolveLayoutMode(1024, 768)).toBe("tablet-landscape");
    expect(resolveLayoutMode(1280, 800)).toBe("tablet-landscape");
  });

  it("600dp 短边为平板下界（含）", () => {
    expect(resolveLayoutMode(600, 800)).toBe("tablet-portrait");
    expect(resolveLayoutMode(599, 800)).toBe("phone-portrait");
  });
});

describe("layoutMetricsFor", () => {
  it("横屏为左右分栏，其余为堆叠", () => {
    expect(layoutMetricsFor("tablet-landscape").sideBySide).toBe(true);
    expect(layoutMetricsFor("tablet-portrait").sideBySide).toBe(false);
    expect(layoutMetricsFor("phone-portrait").sideBySide).toBe(false);
  });

  it("平板字号放大于手机", () => {
    expect(layoutMetricsFor("tablet-landscape").fontScale).toBeGreaterThan(
      layoutMetricsFor("phone-portrait").fontScale,
    );
    expect(layoutMetricsFor("tablet-portrait").fontScale).toBeGreaterThan(1);
  });

  it("stageRatio 在合理区间 (0,1)", () => {
    for (const mode of ["phone-portrait", "tablet-portrait", "tablet-landscape"] as const) {
      const r = layoutMetricsFor(mode).stageRatio;
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
    }
  });
});
