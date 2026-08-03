/**
 * summarizeToolPayload 测试
 *
 * 验证：从入参/结果里挑一个显著字段生成"一句话"明细（非 JSON）；
 * 纯状态对象无显著字段 → undefined；超长截断。
 */

import { describe, it, expect } from "vitest";
import { summarizeToolPayload } from "../src/host/mobile-event-sink.js";

describe("summarizeToolPayload", () => {
  it("nullish → undefined", () => {
    expect(summarizeToolPayload(undefined)).toBeUndefined();
    expect(summarizeToolPayload(null)).toBeUndefined();
    expect(summarizeToolPayload("")).toBeUndefined();
    expect(summarizeToolPayload("   ")).toBeUndefined();
  });

  it("字符串直接返回（trim）", () => {
    expect(summarizeToolPayload("  hi  ")).toBe("hi");
  });

  it("对象挑显著字段（query/prompt/title…），非 JSON", () => {
    expect(summarizeToolPayload({ query: "天气", ok: true })).toBe("天气");
    expect(summarizeToolPayload({ prompt: "一只小猫" })).toBe("一只小猫");
    expect(summarizeToolPayload({ title: "泡泡游戏", html: "<html>…" })).toBe("泡泡游戏");
  });

  it("纯状态对象无显著字段 → undefined（不塞 JSON 给儿童 UI）", () => {
    expect(summarizeToolPayload({ ok: true })).toBeUndefined();
    expect(summarizeToolPayload({ count: 3 })).toBeUndefined();
  });

  it("data URI 字段不入摘要", () => {
    expect(summarizeToolPayload({ url: "data:image/png;base64,AAAA" })).toBeUndefined();
    expect(summarizeToolPayload({ name: "data:xxx" })).toBeUndefined();
  });

  it("超长文本截断加省略号", () => {
    const s = summarizeToolPayload("a".repeat(500))!;
    expect(s.length).toBe(121); // 120 + "…"
    expect(s.endsWith("…")).toBe(true);
  });
});
