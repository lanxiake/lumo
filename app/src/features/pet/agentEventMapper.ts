/**
 * agentEventMapper — MobileNodeEvent → pet-core AgentSignal（薄协议适配层）
 *
 * kids-mobile 专有的 MobileNodeEvent 是「协议事件」，pet-core 故意不依赖任一端协议类型，
 * 而是定义归一语义信号 AgentSignal。本文件只做**协议翻译**：把影响宠物状态的事件转成
 * AgentSignal，其余透传为 `noop`。再由 pet-core `mapAgentSignalToPetEvent` 映射为 PetEvent
 * 驱动状态机（网络错误分流、noop 过滤等语义统一收敛到 pet-core）。
 *
 * 纯函数：无副作用，仅类型翻译，便于单测。
 *
 * 迁移说明（2026-07-04）：原 `mapAgentEventToPetEvent`（直吃 MobileNodeEvent 产 PetEvent、
 * 自带网络 code 分流）已被本适配层取代——分流逻辑现由 pet-core `isNetworkErrorCode` 承担。
 */

import type { MobileNodeEvent } from "../../../node-runtime/src/bridge/schema.js";
import type { AgentSignal } from "@lumo/core";

/**
 * 将协议事件翻译为 pet-core 归一语义信号。
 * 不影响状态机的事件统一透传为 `{ kind: "noop" }`，由 UI 层单独消费。
 */
export function mapMobileEventToAgentSignal(event: MobileNodeEvent): AgentSignal {
  switch (event.type) {
    case "agent_delta":
      return { kind: "delta" };
    case "agent_final":
      return { kind: "final" };
    case "tts_failed":
      return { kind: "tts_failed" };
    case "safety_blocked":
      return { kind: "safety_blocked" };
    case "agent_error":
      return { kind: "error", code: event.payload.code };
    // 不驱动状态机：由 UI / orchestrator 其它通道处理
    case "node_ready":
    case "pong":
    case "init_done":
    case "agent_thinking":
    case "tool_started":
    case "tool_finished":
    case "permission_request":
      return { kind: "noop" };
    default:
      return { kind: "noop" };
  }
}
