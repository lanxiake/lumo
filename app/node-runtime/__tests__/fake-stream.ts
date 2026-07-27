/**
 * fake-stream — 测试用 streamFn 工厂（不连真实网关）
 *
 * 移植自 apps/agent-host/src/fake-stream.ts，供 node-runtime 端到端测试在无网关
 * 环境下跑通一轮完整对话（text_delta → done）。产出的 streamFn 遵循 pi-agent-core
 * 契约，逐字符吐 text_delta。
 */

import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
  type Api,
} from "@mariozechner/pi-ai";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { StreamFnFactory } from "@lumo/agent-runtime";

function buildMessage(
  model: Model<Api>,
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
  return {
    role: "assistant",
    content,
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
    stopReason,
    timestamp: Date.now(),
  };
}

/** 创建吐固定文本的 fake streamFn */
export function createFakeStreamFn(replyText: string): StreamFn {
  return (model, _context, _options) => {
    const stream = createAssistantMessageEventStream();
    const m = model as Model<Api>;
    void (async () => {
      const partial = buildMessage(m, [], "stop");
      stream.push({ type: "start", partial });
      stream.push({ type: "text_start", contentIndex: 0, partial });
      let acc = "";
      for (const ch of replyText) {
        acc += ch;
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: ch,
          partial: buildMessage(m, [{ type: "text", text: acc }], "stop"),
        });
      }
      stream.push({
        type: "text_end",
        contentIndex: 0,
        content: acc,
        partial: buildMessage(m, [{ type: "text", text: acc }], "stop"),
      });
      const final = buildMessage(m, [{ type: "text", text: acc }], "stop");
      stream.push({ type: "done", reason: "stop", message: final });
      stream.end(final);
    })();
    return stream;
  };
}

/** 创建 fake streamFn 工厂（替换 gateway，供测试注入） */
export function createFakeStreamFnFactory(replyText: string): StreamFnFactory {
  const shared = createFakeStreamFn(replyText);
  return { create: () => shared };
}
