/**
 * mobile-event-sink — 移动端事件出口（EventSink 实现）
 *
 * 把 AgentRuntimeEvent 转成稳定的移动端事件协议 MobileNodeEvent，经 bridge
 * 发回 RN（规范 §3.1）。支持 delta / final / thinking / tool started / tool
 * finished / error。
 *
 * 约束（规范 §3.1）：
 *  - 不在 EventSink 中直接操作 React state（只产出 MobileNodeEvent）。
 *  - 不泄漏内部错误堆栈给儿童 UI（错误转友好话术）。
 *  - final 文本先经输出安全检查再外发（规范 §5.2）。
 *
 * 消息记录 / PetOrchestrator 状态切换由 RN 侧消费事件后处理，此处只负责转换。
 */

import type { EventSink, AgentRuntimeEvent } from "@lumo/agent-runtime";
import type { MobileNodeEvent } from "../bridge/schema.js";
import { checkOutputSafety } from "../safety/output-safety.js";
import { childSafeErrorMessage } from "../safety/child-safe-response.js";

/**
 * 工具入参/结果摘要 → 儿童卡片可读的一句话（非 JSON）。
 *
 * 卡片已有「工具中文标签 + 成败徽章」，明细行只需补一个"说清在做什么"的关键值：
 * 从入参/结果里挑一个显著字段（搜索词/画的内容/游戏标题…）。纯状态对象
 * （如 {ok:true}）无显著字段 → 返回 undefined，不往儿童 UI 塞 JSON。
 */
const SUMMARY_MAX = 120;
const SALIENT_KEYS = [
  "query", "prompt", "title", "text", "keyword", "word", "name", "target", "message", "reason",
] as const;

export function summarizeToolPayload(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  let s: string | undefined;
  if (typeof value === "string") {
    s = value;
  } else if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of SALIENT_KEYS) {
      const v = obj[k];
      if (typeof v === "string" && v.trim() && !v.startsWith("data:")) {
        s = v;
        break;
      }
    }
  } else {
    s = String(value);
  }
  s = s?.trim();
  if (!s) return undefined;
  return s.length > SUMMARY_MAX ? s.slice(0, SUMMARY_MAX) + "…" : s;
}

export interface MobileEventSinkDeps {
  /** 事件外发（bridge → RN） */
  readonly emit: (event: MobileNodeEvent) => void;
  /** 可选：消息记录落库（本地 SQLite），不阻塞外发 */
  readonly onFinalText?: (text: string) => void;
  /** 可选：安全拦截审计（记录类别，不记原文） */
  readonly onSafetyBlock?: (category: string) => void;
  /** 可选：首个 agent_delta 发出（用于耗时打点） */
  readonly onFirstDelta?: () => void;
}

/**
 * 创建移动端 EventSink。
 */
export function createMobileEventSink(deps: MobileEventSinkDeps): EventSink {
  // 累积 delta 文本：message:end 的 fullText 在部分实现下为空，用累积值兜底。
  let accumulated = "";
  let firstDeltaEmitted = false;
  return {
    emit(event: AgentRuntimeEvent): void {
      switch (event.type) {
        case "message:start":
          accumulated = "";
          firstDeltaEmitted = false;
          break;

        case "message:delta":
          accumulated = event.fullText || accumulated + event.delta;
          if (!firstDeltaEmitted) {
            firstDeltaEmitted = true;
            deps.onFirstDelta?.();
          }
          deps.emit({
            type: "agent_delta",
            payload: { text: event.delta, fullText: accumulated },
          });
          break;

        case "message:thinking":
          deps.emit({ type: "agent_thinking", payload: { text: event.delta } });
          break;

        case "message:end": {
          const finalText = event.fullText || accumulated;
          accumulated = "";
          // 跳过空 final（部分流程会先发一个无内容的 message:start/end 占位，
          // 不应向儿童 UI 推空气泡）。
          if (!finalText.trim()) break;
          const check = checkOutputSafety(finalText);
          if (!check.safe) {
            deps.onSafetyBlock?.(check.category ?? "other");
            deps.emit({
              type: "safety_blocked",
              payload: { friendlyMessage: check.text, category: check.category ?? "other" },
            });
            deps.emit({ type: "agent_final", payload: { text: check.text } });
            break;
          }
          deps.onFinalText?.(check.text);
          deps.emit({ type: "agent_final", payload: { text: check.text } });
          break;
        }

        case "tool:start": {
          const paramsSummary = summarizeToolPayload(event.args);
          deps.emit({
            type: "tool_started",
            payload: {
              toolName: event.toolName,
              toolCallId: event.toolCallId,
              ...(paramsSummary ? { paramsSummary } : {}),
            },
          });
          break;
        }

        case "tool:end": {
          const resultSummary = summarizeToolPayload(event.result);
          deps.emit({
            type: "tool_finished",
            payload: {
              toolName: event.toolName,
              toolCallId: event.toolCallId,
              ok: !event.isError,
              ...(resultSummary ? { resultSummary } : {}),
            },
          });
          break;
        }

        case "agent:error":
          // 不泄漏堆栈：转友好话术。code 供 RN 侧分类展示（不进儿童 UI）。
          deps.emit({
            type: "agent_error",
            payload: {
              message: childSafeErrorMessage("agent_error"),
              ...(event.code ? { code: event.code } : {}),
            },
          });
          break;

        // agent:start / agent:end / message:start / tool:update / state-change /
        // context:compaction 不直接映射为儿童事件（PetOrchestrator 依赖 delta/final/tool）。
        default:
          break;
      }
    },
  };
}
