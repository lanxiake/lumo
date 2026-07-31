import { describe, it, expect } from "vitest";
import { createSystemLogBuffer, inferLevel } from "../src/perf/system-logs.js";

describe("inferLevel", () => {
  it("含错误关键词 → error", () => {
    expect(inferLevel("TTS 合成失败: boom")).toBe("error");
    expect(inferLevel("caught Error x")).toBe("error");
  });
  it("含警告/超时/降级 → warn", () => {
    expect(inferLevel("TTS 合成超时 (15000ms)")).toBe("warn");
    expect(inferLevel("引擎降级 toStream")).toBe("warn");
  });
  it("普通信息 → info", () => {
    expect(inferLevel("开始合成 5 字")).toBe("info");
  });
});

describe("createSystemLogBuffer", () => {
  it("记录并按 level 归类", () => {
    const b = createSystemLogBuffer();
    b.push("普通日志");
    b.push("出错了失败");
    expect(b.getRecent().map((l) => l.level)).toEqual(["info", "error"]);
    expect(b.totalCount()).toBe(2);
  });

  it("超过条数上限时淘汰最旧（total 仍累加）", () => {
    const b = createSystemLogBuffer({ maxLines: 10 });
    for (let i = 0; i < 25; i++) b.push(`line ${i}`);
    expect(b.getRecent().length).toBeLessThanOrEqual(10);
    expect(b.totalCount()).toBe(25);
    expect(b.getRecent().some((l) => l.message === "line 0")).toBe(false);
  });

  it("超长 message 截断", () => {
    const b = createSystemLogBuffer();
    b.push("x".repeat(5000));
    expect(b.getRecent()[0].message.endsWith("…")).toBe(true);
    expect(b.getRecent()[0].message.length).toBeLessThanOrEqual(2001);
  });
});
