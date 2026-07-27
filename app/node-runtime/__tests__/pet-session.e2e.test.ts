/**
 * pet-session 端到端（fake LLM）
 *
 * 验收标准 §4.5：mock streamFn 下输入"你好"能收到 Agent final 文本；
 * 不存在移动端 fork 的 Agent loop（全走 host-kit assembleAgent）。
 */

import { describe, it, expect, vi } from "vitest";
import { AgentRegistry, PermissionMemory } from "@lumo/agent-runtime";
import { createPetSession } from "../src/agent/pet-agent-runner.js";
import { createMobileConfigProvider } from "../src/host/mobile-config-provider.js";
import { createMobileEventSink } from "../src/host/mobile-event-sink.js";
import { createMobilePermissionProvider } from "../src/host/mobile-permission-provider.js";
import { createMobilePromptContextProvider } from "../src/host/mobile-prompt-context-provider.js";
import { createMobileToolContext } from "../src/host/mobile-tool-context.js";
import { createFakeStreamFnFactory } from "./fake-stream.js";
import type { MobileNodeEvent } from "../src/bridge/schema.js";

function buildSession(reply: string, emit: (e: MobileNodeEvent) => void) {
  return createPetSession({
    agentId: "assistant",
    sessionKey: "test-session",
    config: createMobileConfigProvider(),
    eventSink: createMobileEventSink({ emit }),
    permission: createMobilePermissionProvider(),
    promptContext: createMobilePromptContextProvider({
      petPersona: "测试宠物",
      childNickname: "小明",
    }),
    streamFnFactory: createFakeStreamFnFactory(reply),
    toolContext: createMobileToolContext({
      sessionId: "test-session",
      petId: "pet1",
      deviceId: "dev1",
      platform: "ios",
      appVersion: "1.0.0",
      gatewayUrl: "https://gateway.test.local",
      getAuthToken: async () => "test-token",
      emit,
    }),
    registry: new AgentRegistry(),
    permissionMemory: new PermissionMemory(),
  });
}

describe("pet-session 端到端（fake LLM）", () => {
  it("输入'你好'收到 agent_final 文本（复用 host-kit，不 fork loop）", async () => {
    const events: MobileNodeEvent[] = [];
    const session = await buildSession("你好呀小明，今天想玩什么呢？", (e) => events.push(e));

    const result = await session.prompt("你好");
    expect(result.status).toBe("sent");

    // 等待事件流完成（fake stream 异步吐字）
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === "agent_final")).toBe(true);
    }, { timeout: 5000 });

    const final = events.find((e) => e.type === "agent_final");
    expect(final && final.type === "agent_final" && final.payload.text).toContain("小明");

    // 收到了 delta 流
    expect(events.some((e) => e.type === "agent_delta")).toBe(true);

    session.dispose();
  });

  it("危险输入被输入安全拦截，不进 Agent", async () => {
    const events: MobileNodeEvent[] = [];
    const session = await buildSession("正常回复", (e) => events.push(e));

    const result = await session.prompt("我不想活了");
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.safety.category).toBe("self_harm");
    }
    // 未产生 agent_delta（未进 Agent）
    expect(events.some((e) => e.type === "agent_delta")).toBe(false);

    session.dispose();
  });

  it("instanceId 存在（AgentInstance 已注册）", async () => {
    const session = await buildSession("hi", () => {});
    expect(session.instanceId).toBeTruthy();
    session.dispose();
  });

  it("updateChildProfile 后 getSystemPrompt 含新档案，且 prompt 前会刷新", async () => {
    const events: MobileNodeEvent[] = [];
    const promptContext = createMobilePromptContextProvider({
      petPersona: "测试宠物",
      childProfile: { name: "旧名" },
    });
    const session = await createPetSession({
      agentId: "assistant",
      sessionKey: "test-session",
      config: createMobileConfigProvider(),
      eventSink: createMobileEventSink({ emit: (e) => events.push(e) }),
      permission: createMobilePermissionProvider(),
      promptContext,
      streamFnFactory: createFakeStreamFnFactory("你叫小红呀"),
      toolContext: createMobileToolContext({
        sessionId: "test-session",
        petId: "pet1",
        deviceId: "dev1",
        platform: "ios",
        appVersion: "1.0.0",
        gatewayUrl: "https://gateway.test.local",
        getAuthToken: async () => "test-token",
        emit: (e) => events.push(e),
      }),
      registry: new AgentRegistry(),
      permissionMemory: new PermissionMemory(),
    });

    session.updateChildProfile({ name: "小红", age: 6 });
    expect(session.getSystemPrompt()).toContain("小红");
    expect(session.getSystemPrompt()).toContain("6 岁");

    await session.prompt("我叫什么");
    expect(session.getSystemPrompt()).toContain("小红");
    session.dispose();
  });
});

