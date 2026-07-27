/**
 * mobile-prompt-context-provider — 档案热更新与 soul 注入单测
 */

import { describe, it, expect } from "vitest";
import { createMobilePromptContextProvider } from "./mobile-prompt-context-provider.js";

describe("createMobilePromptContextProvider", () => {
  it("初始档案写入 soul，且 getSoulContentLive 与 getSoulContent 一致", async () => {
    const pc = createMobilePromptContextProvider({
      petPersona: "测试宠物",
      childProfile: { name: "小明", age: 6 },
    });
    const soul = pc.getSoulContentLive();
    expect(soul).toContain("你已经了解到关于小主人的信息");
    expect(soul).toContain("小明");
    expect(soul).toContain("6 岁");
    expect(await pc.getSoulContent()).toBe(soul);
  });

  it("setChildProfile 后 getSoulContentLive 立即反映新档案", () => {
    const pc = createMobilePromptContextProvider({
      petPersona: "测试宠物",
      childProfile: { name: "旧名", age: 5 },
    });
    pc.setChildProfile({ name: "小红", age: 7, gender: "女孩" });
    const soul = pc.getSoulContentLive();
    expect(soul).toContain("小红");
    expect(soul).toContain("7 岁");
    expect(soul).toContain("女孩");
    expect(soul).not.toContain("旧名");
  });

  it("清空档案后 soul 回到「还不了解」引导", () => {
    const pc = createMobilePromptContextProvider({
      petPersona: "测试宠物",
      childProfile: { name: "小明" },
    });
    pc.setChildProfile({});
    expect(pc.getSoulContentLive()).toContain("目前还不太了解小主人");
  });
});
