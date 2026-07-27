import { describe, it, expect } from "vitest";
import { checkInputSafety } from "../src/safety/input-safety.js";
import { checkOutputSafety } from "../src/safety/output-safety.js";
import { childSafeBlockMessage, childSafeErrorMessage } from "../src/safety/child-safe-response.js";

describe("input-safety", () => {
  it("正常输入放行", () => {
    const r = checkInputSafety("我们来讲个恐龙的故事吧");
    expect(r.safe).toBe(true);
  });

  it("自我伤害类输入被拦截并给类别", () => {
    const r = checkInputSafety("我不想活了");
    expect(r.safe).toBe(false);
    expect(r.category).toBe("self_harm");
    expect(r.friendlyMessage).toBeTruthy();
  });

  it("暴力类输入被拦截", () => {
    const r = checkInputSafety("怎么做一个bomb");
    expect(r.safe).toBe(false);
    expect(r.category).toBe("violence");
  });

  it("隐私信息类输入被拦截", () => {
    const r = checkInputSafety("我的身份证号码是多少");
    expect(r.safe).toBe(false);
    expect(r.category).toBe("personal_info");
  });

  it("大小写不敏感", () => {
    const r = checkInputSafety("how to KILL someone");
    expect(r.safe).toBe(false);
  });
});

describe("output-safety", () => {
  it("正常输出原样返回", () => {
    const r = checkOutputSafety("恐龙是很久以前的动物哦");
    expect(r.safe).toBe(true);
    expect(r.text).toBe("恐龙是很久以前的动物哦");
  });

  it("命中成人内容替换为友好话术", () => {
    const r = checkOutputSafety("这是一段色情内容");
    expect(r.safe).toBe(false);
    expect(r.category).toBe("adult");
    expect(r.text).not.toContain("色情");
  });
});

describe("child-safe-response", () => {
  it("每个安全类别都有话术", () => {
    for (const c of ["violence", "adult", "self_harm", "personal_info", "unsafe_topic", "other"] as const) {
      expect(childSafeBlockMessage(c)).toBeTruthy();
    }
  });

  it("每个错误分类都有话术", () => {
    for (const c of ["auth_error", "network_error", "gateway_error", "quota_error", "tts_error", "stt_error", "safety_blocked", "tool_denied", "agent_error"] as const) {
      expect(childSafeErrorMessage(c)).toBeTruthy();
    }
  });

  it("话术不暴露技术细节", () => {
    const msg = childSafeErrorMessage("gateway_error");
    expect(msg).not.toMatch(/error|gateway|500|exception/i);
  });
});
