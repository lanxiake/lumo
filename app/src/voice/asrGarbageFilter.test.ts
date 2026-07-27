/**
 * asrGarbageFilter 单测
 */

import { classifyAsrGarbage, isMeaninglessAsrText } from "./asrGarbageFilter";

describe("asrGarbageFilter", () => {
  it("空与纯标点 → garbage", () => {
    expect(isMeaninglessAsrText("")).toBe(true);
    expect(isMeaninglessAsrText("？？")).toBe(true);
  });

  it("单字语气词 → garbage", () => {
    expect(isMeaninglessAsrText("嗯")).toBe(true);
    expect(isMeaninglessAsrText("啊")).toBe(true);
    expect(isMeaninglessAsrText("的")).toBe(true);
  });

  it("儿童短答放行", () => {
    expect(isMeaninglessAsrText("好")).toBe(false);
    expect(isMeaninglessAsrText("是")).toBe(false);
    expect(isMeaninglessAsrText("要")).toBe(false);
  });

  it("黑名单短语 → garbage", () => {
    expect(isMeaninglessAsrText("嗯嗯")).toBe(true);
    expect(isMeaninglessAsrText("那个")).toBe(true);
    expect(isMeaninglessAsrText("谢谢观看")).toBe(true);
  });

  it("叠字噪声 → garbage", () => {
    expect(classifyAsrGarbage("啊啊啊啊").reason).toBe("repeated_char");
  });

  it("正常句子放行", () => {
    expect(isMeaninglessAsrText("今天天气怎么样")).toBe(false);
    expect(isMeaninglessAsrText("我想听故事")).toBe(false);
  });

  it("什么/怎么短问放行", () => {
    expect(isMeaninglessAsrText("什么")).toBe(false);
    expect(isMeaninglessAsrText("怎么")).toBe(false);
  });
});
