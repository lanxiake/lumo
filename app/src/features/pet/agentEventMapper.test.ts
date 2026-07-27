// 验证 MobileNodeEvent → AgentSignal（本适配层）→ PetEvent（pet-core）的端到端语义。
// 迁移（2026-07-04）：适配层只做协议翻译，网络错误分流/noop 过滤收敛到 pet-core。
import { describe, it, expect } from "vitest";
import { mapMobileEventToAgentSignal } from "./agentEventMapper.js";
import { mapAgentSignalToPetEvent, type PetEvent } from "@lumo/core";
import type { MobileNodeEvent } from "../../../node-runtime/src/bridge/schema.js";

/** 端到端：协议事件 → 归一信号 → 状态机事件 */
function toPetEvent(e: MobileNodeEvent): PetEvent | null {
  return mapAgentSignalToPetEvent(mapMobileEventToAgentSignal(e));
}

describe("mapMobileEventToAgentSignal — 协议翻译（方案 §6.2）", () => {
  it("agent_delta → delta", () => {
    expect(mapMobileEventToAgentSignal({ type: "agent_delta", payload: { text: "你", fullText: "你" } })).toEqual({
      kind: "delta",
    });
  });

  it("agent_final → final", () => {
    expect(mapMobileEventToAgentSignal({ type: "agent_final", payload: { text: "你好呀" } })).toEqual({
      kind: "final",
    });
  });

  it("safety_blocked → safety_blocked", () => {
    expect(
      mapMobileEventToAgentSignal({ type: "safety_blocked", payload: { friendlyMessage: "我们聊点别的吧", category: "adult" } }),
    ).toEqual({ kind: "safety_blocked" });
  });

  it("agent_error 原样带上 code（分流留给 pet-core）", () => {
    expect(mapMobileEventToAgentSignal({ type: "agent_error", payload: { message: "x", code: "ECONN" } })).toEqual({
      kind: "error",
      code: "ECONN",
    });
  });
});

describe("端到端 MobileNodeEvent → PetEvent（组合 pet-core）", () => {
  it("agent_delta / agent_final / safety_blocked 驱动对应状态事件", () => {
    expect(toPetEvent({ type: "agent_delta", payload: { text: "你", fullText: "你" } })).toEqual({ type: "AGENT_DELTA" });
    expect(toPetEvent({ type: "agent_final", payload: { text: "好" } })).toEqual({ type: "AGENT_FINAL" });
    expect(
      toPetEvent({ type: "safety_blocked", payload: { friendlyMessage: "换个话题", category: "adult" } }),
    ).toEqual({ type: "SAFETY_BLOCKED" });
  });

  it("network 类错误 → NETWORK_ERROR", () => {
    expect(toPetEvent({ type: "agent_error", payload: { message: "x", code: "ECONN" } })).toEqual({ type: "NETWORK_ERROR" });
    expect(toPetEvent({ type: "agent_error", payload: { message: "x", code: "ETIMEDOUT" } })).toEqual({ type: "NETWORK_ERROR" });
    expect(toPetEvent({ type: "agent_error", payload: { message: "x", code: "network_error" } })).toEqual({ type: "NETWORK_ERROR" });
  });

  it("非网络错误 → null（由 UI 用宠物语气提示）", () => {
    expect(toPetEvent({ type: "agent_error", payload: { message: "x", code: "gateway_error" } })).toBeNull();
    expect(toPetEvent({ type: "agent_error", payload: { message: "x" } })).toBeNull();
  });

  it("不驱动状态机的事件 → null", () => {
    const noops: MobileNodeEvent[] = [
      { type: "pong" },
      { type: "init_done", payload: { sessionId: "s", instanceId: "i" } },
      { type: "agent_thinking", payload: { text: "…" } },
      { type: "tool_started", payload: { toolName: "memory_read" } },
      { type: "tool_finished", payload: { toolName: "memory_read", ok: true } },
      { type: "permission_request", payload: { requestId: "r", toolName: "web_fetch", description: "d" } },
    ];
    for (const e of noops) {
      expect(toPetEvent(e)).toBeNull();
    }
  });
});
