import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  createLocalSessionStore,
  type LocalSessionStore,
} from "../src/memory/local-session-memory.js";

function freshStore(): LocalSessionStore {
  // 内存库：每个用例独立，验证真实 SQL（非 mock）
  const db = new DatabaseSync(":memory:");
  return createLocalSessionStore(db);
}

describe("local-session-memory — 建表与幂等", () => {
  it("createLocalSessionStore 幂等：重复初始化不报错", () => {
    const db = new DatabaseSync(":memory:");
    createLocalSessionStore(db);
    expect(() => createLocalSessionStore(db)).not.toThrow();
  });
});

describe("local-session-memory — sessions", () => {
  let store: LocalSessionStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("upsertSession 新建后可查回", () => {
    store.upsertSession({ sessionId: "s1", petId: "p1", title: "早安" });
    const s = store.getSession("s1");
    expect(s?.sessionId).toBe("s1");
    expect(s?.petId).toBe("p1");
    expect(s?.title).toBe("早安");
  });

  it("upsertSession 同 id 覆盖标题", () => {
    store.upsertSession({ sessionId: "s1", petId: "p1", title: "早安" });
    store.upsertSession({ sessionId: "s1", petId: "p1", title: "晚安" });
    expect(store.getSession("s1")?.title).toBe("晚安");
    expect(store.listSessions().length).toBe(1);
  });

  it("getSession 不存在返回 null", () => {
    expect(store.getSession("nope")).toBeNull();
  });
});

describe("local-session-memory — messages", () => {
  let store: LocalSessionStore;
  beforeEach(() => {
    store = freshStore();
    store.upsertSession({ sessionId: "s1", petId: "p1" });
  });

  it("追加消息并按时间顺序查回", () => {
    store.appendMessage({ sessionId: "s1", role: "user", content: "你好" });
    store.appendMessage({ sessionId: "s1", role: "assistant", content: "你好呀" });
    const msgs = store.listMessages("s1");
    expect(msgs.map((m) => m.content)).toEqual(["你好", "你好呀"]);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("listMessages 支持 limit 取最近 N 条（仍按时间正序返回）", () => {
    for (let i = 0; i < 5; i++) {
      store.appendMessage({ sessionId: "s1", role: "user", content: `m${i}` });
    }
    const recent = store.listMessages("s1", 2);
    expect(recent.map((m) => m.content)).toEqual(["m3", "m4"]);
  });

  it("按 sessionId 隔离", () => {
    store.upsertSession({ sessionId: "s2", petId: "p1" });
    store.appendMessage({ sessionId: "s1", role: "user", content: "属于s1" });
    expect(store.listMessages("s2")).toHaveLength(0);
  });
});

describe("local-session-memory — local_memories（MVP 短期记忆）", () => {
  let store: LocalSessionStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("按 key upsert 并读取", () => {
    store.putMemory({ petId: "p1", key: "favorite_color", value: "蓝色" });
    expect(store.getMemory("p1", "favorite_color")).toBe("蓝色");
    store.putMemory({ petId: "p1", key: "favorite_color", value: "红色" });
    expect(store.getMemory("p1", "favorite_color")).toBe("红色");
  });

  it("getMemory 不存在返回 null；按 petId 隔离", () => {
    store.putMemory({ petId: "p1", key: "k", value: "v" });
    expect(store.getMemory("p2", "k")).toBeNull();
    expect(store.getMemory("p1", "missing")).toBeNull();
  });

  it("listMemories 返回该 pet 全部键值", () => {
    store.putMemory({ petId: "p1", key: "a", value: "1" });
    store.putMemory({ petId: "p1", key: "b", value: "2" });
    const all = store.listMemories("p1");
    expect(all).toHaveLength(2);
  });
});

describe("local-session-memory — tool_audits（规范 §4.4）", () => {
  let store: LocalSessionStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("记录工具审计的必填字段", () => {
    store.recordToolAudit({
      sessionId: "s1",
      toolName: "memory_read",
      decision: "allow-once",
      success: true,
      summary: "读取偏好",
      startedAt: 1000,
      finishedAt: 1050,
    });
    const audits = store.listToolAudits("s1");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      toolName: "memory_read",
      decision: "allow-once",
      success: true,
      summary: "读取偏好",
    });
  });

  it("失败审计 success=false 正确落库", () => {
    store.recordToolAudit({
      sessionId: "s1",
      toolName: "web_fetch",
      decision: "deny",
      success: false,
      summary: "家长未授权",
      startedAt: 1,
      finishedAt: 2,
    });
    expect(store.listToolAudits("s1")[0].success).toBe(false);
  });
});

describe("local-session-memory — 数据删除能力（规范 §6.3）", () => {
  let store: LocalSessionStore;
  beforeEach(() => {
    store = freshStore();
    store.upsertSession({ sessionId: "s1", petId: "p1" });
    store.upsertSession({ sessionId: "s2", petId: "p1" });
    store.appendMessage({ sessionId: "s1", role: "user", content: "在 s1" });
    store.appendMessage({ sessionId: "s2", role: "user", content: "在 s2" });
    store.recordToolAudit({
      sessionId: "s1",
      toolName: "memory_read",
      decision: "allow-once",
      success: true,
      summary: "x",
      startedAt: 1,
      finishedAt: 2,
    });
  });

  it("deleteSession 级联删除该会话的消息与审计，其它会话不受影响", () => {
    store.deleteSession("s1");
    expect(store.getSession("s1")).toBeNull();
    expect(store.listMessages("s1")).toHaveLength(0);
    expect(store.listToolAudits("s1")).toHaveLength(0);
    // s2 保留
    expect(store.getSession("s2")).not.toBeNull();
    expect(store.listMessages("s2")).toHaveLength(1);
  });

  it("clearMessages 只清消息，保留会话与审计", () => {
    store.clearMessages("s1");
    expect(store.listMessages("s1")).toHaveLength(0);
    expect(store.getSession("s1")).not.toBeNull();
    expect(store.listToolAudits("s1")).toHaveLength(1);
  });

  it("clearMemories 清空某 pet 的本地记忆", () => {
    store.putMemory({ petId: "p1", key: "a", value: "1" });
    store.putMemory({ petId: "p2", key: "b", value: "2" });
    store.clearMemories("p1");
    expect(store.listMemories("p1")).toHaveLength(0);
    // 其它 pet 记忆保留
    expect(store.listMemories("p2")).toHaveLength(1);
  });

  it("删除不存在的会话不抛错（幂等）", () => {
    expect(() => store.deleteSession("nope")).not.toThrow();
  });
});
