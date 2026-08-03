import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import {
  createMobileTts,
  sanitizeTtsText,
  cleanTtsText,
  encodeTtsResult,
  DEFAULT_KIDS_VOICE,
  KIDS_TTS_FORMAT,
  buildEmotionSsml,
  splitSentences,
  type EdgeTtsEngine,
} from "../src/host/mobile-tts.js";

/** 造一个吐指定字节的 fake Edge 引擎 */
function fakeEngine(bytes: number[], opts: { setMeta?: (v: string, f: string) => void } = {}): EdgeTtsEngine {
  return {
    async setMetadata(voice, format) {
      opts.setMeta?.(voice, format);
    },
    toStream() {
      const stream = Readable.from([Buffer.from(bytes)]);
      return { audioStream: stream };
    },
  };
}

describe("sanitizeTtsText", () => {
  it("去首尾空白", () => {
    expect(sanitizeTtsText("  你好  ")).toBe("你好");
  });
  it("空串/纯空白返回 null", () => {
    expect(sanitizeTtsText("")).toBeNull();
    expect(sanitizeTtsText("   \n ")).toBeNull();
  });
});

describe("cleanTtsText", () => {
  it("移除 markdown 粗体", () => {
    expect(cleanTtsText("**你好** 世界")).toBe("你好 世界");
  });

  it("移除 emoji", () => {
    expect(cleanTtsText("你好呀😊")).toBe("你好呀");
  });

  it("移除虚拟人标签", () => {
    expect(cleanTtsText("[happy]小猫在笑")).toBe("小猫在笑");
  });

  it("破折号替换为逗号", () => {
    expect(cleanTtsText("小猫——过来")).toBe("小猫，，过来");
  });

  it("纯标点返回空串", () => {
    expect(cleanTtsText("……，。")).toBe("");
  });
});

describe("encodeTtsResult", () => {
  it("mp3 Buffer → base64 + 元信息", () => {
    const buf = Buffer.from([0x49, 0x44, 0x33]); // "ID3" mp3 头
    const r = encodeTtsResult(buf);
    expect(r.audioBase64).toBe(buf.toString("base64"));
    expect(r.byteLength).toBe(3);
    expect(r.mimeType).toBe("audio/mp3");
  });
});

describe("createMobileTts.synthesize", () => {
  it("合成文本 → base64 结果", async () => {
    const tts = createMobileTts({ engineFactory: async () => fakeEngine([1, 2, 3, 4]) });
    const r = await tts.synthesize("你好呀");
    expect(r).not.toBeNull();
    expect(r?.byteLength).toBe(4);
    expect(r?.audioBase64).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
  });

  it("空文本返回 null（不触发合成）", async () => {
    const factory = vi.fn(async () => fakeEngine([1]));
    const tts = createMobileTts({ engineFactory: factory });
    expect(await tts.synthesize("   ")).toBeNull();
    expect(factory).not.toHaveBeenCalled(); // 引擎都没初始化
  });

  it("首次合成用默认音色+格式 setMetadata", async () => {
    const setMeta = vi.fn();
    const tts = createMobileTts({ engineFactory: async () => fakeEngine([1], { setMeta }) });
    await tts.synthesize("test");
    expect(setMeta).toHaveBeenCalledWith(DEFAULT_KIDS_VOICE, KIDS_TTS_FORMAT);
  });

  it("引擎复用：多次合成只初始化一次", async () => {
    const factory = vi.fn(async () => fakeEngine([1, 2]));
    const tts = createMobileTts({ engineFactory: factory });
    await tts.synthesize("一");
    await tts.synthesize("二");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("自定义音色透传 setMetadata", async () => {
    const setMeta = vi.fn();
    const tts = createMobileTts({
      voice: "zh-CN-YunxiNeural",
      engineFactory: async () => fakeEngine([1], { setMeta }),
    });
    await tts.synthesize("test");
    expect(setMeta).toHaveBeenCalledWith("zh-CN-YunxiNeural", KIDS_TTS_FORMAT);
  });

  it("音频流 error 时 synthesize 抛出", async () => {
    const engine: EdgeTtsEngine = {
      async setMetadata() {},
      toStream() {
        const stream = new Readable({ read() {} });
        process.nextTick(() => stream.emit("error", new Error("ws closed")));
        return { audioStream: stream };
      },
    };
    const tts = createMobileTts({ engineFactory: async () => engine, maxRetries: 0 });
    await expect(tts.synthesize("boom")).rejects.toThrow("ws closed");
  });

  it("空音频抛出（转 tts_error 而非静默无声）", async () => {
    const tts = createMobileTts({ engineFactory: async () => fakeEngine([]), maxRetries: 0 });
    await expect(tts.synthesize("空的")).rejects.toThrow("空音频");
  });

  it("弱网重试：首次失败后重建引擎并重试成功", async () => {
    let calls = 0;
    const factory = vi.fn(async (): Promise<EdgeTtsEngine> => ({
      async setMetadata() {},
      toStream() {
        calls++;
        if (calls === 1) {
          const stream = new Readable({ read() {} });
          process.nextTick(() => stream.emit("error", new Error("ws closed")));
          return { audioStream: stream };
        }
        return { audioStream: Readable.from([Buffer.from([5, 6])]) };
      },
    }));
    const tts = createMobileTts({ engineFactory: factory, maxRetries: 2 });
    const r = await tts.synthesize("重试一下");
    expect(r?.byteLength).toBe(2);
    expect(factory).toHaveBeenCalledTimes(2); // 失败后引擎重置 → 第二次重建
  });

  it("相同文本命中缓存，只合成一次（降低接口调用）", async () => {
    const toStream = vi.fn(() => ({ audioStream: Readable.from([Buffer.from([1, 2, 3])]) }));
    const engine: EdgeTtsEngine = { async setMetadata() {}, toStream };
    const tts = createMobileTts({ engineFactory: async () => engine });
    const a = await tts.synthesize("你好呀");
    const b = await tts.synthesize("你好呀");
    expect(a?.audioBase64).toBe(b?.audioBase64);
    expect(toStream).toHaveBeenCalledTimes(1); // 第二次走缓存，不再合成
  });

  it("切换音色后相同文本重新合成（缓存 key 含音色）", async () => {
    const toStream = vi.fn(() => ({ audioStream: Readable.from([Buffer.from([9])]) }));
    const engine: EdgeTtsEngine = { async setMetadata() {}, toStream };
    const tts = createMobileTts({ engineFactory: async () => engine });
    await tts.synthesize("重复");
    await tts.setVoice("zh-CN-YunxiNeural");
    await tts.synthesize("重复");
    expect(toStream).toHaveBeenCalledTimes(2);
  });
});

describe("splitSentences", () => {
  it("按句末标点切句，保留标点", () => {
    expect(splitSentences("你好呀！今天玩什么？")).toEqual(["你好呀！", "今天玩什么？"]);
  });
  it("无句末标点整体作一句", () => {
    expect(splitSentences("一段没有标点的话")).toEqual(["一段没有标点的话"]);
  });
});

describe("按句缓存", () => {
  it("重叠句子命中缓存，只合成未见过的句子", async () => {
    const seen: string[] = [];
    const engine: EdgeTtsEngine = {
      async setMetadata() {},
      toStream(text) {
        seen.push(text);
        return { audioStream: Readable.from([Buffer.from([text.length])]) };
      },
    };
    const tts = createMobileTts({ engineFactory: async () => engine });
    await tts.synthesize("你好呀！今天玩什么？"); // 合成 2 句
    await tts.synthesize("你好呀！我们画画吧。"); // 首句命中缓存，只合成第 2 句
    expect(seen).toEqual(["你好呀！", "今天玩什么？", "我们画画吧。"]);
  });

  it("多句合成结果为各句字节拼接", async () => {
    const engine: EdgeTtsEngine = {
      async setMetadata() {},
      toStream(text) {
        // 每句吐出与句长相等的字节，便于校验拼接顺序
        return { audioStream: Readable.from([Buffer.from(new Array(text.length).fill(1))]) };
      },
    };
    const tts = createMobileTts({ engineFactory: async () => engine });
    const r = await tts.synthesize("啊！哦哦。");
    expect(r?.byteLength).toBe("啊！".length + "哦哦。".length);
  });
});

describe("buildEmotionSsml", () => {
  it("含 express-as style 与音色，文本被 XML 转义", () => {
    const ssml = buildEmotionSsml("zh-CN-XiaoxiaoNeural", "a<b&c", "cheerful", 1.0);
    expect(ssml).toContain('name="zh-CN-XiaoxiaoNeural"');
    expect(ssml).toContain('style="cheerful"');
    expect(ssml).toContain("a&lt;b&amp;c");
    expect(ssml).toContain('rate="+0%"');
  });
  it("语速倍率转相对百分比", () => {
    expect(buildEmotionSsml("v", "x", "gentle", 1.2)).toContain('rate="+20%"');
    expect(buildEmotionSsml("v", "x", "gentle", 0.9)).toContain('rate="-10%"');
  });
});

describe("createMobileTts 情绪风格", () => {
  it("显式传 style + 引擎支持 rawToStream → 走 express-as SSML", async () => {
    const rawToStream = vi.fn(() => ({ audioStream: Readable.from([Buffer.from([7])]) }));
    const toStream = vi.fn(() => ({ audioStream: Readable.from([Buffer.from([8])]) }));
    const engine: EdgeTtsEngine = { async setMetadata() {}, toStream, rawToStream };
    const tts = createMobileTts({ style: "cheerful", engineFactory: async () => engine });
    await tts.synthesize("你好呀");
    expect(rawToStream).toHaveBeenCalledTimes(1);
    expect(toStream).not.toHaveBeenCalled();
    const ssmlArg = (rawToStream.mock.calls as unknown as string[][])[0]?.[0];
    expect(ssmlArg).toContain("mstts:express-as");
  });

  it("默认关闭情绪（style 缺省）→ 走普通 toStream", async () => {
    const rawToStream = vi.fn(() => ({ audioStream: Readable.from([Buffer.from([7])]) }));
    const toStream = vi.fn(() => ({ audioStream: Readable.from([Buffer.from([8])]) }));
    const engine: EdgeTtsEngine = { async setMetadata() {}, toStream, rawToStream };
    const tts = createMobileTts({ engineFactory: async () => engine });
    await tts.synthesize("你好呀");
    expect(toStream).toHaveBeenCalledTimes(1);
    expect(rawToStream).not.toHaveBeenCalled();
  });
});
