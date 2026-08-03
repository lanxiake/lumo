import { describe, it, expect, vi } from "vitest";
import { createMobileEventSink } from "../src/host/mobile-event-sink.js";
import type { MobileNodeEvent } from "../src/bridge/schema.js";

function collect() {
  const events: MobileNodeEvent[] = [];
  const sink = createMobileEventSink({ emit: (e) => events.push(e) });
  return { events, sink };
}

describe("mobile-event-sink", () => {
  it("message:delta → agent_delta", () => {
    const { events, sink } = collect();
    sink.emit({ type: "message:delta", instanceId: "i", delta: "你", fullText: "你" });
    expect(events).toEqual([{ type: "agent_delta", payload: { text: "你", fullText: "你" } }]);
  });

  it("安全的 message:end → agent_final 原文", () => {
    const { events, sink } = collect();
    sink.emit({ type: "message:end", instanceId: "i", fullText: "你好呀小朋友" });
    expect(events).toContainEqual({ type: "agent_final", payload: { text: "你好呀小朋友" } });
  });

  it("空 message:end 不推空气泡", () => {
    const { events, sink } = collect();
    sink.emit({ type: "message:start", instanceId: "i" });
    sink.emit({ type: "message:end", instanceId: "i", fullText: "" });
    expect(events.some((e) => e.type === "agent_final")).toBe(false);
  });

  it("delta 累积后空 fullText 的 message:end 用累积值兜底", () => {
    const { events, sink } = collect();
    sink.emit({ type: "message:start", instanceId: "i" });
    sink.emit({ type: "message:delta", instanceId: "i", delta: "你", fullText: "你" });
    sink.emit({ type: "message:delta", instanceId: "i", delta: "好", fullText: "你好" });
    sink.emit({ type: "message:end", instanceId: "i", fullText: "" });
    expect(events).toContainEqual({ type: "agent_final", payload: { text: "你好" } });
  });

  it("不安全的 message:end 触发 safety_blocked 且不外发原文", () => {
    const onSafetyBlock = vi.fn();
    const events: MobileNodeEvent[] = [];
    const sink = createMobileEventSink({ emit: (e) => events.push(e), onSafetyBlock });
    sink.emit({ type: "message:end", instanceId: "i", fullText: "这是色情内容" });
    expect(onSafetyBlock).toHaveBeenCalledWith("adult");
    expect(events.some((e) => e.type === "safety_blocked")).toBe(true);
    const final = events.find((e) => e.type === "agent_final");
    expect(final && "payload" in final && final.payload.text).not.toContain("色情");
  });

  it("tool:start/end → tool_started/tool_finished（含 toolCallId）", () => {
    const { events, sink } = collect();
    sink.emit({ type: "tool:start", instanceId: "i", toolCallId: "c", toolName: "web_search", args: { query: "天气" } });
    sink.emit({ type: "tool:end", instanceId: "i", toolCallId: "c", toolName: "web_search", result: { ok: true }, isError: false });
    expect(events).toContainEqual({
      type: "tool_started",
      payload: { toolName: "web_search", toolCallId: "c", paramsSummary: "天气" },
    });
    // 纯状态结果 {ok:true} 无显著字段 → 不带 resultSummary（成败由徽章表达）
    expect(events).toContainEqual({
      type: "tool_finished",
      payload: { toolName: "web_search", toolCallId: "c", ok: true },
    });
  });

  it("agent:error 转友好话术，不泄漏堆栈", () => {
    const { events, sink } = collect();
    sink.emit({ type: "agent:error", instanceId: "i", error: "Error: connection refused at line 42", code: "ECONN" });
    const err = events.find((e) => e.type === "agent_error");
    expect(err).toBeTruthy();
    if (err && err.type === "agent_error") {
      expect(err.payload.message).not.toContain("connection refused");
      expect(err.payload.code).toBe("ECONN");
    }
  });

  it("onFinalText 回调仅在安全时触发", () => {
    const onFinalText = vi.fn();
    const sink = createMobileEventSink({ emit: () => {}, onFinalText });
    sink.emit({ type: "message:end", instanceId: "i", fullText: "开心的一天" });
    expect(onFinalText).toHaveBeenCalledWith("开心的一天");
  });
});
