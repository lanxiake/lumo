/**
 * mobile-image-tool 测试
 *
 * 验证 image_generate 在移动端的执行：儿童安全 prompt 包装、Gateway 调用、
 * image_ready 事件发射，以及错误降级。
 */

import { describe, it, expect, vi } from "vitest";
import { mobileImageGenerateToolConfig } from "../src/tools/mobile-image-tool.js";
import type { MobileToolExecutionContext } from "../src/host/mobile-tool-context.js";
import type { MobileNodeEvent } from "../src/bridge/schema.js";

function buildContext(options: {
  gatewayUrl?: string;
  token?: string;
  deviceId?: string;
  fetchImpl?: typeof fetch;
}): MobileToolExecutionContext {
  const events: MobileNodeEvent[] = [];
  return {
    getCwd: () => "/kids-mobile/test",
    executeCommand: async () => {
      throw new Error("forbidden");
    },
    readFile: async () => {
      throw new Error("forbidden");
    },
    writeFile: async () => {
      throw new Error("forbidden");
    },
    glob: async () => [],
    grep: async () => [],
    fetch: async (url, opts) => {
      const res = await (options.fetchImpl ?? fetch)(url, opts);
      const body = await res.text();
      return { status: res.status, body };
    },
    emit: (event) => events.push(event),
    gatewayUrl: options.gatewayUrl ?? "https://gateway.test.local",
    getAuthToken: async () => options.token ?? "test-token",
    getDeviceId: () => options.deviceId,
    fetchImpl: options.fetchImpl,
    listCreations: () => [],
    getEditTarget: () => null,
    getPendingPlayground: () => null,
    requestConfirm: async () => true,
  } as MobileToolExecutionContext;
}

function fakeFetch(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe("mobile-image-tool", () => {
  it("成功时调用 Gateway 并 emit image_ready", async () => {
    const emitted: MobileNodeEvent[] = [];
    const ctx = buildContext({
      fetchImpl: fakeFetch(
        new Response(
          JSON.stringify({
            imageBase64: "bW9jaw==",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
            revisedPrompt: "cute cat",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    });
    ctx.emit = (event) => emitted.push(event);

    const result = await mobileImageGenerateToolConfig.execute("tc1", { prompt: "小猫", filename: "kitty" }, ctx);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: "image_ready",
      payload: { url: "data:image/png;base64,bW9jaw==", prompt: "小猫" },
    });
    expect(result.details).toMatchObject({
      url: "data:image/png;base64,bW9jaw==",
      filename: "kitty",
      width: 1024,
      height: 1024,
      model: "gpt-image-2",
      revisedPrompt: "cute cat",
    });
  });

  it("prompt 被包装成儿童安全前缀", async () => {
    let capturedBody = "";
    const ctx = buildContext({
      fetchImpl: vi.fn(async (_url, opts) => {
        capturedBody = (opts as { body?: string }).body ?? "";
        return new Response(
          JSON.stringify({
            imageBase64: "bW9jaw==",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
            revisedPrompt: "",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    });

    await mobileImageGenerateToolConfig.execute("tc1", { prompt: "小狗在草地上跑" }, ctx);

    const body = JSON.parse(capturedBody);
    expect(body.prompt).toContain("illustration for a 3-8 year old child");
    expect(body.prompt).toContain("小狗在草地上跑");
  });

  it("未登录时抛出友好错误", async () => {
    const ctx = buildContext({ token: "" });

    await expect(mobileImageGenerateToolConfig.execute("tc1", { prompt: "小猫" }, ctx)).rejects.toThrow("登录");
  });

  it("异步任务用非 completed 状态拼写仍能取图（不再死等超时）", async () => {
    const emitted: MobileNodeEvent[] = [];
    // POST 返回 task_id；轮询首次返回 status:"success"（非 "completed"）+ 图数据。
    const seq = [
      new Response(JSON.stringify({ task_id: "t-1" }), { status: 200 }),
      new Response(JSON.stringify({ status: "success", data: [{ b64_json: "aW1n" }] }), { status: 200 }),
    ];
    let i = 0;
    const ctx = buildContext({ fetchImpl: vi.fn(async () => seq[Math.min(i++, seq.length - 1)]) as unknown as typeof fetch });
    (ctx as { imageProviderConfig?: unknown }).imageProviderConfig = {
      provider: "rightcode", baseUrl: "https://site.test/draw/v1", apiKey: "k", model: "r-image-2",
    };
    ctx.emit = (e) => emitted.push(e);

    const result = await mobileImageGenerateToolConfig.execute("tc1", { prompt: "小猫" }, ctx);
    expect(result.details).toMatchObject({ url: "data:image/png;base64,aW1n" });
    expect(emitted).toHaveLength(1);
  });

  it("Gateway 返回非 200 时抛出错误", async () => {
    const ctx = buildContext({
      fetchImpl: fakeFetch(new Response(JSON.stringify({ error: { message: "额度不足" } }), { status: 402 })),
    });

    await expect(mobileImageGenerateToolConfig.execute("tc1", { prompt: "小猫" }, ctx)).rejects.toThrow("额度不足");
  });

  it("Gateway 返回空图片时抛出错误", async () => {
    const ctx = buildContext({
      fetchImpl: fakeFetch(
        new Response(JSON.stringify({ imageBase64: "", mimeType: "image/png", width: 0, height: 0, revisedPrompt: "" }), {
          status: 200,
        }),
      ),
    });

    await expect(mobileImageGenerateToolConfig.execute("tc1", { prompt: "小猫" }, ctx)).rejects.toThrow();
  });
});
