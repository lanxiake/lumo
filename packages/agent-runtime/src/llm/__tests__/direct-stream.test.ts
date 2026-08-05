import { describe, expect, it } from "vitest";
import { createDirectStreamFn } from "../direct-stream";

/** 用 streamImpl 注入点捕获 pi-ai 实际收到的 model/options */
function capture(model: { id: string; api: string; baseUrl?: string }) {
  let seen: { model: any; options: any } | undefined;
  const fn = createDirectStreamFn({
    credentials: { baseUrl: "https://kms.example.com/v1", apiKey: "k" },
    streamImpl: ((m: any, _ctx: any, o: any) => {
      seen = { model: m, options: o };
      return (async function* () {})() as any;
    }) as any,
  });
  fn(model as any, { systemPrompt: "s", messages: [], tools: [] } as any, {} as any);
  return seen!;
}

describe("createDirectStreamFn", () => {
  it("DeepSeek 端点关闭 developer 角色（否则端点 400 unknown variant `developer`）", () => {
    // reasoning=true 是关思考所需，但会触发 pi-ai 的
    // useDeveloperRole = reasoning && compat.supportsDeveloperRole
    const { model } = capture({ id: "deepseek-v4-flash", api: "openai" });
    expect(model.reasoning).toBe(true);
    expect(model.compat.supportsDeveloperRole).toBe(false);
    expect(model.compat.thinkingFormat).toBe("deepseek");
  });

  it("非 DeepSeek 模型不动 compat，api 规范化为 openai-completions", () => {
    const { model } = capture({ id: "llama3", api: "openai" });
    expect(model.api).toBe("openai-completions");
    expect(model.reasoning).toBe(false);
    expect(model.compat).toBeUndefined();
  });

  it("model.baseUrl 优先于凭据 baseUrl", () => {
    const { model } = capture({ id: "llama3", api: "openai", baseUrl: "http://localhost:11434/v1" });
    expect(model.baseUrl).toBe("http://localhost:11434/v1");
  });
});
