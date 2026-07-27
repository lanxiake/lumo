/**
 * mobile-summary-generator — 移动端上下文压缩 LLM 摘要生成器
 *
 * 镜像 Windows apps/windows/src/main/agent-runtime/bridge-context-compactor.ts
 * 的 createLlmSummaryGenerator：压缩触发时用同一个 gateway streamFn 以
 * purpose='session_summary' 调 LLM，产出真实结构化摘要，替代「占位丢弃」。
 *
 * 背景：移动端此前未注入 generateSummary，压缩摘要阶段直接返回 null → 降级为
 * 占位摘要（旧对话内容彻底丢失）→ 表现为「连续对话回复多时忘记前几轮」。
 *
 * 全部为 type-only 导入（innerStream 由调用方注入），不引入运行时依赖。
 */

import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { SummaryGeneratorFn } from "@lumo/agent-runtime";
import type { Message, Context, Model } from "@mariozechner/pi-ai";

/**
 * 构建移动端 LLM 摘要生成器。
 *
 * @param innerStream 工厂产出的 gateway streamFn（由 wrapStreamFn 捕获，携带 JWT/deviceId）
 * @param model 当前解析出的模型（用于本次摘要调用）
 */
export function createMobileSummaryGenerator(
  innerStream: StreamFn,
  model: Model<string>,
): SummaryGeneratorFn {
  return async (messages, summaryPrompt, signal): Promise<string | null> => {
    // 只保留 LLM 兼容角色（user/assistant/toolResult），过滤 compact/system 等内部消息
    const llmMessages: Message[] = messages.flatMap((m) => {
      if (typeof m !== "object" || m === null || !("role" in m)) return [];
      const role = (m as { role: string }).role;
      if (role !== "user" && role !== "assistant" && role !== "toolResult") return [];
      return [m as Message];
    });

    // 追加摘要指令作为最后一条 user 消息
    const messagesWithPrompt: Message[] = [
      ...llmMessages,
      { role: "user", content: summaryPrompt, timestamp: Date.now() },
    ];

    const context: Context = { messages: messagesWithPrompt };

    const streamResult = await innerStream(model, context, {
      purpose: "session_summary",
    } as Parameters<StreamFn>[2]);

    let summaryText = "";
    for await (const event of streamResult) {
      if (signal?.aborted) return null;
      if (event.type === "text_delta") {
        summaryText += event.delta;
      }
    }

    return summaryText.trim() || null;
  };
}
