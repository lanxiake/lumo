/**
 * local-session-memory — 移动端本地 SQLite DAO（方案 §7.3，规范 §4.4）
 *
 * 移动端会话记录 / 短期记忆 / 工具审计落在本地 SQLite（RN 侧用 op-sqlite/expo，
 * node-runtime 侧用 node:sqlite）。本文件是 DAO 层，接受一个可注入的
 * DatabaseSync 兼容实例，便于用内存库做真实 SQL 单测（不 mock）。
 *
 * 四张表（方案 §7.3）：
 *  - sessions：本地会话
 *  - messages：会话消息
 *  - local_memories：MVP 短期记忆（petId + key → value）
 *  - tool_audits：工具调用审计（规范 §4.4 必填字段）
 *
 * 安全（规范 §4.4）：审计不得记录完整敏感输入 / JWT / API Key，仅记简短摘要。
 * 调用方负责传入脱敏后的 summary。
 */

/** node:sqlite DatabaseSync 的最小子集，便于注入与测试 */
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SessionRow {
  readonly sessionId: string;
  readonly petId: string;
  readonly title: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface MessageRow {
  readonly id: number;
  readonly sessionId: string;
  readonly role: string;
  readonly content: string;
  readonly createdAt: number;
}

export interface MemoryRow {
  readonly petId: string;
  readonly key: string;
  readonly value: string;
  readonly updatedAt: number;
}

export interface ToolAuditRow {
  readonly id: number;
  readonly sessionId: string;
  readonly toolName: string;
  readonly decision: string;
  readonly success: boolean;
  readonly summary: string;
  readonly startedAt: number;
  readonly finishedAt: number;
}

export interface LocalSessionStore {
  upsertSession(input: { sessionId: string; petId: string; title?: string }): void;
  getSession(sessionId: string): SessionRow | null;
  listSessions(): SessionRow[];

  appendMessage(input: { sessionId: string; role: string; content: string }): void;
  /** 按时间正序返回；传 limit 则取最近 N 条（仍正序） */
  listMessages(sessionId: string, limit?: number): MessageRow[];

  putMemory(input: { petId: string; key: string; value: string }): void;
  getMemory(petId: string, key: string): string | null;
  listMemories(petId: string): MemoryRow[];

  recordToolAudit(input: {
    sessionId: string;
    toolName: string;
    decision: string;
    success: boolean;
    summary: string;
    startedAt: number;
    finishedAt: number;
  }): void;
  listToolAudits(sessionId: string): ToolAuditRow[];

  // 数据删除能力（规范 §6.3，UI 可后续补齐，底层必须存在）
  /** 删除单个会话（级联其消息与审计） */
  deleteSession(sessionId: string): void;
  /** 清空某会话的消息（保留会话与审计） */
  clearMessages(sessionId: string): void;
  /** 清空某 pet 的本地短期记忆 */
  clearMemories(petId: string): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  pet_id     TEXT NOT NULL,
  title      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
CREATE TABLE IF NOT EXISTS local_memories (
  pet_id     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pet_id, key)
);
CREATE TABLE IF NOT EXISTS tool_audits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  decision    TEXT NOT NULL,
  success     INTEGER NOT NULL,
  summary     TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audits_session ON tool_audits(session_id, id);
`;

/**
 * 初始化表结构并返回 DAO。可对同一 db 重复调用（CREATE TABLE IF NOT EXISTS 幂等）。
 */
export function createLocalSessionStore(db: SqliteDatabase): LocalSessionStore {
  db.exec(SCHEMA);
  const now = () => Date.now();

  return {
    upsertSession({ sessionId, petId, title }) {
      const ts = now();
      db.prepare(
        `INSERT INTO sessions (session_id, pet_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           pet_id = excluded.pet_id,
           title = excluded.title,
           updated_at = excluded.updated_at`,
      ).run(sessionId, petId, title ?? null, ts, ts);
    },

    getSession(sessionId) {
      const row = db
        .prepare(`SELECT * FROM sessions WHERE session_id = ?`)
        .get(sessionId) as Record<string, unknown> | undefined;
      return row ? mapSession(row) : null;
    },

    listSessions() {
      const rows = db
        .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`)
        .all() as Record<string, unknown>[];
      return rows.map(mapSession);
    },

    appendMessage({ sessionId, role, content }) {
      db.prepare(
        `INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)`,
      ).run(sessionId, role, content, now());
    },

    listMessages(sessionId, limit) {
      if (limit != null) {
        // 取最近 N 条（按 id 倒序），再翻转成正序返回
        const rows = db
          .prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?`)
          .all(sessionId, limit) as Record<string, unknown>[];
        return rows.map(mapMessage).reverse();
      }
      const rows = db
        .prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC`)
        .all(sessionId) as Record<string, unknown>[];
      return rows.map(mapMessage);
    },

    putMemory({ petId, key, value }) {
      db.prepare(
        `INSERT INTO local_memories (pet_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(pet_id, key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      ).run(petId, key, value, now());
    },

    getMemory(petId, key) {
      const row = db
        .prepare(`SELECT value FROM local_memories WHERE pet_id = ? AND key = ?`)
        .get(petId, key) as { value?: unknown } | undefined;
      return row && typeof row.value === "string" ? row.value : null;
    },

    listMemories(petId) {
      const rows = db
        .prepare(`SELECT * FROM local_memories WHERE pet_id = ? ORDER BY updated_at DESC`)
        .all(petId) as Record<string, unknown>[];
      return rows.map(mapMemory);
    },

    recordToolAudit(a) {
      db.prepare(
        `INSERT INTO tool_audits
           (session_id, tool_name, decision, success, summary, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        a.sessionId,
        a.toolName,
        a.decision,
        a.success ? 1 : 0,
        a.summary,
        a.startedAt,
        a.finishedAt,
      );
    },

    listToolAudits(sessionId) {
      const rows = db
        .prepare(`SELECT * FROM tool_audits WHERE session_id = ? ORDER BY id ASC`)
        .all(sessionId) as Record<string, unknown>[];
      return rows.map(mapAudit);
    },

    deleteSession(sessionId) {
      db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
      db.prepare(`DELETE FROM tool_audits WHERE session_id = ?`).run(sessionId);
      db.prepare(`DELETE FROM sessions WHERE session_id = ?`).run(sessionId);
    },

    clearMessages(sessionId) {
      db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
    },

    clearMemories(petId) {
      db.prepare(`DELETE FROM local_memories WHERE pet_id = ?`).run(petId);
    },
  };
}

function mapSession(r: Record<string, unknown>): SessionRow {
  return {
    sessionId: String(r.session_id),
    petId: String(r.pet_id),
    title: r.title == null ? null : String(r.title),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function mapMessage(r: Record<string, unknown>): MessageRow {
  return {
    id: Number(r.id),
    sessionId: String(r.session_id),
    role: String(r.role),
    content: String(r.content),
    createdAt: Number(r.created_at),
  };
}

function mapMemory(r: Record<string, unknown>): MemoryRow {
  return {
    petId: String(r.pet_id),
    key: String(r.key),
    value: String(r.value),
    updatedAt: Number(r.updated_at),
  };
}

function mapAudit(r: Record<string, unknown>): ToolAuditRow {
  return {
    id: Number(r.id),
    sessionId: String(r.session_id),
    toolName: String(r.tool_name),
    decision: String(r.decision),
    success: Number(r.success) === 1,
    summary: String(r.summary),
    startedAt: Number(r.started_at),
    finishedAt: Number(r.finished_at),
  };
}
