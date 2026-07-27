/**
 * bargeInTextGate 单测
 */

import {
  BARGE_IN_MIN_CHARS,
  BARGE_IN_MIN_CHARS_WHILE_SPEAKING,
  countBargeInChars,
  meetsBargeInMinChars,
} from "./bargeInTextGate";

describe("bargeInTextGate", () => {
  it("常量", () => {
    expect(BARGE_IN_MIN_CHARS).toBe(2);
    expect(BARGE_IN_MIN_CHARS_WHILE_SPEAKING).toBe(3);
  });

  it("单汉字不计为可打断", () => {
    expect(countBargeInChars("好")).toBe(1);
    expect(meetsBargeInMinChars("好")).toBe(false);
  });

  it("两汉字通用路径可过，播放期不可", () => {
    expect(meetsBargeInMinChars("等等")).toBe(true);
    expect(meetsBargeInMinChars("等等", { whileSpeaking: true })).toBe(false);
  });

  it("三汉字播放期可过", () => {
    expect(meetsBargeInMinChars("我想说", { whileSpeaking: true })).toBe(true);
  });
});
