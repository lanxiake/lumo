/**
 * useSessionPersistence — RN 侧会话/消息落库 + 启动回填
 *
 * 关键决策：以**稳定的 sessionKey** 作 DAO 主键。
 * 失败降级：getLocalStore/DAO 调用全包 try/catch，失败仅记日志并把 ready 置 false。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageRow, LocalSessionStore } from "./types";
import { getLocalStore } from "./database";
import { EVENT_MESSAGE_ROLE } from "../chat/eventMessage";

/** 回填历史时最多取最近 N 条（避免超长会话一次性灌满内存/UI） */
const HISTORY_LIMIT = 50;

export interface UseSessionPersistenceOptions {
  /** 稳定会话标识（落库主键） */
  readonly sessionKey: string;
  /** 宠物 ID（sessions 表外键，用于多宠物隔离） */
  readonly petId: string;
}

export interface UseSessionPersistenceResult {
  /** DB 是否就绪（false 时静默降级，不持久化） */
  readonly ready: boolean;
  /** 启动回填的历史消息（DB 未就绪时为空数组） */
  readonly history: readonly MessageRow[];
  /** 记录用户消息（发送时调） */
  readonly recordUserMessage: (text: string) => void;
  /** 记录 Agent 最终回复（收到 agent_final 时调） */
  readonly recordAssistantFinal: (text: string) => void;
  /**
   * 记录事件卡片（工具调用/图画/小游戏），content 为 encodeEventMessage 编码串。
   * 用于设置页聊天记录能回看工具调用等系统事件（内存 messages 不持久化）。
   */
  readonly recordEventMessage: (content: string) => void;
}

export function useSessionPersistence(
  options: UseSessionPersistenceOptions,
): UseSessionPersistenceResult {
  const { sessionKey, petId } = options;
  const storeRef = useRef<LocalSessionStore | null>(null);
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<readonly MessageRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const store = await getLocalStore();
        if (cancelled) return;
        await store.upsertSession({ sessionId: sessionKey, petId });
        const past = await store.listMessages(sessionKey, HISTORY_LIMIT);
        if (cancelled) return;
        storeRef.current = store;
        setHistory(past);
        setReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[useSessionPersistence] 本地存储不可用，本次不持久化: ${message}`);
        storeRef.current = null;
        setReady(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [sessionKey, petId]);

  const recordUserMessage = useCallback(
    (text: string) => {
      const store = storeRef.current;
      if (!store || !text) return;
      void store.appendMessage({ sessionId: sessionKey, role: "user", content: text }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[useSessionPersistence] 写入用户消息失败: ${message}`);
      });
    },
    [sessionKey],
  );

  const recordAssistantFinal = useCallback(
    (text: string) => {
      const store = storeRef.current;
      if (!store || !text) return;
      void store.appendMessage({ sessionId: sessionKey, role: "assistant", content: text }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[useSessionPersistence] 写入回复失败: ${message}`);
      });
    },
    [sessionKey],
  );

  const recordEventMessage = useCallback(
    (content: string) => {
      const store = storeRef.current;
      if (!store || !content) return;
      void store
        .appendMessage({ sessionId: sessionKey, role: EVENT_MESSAGE_ROLE, content })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[useSessionPersistence] 写入事件卡片失败: ${message}`);
        });
    },
    [sessionKey],
  );

  return { ready, history, recordUserMessage, recordAssistantFinal, recordEventMessage };
}
