/**
 * mobileBridge 往返测试
 *
 * 验证 RN ↔ Node bridge 消息路由（transport 无关，用假 emit 收集事件）：
 *  - ping → pong
 *  - init → init_done
 *  - send_user_message → agent_delta/agent_final（fake LLM）
 *  - 危险输入 → safety_blocked
 *  - 非法/无会话时不崩溃
 */

import { describe, it, expect, vi } from "vitest";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
  type Api,
} from "@mariozechner/pi-ai";
import { createMobileBridge } from "../src/bridge/mobileBridge.js";
import { createFakeStreamFnFactory } from "./fake-stream.js";
import type { MobileNodeEvent } from "../src/bridge/schema.js";
import type { MobileTts, TtsResult } from "../src/host/mobile-tts.js";

/** fake TTS：不打网络，回固定 base64；synthFn 可注入自定义行为 */
function fakeTts(synthFn?: (text: string) => Promise<TtsResult | null>): MobileTts {
  return {
    synthesize:
      synthFn ??
      (async () => ({ audioBase64: "ZmFrZS1tcDM=", mimeType: "audio/mp3", byteLength: 8 })),
    setVoice: async () => {},
  };
}

function buildBridge(reply = "你好呀小朋友", ttsOverride: MobileTts | undefined = fakeTts()) {
  const events: MobileNodeEvent[] = [];
  const bridge = createMobileBridge({
    emit: (e) => events.push(e),
    gatewayUrl: "https://test.local",
    getAuthToken: async () => "fake-jwt",
    getDeviceId: () => "dev1",
    platform: "ios",
    appVersion: "1.0.0",
    resolvePetPersona: () => "测试宠物人格",
    streamFnFactoryOverride: createFakeStreamFnFactory(reply),
    ...(ttsOverride ? { ttsOverride } : {}),
  });
  return { events, bridge };
}

async function initSession(bridge: ReturnType<typeof createMobileBridge>) {
  await bridge.handleCommand({
    type: "init",
    payload: { petId: "pet1", agentId: "assistant", sessionKey: "sk1", childNickname: "小明" },
  });
}

describe("mobileBridge", () => {
  it("ping → pong", async () => {
    const { events, bridge } = buildBridge();
    await bridge.handleCommand({ type: "ping" });
    expect(events).toContainEqual({ type: "pong" });
    bridge.dispose();
  });

  it("init → init_done 且分配 sessionId", async () => {
    const { events, bridge } = buildBridge();
    await initSession(bridge);
    const done = events.find((e) => e.type === "init_done");
    expect(done).toBeTruthy();
    expect(bridge.getSessionId()).toBeTruthy();
    bridge.dispose();
  });

  it("send_user_message → agent_final（复用 host-kit）", async () => {
    const { events, bridge } = buildBridge("你好呀小明");
    await initSession(bridge);
    await bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "你好", sessionId: bridge.getSessionId() ?? "" },
    });
    await vi.waitFor(
      () => expect(events.some((e) => e.type === "agent_final")).toBe(true),
      { timeout: 5000 },
    );
    bridge.dispose();
  });

  it("危险输入 → safety_blocked", async () => {
    const { events, bridge } = buildBridge();
    await initSession(bridge);
    await bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "我不想活了", sessionId: bridge.getSessionId() ?? "" },
    });
    expect(events.some((e) => e.type === "safety_blocked")).toBe(true);
    bridge.dispose();
  });

  it("未 init 时 send_user_message 返回友好错误，不崩溃", async () => {
    const { events, bridge } = buildBridge();
    await bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "你好", sessionId: "none" },
    });
    expect(events.some((e) => e.type === "agent_error")).toBe(true);
    bridge.dispose();
  });

  it("reset_session 后 sessionId 清空", async () => {
    const { bridge } = buildBridge();
    await initSession(bridge);
    expect(bridge.getSessionId()).toBeTruthy();
    await bridge.handleCommand({ type: "reset_session", payload: { sessionId: "x" } });
    expect(bridge.getSessionId()).toBeUndefined();
    bridge.dispose();
  });

  it("agent_final 后合成并发 tts_audio（先出字后出声）", async () => {
    const { events, bridge } = buildBridge("你好呀小明");
    await initSession(bridge);
    await bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "你好", sessionId: bridge.getSessionId() ?? "" },
    });
    await vi.waitFor(() => expect(events.some((e) => e.type === "tts_audio")).toBe(true), {
      timeout: 5000,
    });
    // 顺序：agent_final 在 tts_audio 之前（文本不被合成阻塞）
    const finalIdx = events.findIndex((e) => e.type === "agent_final");
    const audioIdx = events.findIndex((e) => e.type === "tts_audio");
    expect(finalIdx).toBeGreaterThanOrEqual(0);
    expect(audioIdx).toBeGreaterThan(finalIdx);
    const audio = events.find((e) => e.type === "tts_audio");
    expect(audio && "payload" in audio && audio.payload.audioBase64).toBeTruthy();
    expect(audio && audio.type === "tts_audio" && typeof audio.payload.generationId).toBe("number");
    bridge.dispose();
  });

  it("abort 后迟到的 TTS 合成不发 tts_audio", async () => {
    let resolveSynth!: (v: TtsResult) => void;
    const slowTts = fakeTts(
      () =>
        new Promise((resolve) => {
          resolveSynth = resolve;
        }),
    );
    const { events, bridge } = buildBridge("你好呀小明", slowTts);
    await initSession(bridge);
    const sendPromise = bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "你好", sessionId: bridge.getSessionId() ?? "", generationId: 7 },
    });
    // 等 agent_final 触发合成后再 abort
    await vi.waitFor(() => expect(events.some((e) => e.type === "agent_final")).toBe(true), {
      timeout: 5000,
    });
    await bridge.handleCommand({
      type: "abort",
      payload: { sessionId: bridge.getSessionId() ?? "" },
    });
    resolveSynth({ audioBase64: "ZmFrZS1tcDM=", mimeType: "audio/mp3", byteLength: 8 });
    await sendPromise;
    // 给微任务一点时间
    await new Promise((r) => setTimeout(r, 50));
    expect(events.some((e) => e.type === "tts_audio")).toBe(false);
    bridge.dispose();
  });

  it("tts_audio 携带 send 时的 generationId", async () => {
    const { events, bridge } = buildBridge("你好呀小明");
    await initSession(bridge);
    await bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "你好", sessionId: bridge.getSessionId() ?? "", generationId: 42 },
    });
    await vi.waitFor(() => expect(events.some((e) => e.type === "tts_audio")).toBe(true), {
      timeout: 5000,
    });
    const audio = events.find((e) => e.type === "tts_audio");
    expect(audio && audio.type === "tts_audio" && audio.payload.generationId).toBe(42);
    bridge.dispose();
  });

  it("TTS 合成失败 → agent_error(tts_error)，不影响已发的 agent_final", async () => {
    const failing = fakeTts(async () => {
      throw new Error("edge ws down");
    });
    const { events, bridge } = buildBridge("你好呀小明", failing);
    await initSession(bridge);
    await bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "你好", sessionId: bridge.getSessionId() ?? "" },
    });
    await vi.waitFor(
      () =>
        expect(
          events.some((e) => e.type === "agent_error" && e.payload.code === "tts_error"),
        ).toBe(true),
      { timeout: 5000 },
    );
    expect(events.some((e) => e.type === "agent_final")).toBe(true); // 文本仍在
    expect(events.some((e) => e.type === "tts_audio")).toBe(false);
    bridge.dispose();
  });

  it("update_creations 命令不崩溃（更新复用清单）", async () => {
    const { bridge } = buildBridge();
    await initSession(bridge);
    await bridge.handleCommand({
      type: "update_creations",
      payload: {
        creations: [
          { kind: "image", id: "img-1", title: "小猫", prompt: "一只橘猫" },
          { kind: "game", id: "game-1", title: "泡泡" },
        ],
      },
    });
    // 无异常即通过；清单经 list_my_creations 工具消费（工具层单测另测）。
    expect(bridge.getSessionId()).toBeTruthy();
    bridge.dispose();
  });

  it("confirm_response 命令对未知 requestId 安全忽略，不崩溃", async () => {
    const { events, bridge } = buildBridge();
    await initSession(bridge);
    await bridge.handleCommand({
      type: "confirm_response",
      payload: { requestId: "nope", approved: true },
    });
    expect(events.some((e) => e.type === "agent_error")).toBe(false);
    bridge.dispose();
  });

  it("edit_creation 命令触发一轮 Agent 回复（就地编辑）", async () => {
    const { events, bridge } = buildBridge("好的，我来改一改");
    await initSession(bridge);
    await bridge.handleCommand({
      type: "edit_creation",
      payload: {
        sessionId: bridge.getSessionId() ?? "",
        gameId: "game-1",
        title: "泡泡",
        html: "<html>old</html>",
        instruction: "把泡泡变成红色",
      },
    });
    await vi.waitFor(() => expect(events.some((e) => e.type === "agent_final")).toBe(true), {
      timeout: 5000,
    });
    bridge.dispose();
  });

  it("ttsEnabled=false 时不合成、不发 tts_audio", async () => {
    const events: MobileNodeEvent[] = [];
    const bridge = createMobileBridge({
      emit: (e) => events.push(e),
      gatewayUrl: "https://test.local",
      getAuthToken: async () => "fake-jwt",
      getDeviceId: () => "dev1",
      platform: "ios",
      appVersion: "1.0.0",
      resolvePetPersona: () => "测试宠物人格",
      streamFnFactoryOverride: createFakeStreamFnFactory("你好呀小明"),
      ttsEnabled: false,
    });
    await initSession(bridge);
    await bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "你好", sessionId: bridge.getSessionId() ?? "" },
    });
    await vi.waitFor(() => expect(events.some((e) => e.type === "agent_final")).toBe(true), {
      timeout: 5000,
    });
    expect(events.some((e) => e.type === "tts_audio")).toBe(false);
    bridge.dispose();
  });

  it("init 注入 childProfile 后系统提示含档案", async () => {
    const { bridge } = buildBridge();
    await bridge.handleCommand({
      type: "init",
      payload: {
        petId: "pet1",
        agentId: "assistant",
        sessionKey: "sk1",
        childProfile: { name: "小红", age: 7 },
      },
    });
    const prompt = bridge.getSystemPrompt();
    expect(prompt).toContain("小红");
    expect(prompt).toContain("7 岁");
    bridge.dispose();
  });

  it("update_child_profile 热更新后系统提示含新档案", async () => {
    const { bridge } = buildBridge();
    await initSession(bridge);
    await bridge.handleCommand({
      type: "update_child_profile",
      payload: { childProfile: { name: "小华", age: 8, gender: "男孩" } },
    });
    const prompt = bridge.getSystemPrompt();
    expect(prompt).toContain("小华");
    expect(prompt).toContain("8 岁");
    expect(prompt).toContain("男孩");
    bridge.dispose();
  });

  it("re-init 与发消息并发时命令串行，最终会话可用且档案保留", async () => {
    const { events, bridge } = buildBridge("你好呀");
    await initSession(bridge);

    const reInit = bridge.handleCommand({
      type: "init",
      payload: {
        petId: "pet1",
        agentId: "assistant",
        sessionKey: "sk1",
        childProfile: { name: "小红", age: 6 },
      },
    });
    // 故意不 await，模拟 RN 保存后立刻发消息 / 并发命令
    const concurrentSend = bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "我叫什么", sessionId: "stale" },
    });
    await Promise.all([reInit, concurrentSend]);

    expect(bridge.getSystemPrompt()).toContain("小红");
    expect(bridge.getSessionId()).toBeTruthy();

    await bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "你好", sessionId: bridge.getSessionId() ?? "" },
    });
    await vi.waitFor(() => expect(events.some((e) => e.type === "agent_final")).toBe(true), {
      timeout: 5000,
    });
    bridge.dispose();
  });

  it("confirm_response 旁路命令串行队列，不被挂起的 send_user_message 堵住", async () => {
    // 根因回归：工具 requestConfirm 阻塞在 send_user_message 内时，
    // confirm_response 若入队会与自己死锁，30s 后默认拒绝 → 游戏不打开。
    let releaseStream!: () => void;
    const hangGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const hangingFactory = {
      create: () => (model: Model<Api>) => {
        const stream = createAssistantMessageEventStream();
        void hangGate.then(() => {
          const final: AssistantMessage = {
            role: "assistant",
            content: [{ type: "text", text: "嗯" }],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 2,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: "stop",
            timestamp: Date.now(),
          };
          stream.push({ type: "done", reason: "stop", message: final });
          stream.end(final);
        });
        return stream;
      },
    };

    const events: MobileNodeEvent[] = [];
    const bridge = createMobileBridge({
      emit: (e) => events.push(e),
      gatewayUrl: "https://test.local",
      getAuthToken: async () => "fake-jwt",
      getDeviceId: () => "dev1",
      platform: "ios",
      appVersion: "1.0.0",
      resolvePetPersona: () => "测试宠物人格",
      streamFnFactoryOverride: hangingFactory as never,
      ttsOverride: fakeTts(),
    });
    await initSession(bridge);

    const sendPromise = bridge.handleCommand({
      type: "send_user_message",
      payload: { text: "做个游戏", sessionId: bridge.getSessionId() ?? "" },
    });
    // 确保 send 已占用 commandTail
    await new Promise((r) => setTimeout(r, 30));

    const t0 = Date.now();
    await bridge.handleCommand({
      type: "confirm_response",
      payload: { requestId: "orphan-confirm", approved: true },
    });
    expect(Date.now() - t0).toBeLessThan(800);

    releaseStream();
    await sendPromise;
    bridge.dispose();
  });
});

