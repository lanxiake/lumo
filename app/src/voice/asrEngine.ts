/**
 * asrEngine.ts — ASR 引擎标识
 *
 * 生产使用 sherpa-onnx OnlineRecognizer（流式，int8 量化模型 + Silero VAD）。
 * 旧的 Vosk 引擎已移除（模型/依赖过大、精度较低）。此文件保留引擎标识与
 * VAD 能力判定，供 App 决定是否注册声学端点回调。
 */

export type AsrEngine = "sherpa";

/** 当前启用的 ASR 引擎。 */
export const ACTIVE_ASR_ENGINE: AsrEngine = "sherpa";

/** 当前引擎是否提供声学 VAD 端点（sherpa 提供，用于 barge-in 长度门控） */
export function engineHasVad(engine: AsrEngine = ACTIVE_ASR_ENGINE): boolean {
  return engine === "sherpa";
}
