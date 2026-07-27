/**
 * mobile-summary-generator 测试
 *
 * 验证移动端上下文压缩摘要生成器：
 *  - 拼接 text_delta 产出摘要文本
 *  - 以 purpose='session_summary' 调用 innerStream
 *  - 只保留 user/assistant/toolResult 角色 + 追加摘要提示为末条 user
 *  - abort 时返回 null
 *  - 空文本返回 null
 */

import { describe, it, expect, vi } from "vitest";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Model, Api } from "@mariozechner/pi-ai";
import { createFakeStreamFn } from "./fake-stream.js";
import { createMobileSummaryGenerator } from "../src/agent/mobile-summary-generator.js";

const fakeModel = {
  id: "test-model",
  api: "openai-completions" as Api,
  provider: "test",
  name: "Test",
  reasoning: false,
  input: [],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 4096,
} as unknown as Model<string>;

describe("createMobileSummaryGenerator", () => {
  it("拼接 text_delta 产出摘要文本", async () => {
    const gen = createMobileSummaryGenerator(createFakeStreamFn("这是摘要"), fakeModel);
    const summary = await gen(
      [{ role: "user", content: "你好", timestamp: 1 } as never],
      "请总结以上对话",
    );
    expect(summary).toBe("这是摘要");
  });

  it("以 purpose=session_summary 调用，并追加摘要提示为末条 user 消息", async () => {
    const spy = vi.fn<StreamFn>(createFakeStreamFn("ok"));
    const gen = createMobileSummaryGenerator(spy as unknown as StreamFn, fakeModel);
    await gen(
      [
        { role: "user", content: "第一句", timestamp: 1 } as never,
        { role: "assistant", content: [{ type: "text", text: "回复" }], timestamp: 2 } as never,
        { role: "system", content: "内部消息", timestamp: 3 } as never, // 应被过滤
      ],
      "SUMMARY_PROMPT",
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const [, context, options] = spy.mock.calls[0];
    expect((options as { purpose?: string }).purpose).toBe("session_summary");
    const msgs = (context as { messages: { role: string; content: unknown }[] }).messages;
    // system 被过滤：只剩 user + assistant + 追加的 prompt user
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[msgs.length - 1].content).toBe("SUMMARY_PROMPT");
  });

  it("signal 已 abort 时返回 null", async () => {
    const controller = new AbortController();
    controller.abort();
    const gen = createMobileSummaryGenerator(createFakeStreamFn("不该返回"), fakeModel);
    const summary = await gen(
      [{ role: "user", content: "你好", timestamp: 1 } as never],
      "总结",
      controller.signal,
    );
    expect(summary).toBeNull();
  });

  it("空文本返回 null", async () => {
    const gen = createMobileSummaryGenerator(createFakeStreamFn(""), fakeModel);
    const summary = await gen(
      [{ role: "user", content: "你好", timestamp: 1 } as never],
      "总结",
    );
    expect(summary).toBeNull();
  });
});
