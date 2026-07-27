/**
 * mobile-tts — 移动端本地 Edge TTS（客户端直连，不走 Gateway）
 *
 * 复用 msedge-tts 直连微软 Edge Read Aloud API：匿名、免费、无需 API Key，
 * 与 Windows apps/windows/src/main/voice/tts-engine.ts 的 EdgeTtsFallback 同源。
 * nodejs-mobile 内嵌 Node18 可跑（msedge-tts 依赖 ws/axios 纯 JS，无 native）。
 *
 * 安全边界：Edge TTS 是公开语音服务，不涉及上游 LLM Key，本地直连不违反
 * "密钥不下发"（规范 §1.3）。合成在设备内完成，文本不经我方服务器。
 *
 * 产物：mp3 字节 → base64，经 bridge 的 tts_audio 事件回传 RN 播放
 * （方案决策：node 读音频→base64→bridge，链路最短，不依赖未实现的 /audio 端点）。
 *
 * 纯逻辑（文本清洗 / base64 编码）与副作用（WS 合成）分离，msedge 实例注入便于单测。
 */

import { stripVirtualHumanTags } from "@lumo/core";

/** 儿童默认音色（与 Gateway/Windows 一致） */
export const DEFAULT_KIDS_VOICE = "zh-CN-XiaoxiaoNeural";

/** msedge-tts 输出格式常量（避免单测/打包期强依赖枚举导入） */
export const KIDS_TTS_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/** 合成结果 */
export interface TtsResult {
  /** mp3 音频的 base64（不含 data URI 前缀） */
  readonly audioBase64: string;
  /** MIME 类型（RN 侧据此写临时文件/构造 data URI） */
  readonly mimeType: "audio/mpeg" | "audio/mp3";
  /** 原始字节数（日志/调试用，不含敏感信息） */
  readonly byteLength: number;
}

/** msedge-tts 实例的最小接口（便于注入 fake 单测，不打真实网络） */
export interface EdgeTtsEngine {
  setMetadata(voice: string, format: string): Promise<void>;
  toStream(text: string, options?: { rate?: number }): { audioStream: NodeJS.ReadableStream };
}

/** 单次 TTS 合成超时（ms；Edge TTS 首包通常 1~3s，真机弱网放宽到 15s） */
const DEFAULT_SYNTHESIZE_TIMEOUT_MS = 15_000;

/** 用 Promise.race 给合成加超时 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms),
    ),
  ]);
}

export interface MobileTtsDeps {
  /** 注入的 Edge TTS 引擎（缺省惰性 new MsEdgeTTS()） */
  readonly engineFactory?: () => Promise<EdgeTtsEngine>;
  /** 音色 */
  readonly voice?: string;
  /** 语速倍率 */
  readonly speed?: number;
  /** 合成超时（毫秒） */
  readonly timeoutMs?: number;
  /** 脱敏日志 */
  readonly log?: (msg: string) => void;
}

/** 清洗待合成文本：去除首尾空白；空串返回 null（不触发合成） */
export function sanitizeTtsText(text: string): string | null {
  const t = text.trim();
  return t.length > 0 ? t : null;
}

/**
 * 清洗 TTS 输入文本：移除 markdown / emoji / OOV 字符，使日志与实际语音一致。
 * 与 Windows `voice-service.ts` 的 `_cleanTtsText` 对齐。
 */
export function cleanTtsText(text: string): string {
  const cleaned = stripVirtualHumanTags(text)
    // 1. 移除 markdown 格式标记
    .replace(/\*{1,3}([^*]*)\*{1,3}/g, "$1") // **bold** / *italic*
    .replace(/~~([^~]*)~~/g, "$1") // ~~strikethrough~~
    .replace(/^#{1,6}\s+/gm, "") // ## headings
    .replace(/^[-*+]\s+/gm, "") // - list items
    .replace(/^>\s+/gm, "") // > blockquotes
    .replace(/`([^`]*)`/g, "$1") // `code`
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [link](url)
    .replace(/\*+/g, "") // 残留的 *
    // 2. 替换 VITS OOV 字符为等价形式
    .replace(/[—–]/g, "，") // em/en dash → 逗号停顿
    .replace(/[“”]/g, "") // "" 弯引号 → 移除
    .replace(/[‘’]/g, "") // '' 弯引号 → 移除
    // 3. 移除 emoji
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
      "",
    )
    .trim();

  // 清洗后若仅剩标点/空白，返回空串
  if (/^[\s。！？…，；、：《》【】（）.!?,;:\n\r\t-]*$/u.test(cleaned)) {
    return "";
  }

  return cleaned;
}

/** 把 mp3 Buffer 编成 TtsResult（纯逻辑，可测） */
export function encodeTtsResult(buffer: Buffer): TtsResult {
  return {
    audioBase64: buffer.toString("base64"),
    mimeType: "audio/mp3",
    byteLength: buffer.length,
  };
}

/** 默认引擎工厂：惰性加载 msedge-tts（打包期不进启动路径，按需 require） */
async function defaultEngineFactory(): Promise<EdgeTtsEngine> {
  const mod = await import("msedge-tts");
  const engine = new mod.MsEdgeTTS();
  return engine as unknown as EdgeTtsEngine;
}

/**
 * 创建移动端 TTS 合成器。返回 synthesize(text) → TtsResult | null（空文本返回 null）。
 * 引擎惰性初始化 + 复用（首次 synthesize 时 setMetadata）。
 */
/** 合成结果缓存上限（条）。命中相同文本直接复用，省一次 Edge 网络合成。 */
const TTS_CACHE_MAX = 64;

export function createMobileTts(deps: MobileTtsDeps = {}) {
  let voice = deps.voice ?? DEFAULT_KIDS_VOICE;
  const speed = deps.speed ?? 1.0;
  const factory = deps.engineFactory ?? defaultEngineFactory;
  let engine: EdgeTtsEngine | null = null;

  // 文本→合成结果 LRU 缓存（key 含音色/语速，切音色不会串用旧音频）。
  // 点击台词、常见回复高度重复，缓存显著降低 Edge 接口调用频率与首包延迟。
  const cache = new Map<string, TtsResult>();

  function cacheGet(key: string): TtsResult | undefined {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key); // 命中移到末尾（LRU 最近使用）
      cache.set(key, hit);
    }
    return hit;
  }

  function cacheSet(key: string, value: TtsResult): void {
    cache.set(key, value);
    if (cache.size > TTS_CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  async function ensureEngine(): Promise<EdgeTtsEngine> {
    if (engine) return engine;
    const e = await factory();
    await e.setMetadata(voice, KIDS_TTS_FORMAT);
    engine = e;
    return e;
  }

  return {
    /** 合成文本为 mp3 base64；空文本返回 null；失败抛出（调用方转 tts_error） */
    async synthesize(text: string): Promise<TtsResult | null> {
      const clean = sanitizeTtsText(cleanTtsText(text));
      if (!clean) return null;

      const cacheKey = `${voice}|${speed}|${clean}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        deps.log?.(`[tts] 缓存命中 文本=${clean.length}字 字节=${cached.byteLength}`);
        return cached;
      }

      const e = await ensureEngine();
      const { audioStream } = e.toStream(clean, { rate: speed });

      const chunks: Buffer[] = [];
      const collectPromise = new Promise<void>((resolve, reject) => {
        audioStream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        audioStream.on("end", () => resolve());
        audioStream.on("error", (err: Error) => reject(err));
      });

      await withTimeout(collectPromise, deps.timeoutMs ?? DEFAULT_SYNTHESIZE_TIMEOUT_MS, "TTS 合成");
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        // 空音频视为合成失败：抛出让调用方转 tts_error 提示，而非静默无声。
        throw new Error("TTS 合成返回空音频");
      }
      const result = encodeTtsResult(buffer);
      cacheSet(cacheKey, result);
      deps.log?.(`[tts] 合成完成 文本=${clean.length}字 字节=${buffer.length}`);
      return result;
    },
    /** 切换音色；下次合成时生效（重置引擎缓存以重新 setMetadata） */
    async setVoice(newVoice: string): Promise<void> {
      if (!newVoice || newVoice === voice) return;
      voice = newVoice;
      engine = null; // 下次 ensureEngine 会用新 voice 重新初始化
      deps.log?.(`[tts] 切换音色 → ${newVoice}`);
    },
  };
}

export type MobileTts = ReturnType<typeof createMobileTts>;
