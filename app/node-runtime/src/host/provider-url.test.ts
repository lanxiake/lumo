import { describe, expect, it } from "vitest";
import { ensureOpenAiV1 } from "./provider-url.js";

describe("ensureOpenAiV1", () => {
  it("补 /v1 到纯 host", () => {
    expect(ensureOpenAiV1("https://api.openai.com")).toBe("https://api.openai.com/v1");
    expect(ensureOpenAiV1("https://host:8080")).toBe("https://host:8080/v1");
  });

  it("去尾斜杠后补 /v1", () => {
    expect(ensureOpenAiV1("https://api.openai.com/")).toBe("https://api.openai.com/v1");
    expect(ensureOpenAiV1("  https://host//  ")).toBe("https://host/v1");
  });

  it("已有 /v1 不重复", () => {
    expect(ensureOpenAiV1("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
    expect(ensureOpenAiV1("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
  });

  it("自定义路径段不动", () => {
    expect(ensureOpenAiV1("https://proxy.com/openai")).toBe("https://proxy.com/openai");
    expect(ensureOpenAiV1("https://host/api/v3")).toBe("https://host/api/v3");
  });

  it("非法 URL / 空值原样返回", () => {
    expect(ensureOpenAiV1("")).toBe("");
    expect(ensureOpenAiV1("not a url")).toBe("not a url");
  });
});
