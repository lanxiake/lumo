/**
 * echoTextFilter 单测
 */

import {
  bigramJaccard,
  collapseCharStutter,
  collapseRepeatedChunks,
  hasHeavyRepetition,
  looksLikeTtsEcho,
  normalizeEchoText,
  repetitionCollapseRatio,
  sanitizeForEchoCompare,
  subsequenceRatio,
} from "./echoTextFilter";

describe("echoTextFilter", () => {
  it("normalizeEchoText 去掉标点空白", () => {
    expect(normalizeEchoText("你好，世界！")).toBe("你好世界");
  });

  it("TTS 包含 STT → 视为回声", () => {
    expect(looksLikeTtsEcho("今天天气", "今天天气真好呀小朋友")).toBe(true);
  });

  it("用户插话与 TTS 无关 → 非回声", () => {
    expect(looksLikeTtsEcho("停一下我想问", "今天天气真好呀小朋友")).toBe(false);
  });

  it("高度重叠 → 视为回声", () => {
    expect(looksLikeTtsEcho("今天天气真好", "今天天气真好呀")).toBe(true);
  });

  it("bigramJaccard 相同串为 1", () => {
    expect(bigramJaccard("你好呀", "你好呀")).toBe(1);
  });

  it("折叠连续重复片段", () => {
    expect(collapseRepeatedChunks("你好你好呀")).toBe("你好呀");
    expect(collapseRepeatedChunks("哎呀哎呀哎呀")).toBe("哎呀");
  });

  it("折叠单字抖音", () => {
    expect(collapseCharStutter("佳佳佳佳佳")).toBe("佳");
    expect(collapseCharStutter("嗯嗯嗯小佳")).toBe("嗯小佳");
  });

  it("sanitize 去掉语气词前缀并折叠", () => {
    expect(sanitizeForEchoCompare("哇你好你好呀")).toBe("你好呀");
    expect(sanitizeForEchoCompare("嗯嗯嗯小佳佳佳佳")).toBe("小佳");
  });

  it("ASR 叠字回声（你好→你好你好呀）仍视为回声", () => {
    const tts = "你好呀小佳佳小猫姐姐听到你啦你的声音好清楚呢";
    expect(looksLikeTtsEcho("你好", tts)).toBe(true);
    expect(looksLikeTtsEcho("你好你好呀", tts)).toBe(true);
  });

  it("真机漏判：哇+叠字+你是小", () => {
    const tts = "你好呀小佳佳小猫姐姐听到你啦你的声音好清楚呢今天想跟我聊什么呢";
    expect(looksLikeTtsEcho("哇你好你好呀你好你好呀你是小", tts, { profile: "final" })).toBe(true);
    // barge 路径偏松：叠字主体仍应能判回声
    expect(looksLikeTtsEcho("哇你好你好呀你好你好呀", tts, { profile: "barge" })).toBe(true);
  });

  it("真机漏判：嗯+佳抖音", () => {
    const tts = "哎呀被你发现啦我太想跟你打招呼了小佳佳";
    expect(looksLikeTtsEcho("嗯嗯嗯小佳佳佳佳佳佳佳佳士是说", tts, { profile: "final" })).toBe(true);
  });

  it("真插话在 barge 路径不被误判", () => {
    const tts = "今天天气真好呀小朋友我们一起玩吧";
    expect(looksLikeTtsEcho("停一下我想问个问题", tts, { profile: "barge" })).toBe(false);
  });

  it("子序列匹配真实插话仍为非回声", () => {
    expect(subsequenceRatio("停一下我想问问题", "今天天气真好呀小朋友")).toBeLessThan(0.5);
    expect(looksLikeTtsEcho("停一下我想问问题", "今天天气真好呀小朋友")).toBe(false);
  });

  describe("hasHeavyRepetition（语种无关回声）", () => {
    it("重度重复串（粤语回声典型形态）判为回声", () => {
      // 真机粤语 TTS → 普通话 ASR 转写：无法与 TTS 比相似度，靠重复特征识别
      expect(hasHeavyRepetition("嘿嘿嘿嘿姐姐姐姐姐姐在这里讲该改改改")).toBe(true);
      expect(repetitionCollapseRatio("嘿嘿嘿嘿姐姐姐姐姐姐在这里讲该改改改")).toBeGreaterThan(0.4);
    });

    it("正常方言插话不判为回声", () => {
      // 东北话/普通话真人短句：无异常重复
      expect(hasHeavyRepetition("你等我一下我想说个事")).toBe(false);
      expect(hasHeavyRepetition("干哈呢咋不理我了")).toBe(false);
    });

    it("短句不判（避免误杀）", () => {
      expect(hasHeavyRepetition("你好呀")).toBe(false);
      expect(hasHeavyRepetition("等等啊")).toBe(false);
    });
  });
});
