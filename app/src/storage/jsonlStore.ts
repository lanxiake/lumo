/**
 * jsonlStore.ts — 基于 react-native-fs 的 JSONL 本地存储实现
 *
 * 替代 op-sqlite，把所有本地数据放在应用私有目录的 jsonl/ 下：
 *   - sessions.json    会话列表（小文件，全量 JSON）
 *   - messages.jsonl   消息（追加写，tail 最近 N 条）
 *   - memories.json    短期记忆（小文件，全量 JSON）
 *   - toolAudits.jsonl 工具审计（追加写）
 *
 * 所有写操作都先写 .tmp 再 rename，避免半写文件。
 * 失败统一抛错，由 useSessionPersistence 的 try/catch 降级。
 */

import RNFS from "react-native-fs";
import type {
  LocalSessionStore,
  SessionRow,
  MessageRow,
  MemoryRow,
  ToolAuditRow,
} from "./types";

const STORE_DIR = `${RNFS.DocumentDirectoryPath}/kids_mobile_store`;

/** 持久化消息上限：超出后丢弃最早的，避免 messages.jsonl 无限增长。 */
const MAX_PERSISTED_MESSAGES = 1000;

const FILES = {
  sessions: `${STORE_DIR}/sessions.json`,
  messages: `${STORE_DIR}/messages.jsonl`,
  memories: `${STORE_DIR}/memories.json`,
  toolAudits: `${STORE_DIR}/toolAudits.jsonl`,
};

function now(): number {
  return Date.now();
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const exists = await RNFS.exists(path);
    if (!exists) return fallback;
    const text = await RNFS.readFile(path, "utf8");
    const trimmed = text.trim();
    if (!trimmed) return fallback;
    return JSON.parse(trimmed) as T;
  } catch (err) {
    // 文件损坏时返回 fallback，避免一次坏文件导致整个功能不可用。
    console.warn(`[jsonlStore] 读取 ${path} 失败，使用默认值:`, err);
    return fallback;
  }
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await RNFS.writeFile(`${path}.tmp`, JSON.stringify(data, null, 2), "utf8");
  await RNFS.moveFile(`${path}.tmp`, path);
}

async function appendJsonl(path: string, record: unknown): Promise<void> {
  const line = JSON.stringify(record);
  await RNFS.appendFile(path, ensureTrailingNewline(line), "utf8");
}

async function readJsonlFile(path: string): Promise<unknown[]> {
  const exists = await RNFS.exists(path);
  if (!exists) return [];
  const text = await RNFS.readFile(path, "utf8");
  if (!text.trim()) return [];
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const rows: unknown[] = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      console.warn(`[jsonlStore] 忽略损坏的 JSONL 行: ${line.slice(0, 80)}`, err);
    }
  }
  return rows;
}

async function readJsonlTail(path: string, limit: number): Promise<unknown[]> {
  const rows = await readJsonlFile(path);
  return rows.slice(-limit);
}

async function rewriteJsonl(path: string, predicate: (row: unknown) => boolean): Promise<void> {
  const rows = await readJsonlFile(path);
  const kept = rows.filter(predicate);
  const text = kept.map((r) => JSON.stringify(r)).join("\n");
  await RNFS.writeFile(`${path}.tmp`, text ? `${text}\n` : "", "utf8");
  await RNFS.moveFile(`${path}.tmp`, path);
}

function isMessageRow(row: unknown): row is MessageRow {
  return (
    typeof row === "object" &&
    row !== null &&
    "id" in row &&
    "sessionId" in row &&
    "role" in row &&
    "content" in row &&
    "createdAt" in row
  );
}

function isToolAuditRow(row: unknown): row is ToolAuditRow {
  return (
    typeof row === "object" &&
    row !== null &&
    "id" in row &&
    "sessionId" in row &&
    "toolName" in row &&
    "decision" in row &&
    "success" in row &&
    "summary" in row &&
    "startedAt" in row &&
    "finishedAt" in row
  );
}

export async function createJsonlStore(): Promise<LocalSessionStore> {
  await RNFS.mkdir(STORE_DIR);

  return {
    async upsertSession({ sessionId, petId, title }) {
      const sessions = await readJsonFile<Record<string, SessionRow>>(FILES.sessions, {});
      const ts = now();
      const existing = sessions[sessionId];
      sessions[sessionId] = {
        sessionId,
        petId,
        title: title ?? existing?.title ?? null,
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      };
      await writeJsonFile(FILES.sessions, sessions);
    },

    async getSession(sessionId) {
      const sessions = await readJsonFile<Record<string, SessionRow>>(FILES.sessions, {});
      return sessions[sessionId] ?? null;
    },

    async listSessions() {
      const sessions = await readJsonFile<Record<string, SessionRow>>(FILES.sessions, {});
      return Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async appendMessage({ sessionId, role, content }) {
      const row: MessageRow = {
        id: now(),
        sessionId,
        role,
        content,
        createdAt: now(),
      };
      await appendJsonl(FILES.messages, row);
      // 超上限则整段重写，只保留最近 MAX_PERSISTED_MESSAGES 条。给 10% 松弛缓冲
      // 分摊重写成本（不必每条 append 都读全量）。
      // ponytail: 全量读+重写，O(n) 每次触发；儿童 App 规模足够，量级上万再换分段存储。
      const rows = await readJsonlFile(FILES.messages);
      if (rows.length > MAX_PERSISTED_MESSAGES * 1.1) {
        const kept = rows.filter(isMessageRow).slice(-MAX_PERSISTED_MESSAGES);
        const text = kept.map((r) => JSON.stringify(r)).join("\n");
        await RNFS.writeFile(`${FILES.messages}.tmp`, text ? `${text}\n` : "", "utf8");
        await RNFS.moveFile(`${FILES.messages}.tmp`, FILES.messages);
      }
    },

    async listMessages(sessionId, limit) {
      const rows = await readJsonlFile(FILES.messages);
      const filtered = rows.filter(isMessageRow).filter((r) => r.sessionId === sessionId);
      if (limit != null) {
        return filtered.slice(-limit);
      }
      return filtered;
    },

    async putMemory({ petId, key, value }) {
      const memories = await readJsonFile<Record<string, MemoryRow>>(FILES.memories, {});
      memories[`${petId}:${key}`] = { petId, key, value, updatedAt: now() };
      await writeJsonFile(FILES.memories, memories);
    },

    async getMemory(petId, key) {
      const memories = await readJsonFile<Record<string, MemoryRow>>(FILES.memories, {});
      return memories[`${petId}:${key}`]?.value ?? null;
    },

    async listMemories(petId) {
      const memories = await readJsonFile<Record<string, MemoryRow>>(FILES.memories, {});
      return Object.values(memories)
        .filter((m) => m.petId === petId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async recordToolAudit(input) {
      const row: ToolAuditRow = { ...input, id: now() };
      await appendJsonl(FILES.toolAudits, row);
    },

    async listToolAudits(sessionId) {
      const rows = await readJsonlFile(FILES.toolAudits);
      return rows
        .filter(isToolAuditRow)
        .filter((r) => r.sessionId === sessionId)
        .sort((a, b) => a.id - b.id);
    },

    async deleteSession(sessionId) {
      const sessions = await readJsonFile<Record<string, SessionRow>>(FILES.sessions, {});
      delete sessions[sessionId];
      await writeJsonFile(FILES.sessions, sessions);
      await rewriteJsonl(FILES.messages, (row) => isMessageRow(row) && row.sessionId !== sessionId);
      await rewriteJsonl(FILES.toolAudits, (row) => isToolAuditRow(row) && row.sessionId !== sessionId);
    },

    async clearMessages(sessionId) {
      await rewriteJsonl(FILES.messages, (row) => isMessageRow(row) && row.sessionId !== sessionId);
    },

    async clearMemories(petId) {
      const memories = await readJsonFile<Record<string, MemoryRow>>(FILES.memories, {});
      for (const key of Object.keys(memories)) {
        if (memories[key].petId === petId) {
          delete memories[key];
        }
      }
      await writeJsonFile(FILES.memories, memories);
    },
  };
}
