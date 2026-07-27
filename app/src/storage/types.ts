/**
 * types.ts — RN 侧本地存储接口（异步版本）
 *
 * 替代 op-sqlite 的同步 SqliteDatabase 契约，改用 react-native-fs 文件 IO。
 * 所有方法均为异步，调用方（useSessionPersistence）用 async/await。
 */

import type {
  SessionRow,
  MessageRow,
  MemoryRow,
  ToolAuditRow,
} from "../../node-runtime/src/memory/local-session-memory";

export type { SessionRow, MessageRow, MemoryRow, ToolAuditRow };

export interface LocalSessionStore {
  upsertSession(input: { sessionId: string; petId: string; title?: string }): Promise<void>;
  getSession(sessionId: string): Promise<SessionRow | null>;
  listSessions(): Promise<SessionRow[]>;

  appendMessage(input: { sessionId: string; role: string; content: string }): Promise<void>;
  /** 按时间正序返回；传 limit 则取最近 N 条（仍正序） */
  listMessages(sessionId: string, limit?: number): Promise<MessageRow[]>;

  putMemory(input: { petId: string; key: string; value: string }): Promise<void>;
  getMemory(petId: string, key: string): Promise<string | null>;
  listMemories(petId: string): Promise<MemoryRow[]>;

  recordToolAudit(input: {
    sessionId: string;
    toolName: string;
    decision: string;
    success: boolean;
    summary: string;
    startedAt: number;
    finishedAt: number;
  }): Promise<void>;
  listToolAudits(sessionId: string): Promise<ToolAuditRow[]>;

  deleteSession(sessionId: string): Promise<void>;
  clearMessages(sessionId: string): Promise<void>;
  clearMemories(petId: string): Promise<void>;
}

export interface LocalStoreFactory {
  open(): Promise<LocalSessionStore>;
}
