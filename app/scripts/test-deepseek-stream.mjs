#!/usr/bin/env node
/**
 * test-deepseek-stream.mjs — 诊断脚本：在普通 Node（非 nodejs-mobile）下直调
 * pi-ai streamSimple 打同一个自建端点，验证 direct-stream.ts 的调用逻辑本身是否正确。
 *
 * 用法：
 *   DEEPSEEK_API_KEY=xxx node scripts/test-deepseek-stream.mjs
 *
 * 若在普通 Node 下能正常拿到流式响应，说明 pi-ai/direct-stream.ts 代码逻辑没问题，
 * 问题出在 nodejs-mobile 的 fetch/undici 环境。
 */
import { streamSimple } from "@mariozechner/pi-ai";

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("请设置环境变量 DEEPSEEK_API_KEY");
  process.exit(1);
}

const model = {
  id: "deepseek-v4-flash",
  api: "openai-completions",
  provider: "openai",
  baseUrl: "https://kms.sczxsc.cn:35019/v1",
  name: "deepseek-v4-flash",
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 8192,
  reasoning: false,
};

const context = {
  systemPrompt: "你是一个友好的助手。",
  messages: [{ role: "user", content: "你好，请用一句话回复。" }],
  tools: [],
};

console.log("[test] 开始调用 streamSimple ...");
const t0 = Date.now();

const stream = streamSimple(model, context, {
  apiKey,
  onPayload: (params) => {
    console.log(`[test] onPayload 触发，耗时=${Date.now() - t0}ms`);
    return undefined;
  },
  onResponse: (resp) => {
    console.log(`[test] onResponse 触发 status=${resp.status} 耗时=${Date.now() - t0}ms`);
  },
});

for await (const event of stream) {
  console.log(`[test] event type=${event.type} 耗时=${Date.now() - t0}ms`);
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

console.log(`\n[test] 完成，总耗时=${Date.now() - t0}ms`);
