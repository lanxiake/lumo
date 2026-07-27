import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import {
  createMobileTts,
  sanitizeTtsText,
  cleanTtsText,
  encodeTtsResult,
  DEFAULT_KIDS_VOICE,
  KIDS_TTS_FORMAT,
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
    const tts = createMobileTts({ engineFactory: async () => engine });
    await expect(tts.synthesize("boom")).rejects.toThrow("ws closed");
  });

  it("空音频抛出（转 tts_error 而非静默无声）", async () => {
    const tts = createMobileTts({ engineFactory: async () => fakeEngine([]) });
    await expect(tts.synthesize("空的")).rejects.toThrow("空音频");
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
