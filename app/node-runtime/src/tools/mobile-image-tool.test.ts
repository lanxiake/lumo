/**
 * mobile-image-tool — direct 生图分支单测
 *
 * 验证：有 imageProviderConfig 时直连 OpenAI 兼容图像端点，请求 b64_json，
 * 解析 data[0].b64_json → data URI 经 image_ready emit。
 */

import { describe, it, expect } from "vitest";
import { mobileImageGenerateToolConfig } from "./mobile-image-tool.js";
import type { MobileToolExecutionContext } from "../host/mobile-tool-context.js";
import type { MobileNodeEvent } from "../bridge/schema.js";

function fakeContext(overrides: Partial<MobileToolExecutionContext>): MobileToolExecutionContext {
  return {
    getCwd: () => "/test",
    executeCommand: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    readFile: async () => "",
    writeFile: async () => undefined,
    glob: async () => [],
    grep: async () => [],
    fetch: async () => ({ status: 200, body: "" }),
    emit: () => undefined,
    listCreations: () => [],
    getEditTarget: () => null,
    requestConfirm: async () => true,
    gatewayUrl: "https://gw.test",
    getAuthToken: async () => "tok",
    getDeviceId: () => undefined,
    ...overrides,
  } as MobileToolExecutionContext;
}

describe("mobileImageGenerateToolConfig direct 分支", () => {
  it("有 imageProviderConfig 时直连 /images/generations 并 emit data URI", async () => {
    let calledUrl = "";
    let calledBody: Record<string, unknown> = {};
    const events: MobileNodeEvent[] = [];

    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ b64_json: "AAAA", revised_prompt: "cat" }] }),
      } as Response;
    }) as unknown as typeof fetch;

    const ctx = fakeContext({
      imageProviderConfig: { baseUrl: "https://api.openai.com/v1", apiKey: "sk-x", model: "dall-e-3" },
      fetchImpl,
      emit: (e) => events.push(e),
    });

    const result = await mobileImageGenerateToolConfig.execute("call-1", { prompt: "一只小猫" }, ctx);

    expect(calledUrl).toBe("https://api.openai.com/v1/images/generations");
    expect(calledBody.response_format).toBe("b64_json");
    expect(calledBody.model).toBe("dall-e-3");
    const ready = events.find((e) => e.type === "image_ready");
    expect(ready).toBeDefined();
    expect(ready?.type === "image_ready" && ready.payload.url).toBe("data:image/png;base64,AAAA");
    expect(result.details?.model).toBe("dall-e-3");
  });

  it("孩子拒绝确认时不生图", async () => {
    const events: MobileNodeEvent[] = [];
    const ctx = fakeContext({
      requestConfirm: async () => false,
      imageProviderConfig: { baseUrl: "https://api.openai.com/v1", apiKey: "sk-x", model: "dall-e-3" },
      emit: (e) => events.push(e),
    });
    const result = await mobileImageGenerateToolConfig.execute("call-2", { prompt: "x" }, ctx);
    expect(result.details).toBeNull();
    expect(events.find((e) => e.type === "image_ready")).toBeUndefined();
  });
});
