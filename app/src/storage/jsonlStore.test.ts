/**
 * jsonlStore 单元测试 — 用内存 mock 替代 react-native-fs
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import RNFS from "react-native-fs";
import { createJsonlStore } from "./jsonlStore";

const mockFs = RNFS as unknown as {
  __reset: () => void;
  __store: () => Record<string, string>;
};

beforeEach(() => {
  mockFs.__reset();
});

describe("jsonlStore", () => {
  it("初始化时创建存储目录", async () => {
    await createJsonlStore();
    const dirs = Object.keys(mockFs.__store()).filter((k) => !k.includes("."));
    expect(dirs).toEqual(["/mock/documents/kids_mobile_store"]);
  });

  it("会话可插入、读取、列出", async () => {
    const store = await createJsonlStore();
    await store.upsertSession({ sessionId: "s1", petId: "p1", title: "测试会话" });

    expect(await store.getSession("s1")).toMatchObject({
      sessionId: "s1",
      petId: "p1",
      title: "测试会话",
    });

    const list = await store.listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].sessionId).toBe("s1");
  });

  it("消息可按会话追加并支持 limit", async () => {
    const store = await createJsonlStore();
    await store.appendMessage({ sessionId: "s1", role: "user", content: "你好" });
    await store.appendMessage({ sessionId: "s1", role: "assistant", content: "嗨" });
    await store.appendMessage({ sessionId: "s2", role: "user", content: "其他会话" });

    const s1All = await store.listMessages("s1");
    expect(s1All).toHaveLength(2);
    expect(s1All[0].role).toBe("user");
    expect(s1All[1].role).toBe("assistant");

    const s1Limited = await store.listMessages("s1", 1);
    expect(s1Limited).toHaveLength(1);
    expect(s1Limited[0].content).toBe("嗨");
  });

  it("deleteSession 删除会话及关联消息/审计", async () => {
    const store = await createJsonlStore();
    await store.upsertSession({ sessionId: "s1", petId: "p1" });
    await store.appendMessage({ sessionId: "s1", role: "user", content: "a" });
    await store.recordToolAudit({
      sessionId: "s1",
      toolName: "t1",
      decision: "allow",
      success: true,
      summary: "",
      startedAt: 1,
      finishedAt: 2,
    });

    await store.deleteSession("s1");
    expect(await store.getSession("s1")).toBeNull();
    expect(await store.listMessages("s1")).toHaveLength(0);
    expect(await store.listToolAudits("s1")).toHaveLength(0);
  });

  it("clearMessages 仅清除指定会话消息", async () => {
    const store = await createJsonlStore();
    await store.appendMessage({ sessionId: "s1", role: "user", content: "a" });
    await store.appendMessage({ sessionId: "s2", role: "user", content: "b" });

    await store.clearMessages("s1");
    expect(await store.listMessages("s1")).toHaveLength(0);
    expect(await store.listMessages("s2")).toHaveLength(1);
  });

  it("记忆可读写、列出、清除", async () => {
    const store = await createJsonlStore();
    await store.putMemory({ petId: "p1", key: "color", value: "blue" });
    expect(await store.getMemory("p1", "color")).toBe("blue");
    expect(await store.getMemory("p2", "color")).toBeNull();

    await store.putMemory({ petId: "p1", key: "food", value: "fish" });
    const list = await store.listMemories("p1");
    expect(list).toHaveLength(2);

    await store.clearMemories("p1");
    expect(await store.listMemories("p1")).toHaveLength(0);
  });

  it("损坏的 JSONL 行被忽略", async () => {
    const store = await createJsonlStore();
    await store.appendMessage({ sessionId: "s1", role: "user", content: "ok" });

    const path = "/mock/documents/kids_mobile_store/messages.jsonl";
    const current = mockFs.__store()[path];
    mockFs.__store()[path] = `${current}\n{invalid json`;

    const rows = await store.listMessages("s1");
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("ok");
  });
});
