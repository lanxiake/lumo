/**
 * useSpeechRecognition.ts — 生产入口（薄包装）
 *
 * 注入 react-native 默认值，底层逻辑在 useSpeechRecognitionCore.ts（零 RN 依赖，可单测）。
 * 生产环境使用 sherpa-onnx 本地离线流式 ASR（int8 量化模型 + Silero VAD）。
 * 旧的 Vosk 引擎已移除（模型/依赖过大且精度较低）。
 */

import { Platform, PermissionsAndroid } from "react-native";
import {
  useSpeechRecognitionCore,
  type UseSpeechRecognitionOptions,
  type UseSpeechRecognitionResult,
  type RequestMicPermissionFn,
  type SpeechResult,
  type SpeechError,
  type EventEmitterLike,
} from "./useSpeechRecognitionCore";
import {
  sherpaNativeModule,
  createSherpaEmitter,
  setSherpaVadHandlers,
  type SherpaVadHandlers,
} from "./sherpaSpeechRecognition";

export type {
  UseSpeechRecognitionOptions,
  UseSpeechRecognitionResult,
  RequestMicPermissionFn,
  SpeechResult,
  SpeechError,
  EventEmitterLike,
};

/** 生产环境默认权限请求 */
async function defaultRequestMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: "需要麦克风权限",
      message: "宠物需要听到你的声音才能和你聊天哦~",
      buttonPositive: "允许",
      buttonNegative: "拒绝",
    },
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/** 生产入口选项：在 core 选项基础上，允许注入 VAD 端点回调（sherpa 声学端点） */
export interface UseSpeechRecognitionProdOptions
  extends Omit<UseSpeechRecognitionOptions, "nativeModule" | "createEmitter"> {
  /** sherpa VAD 声学端点回调，供状态机 barge-in 长度门控 */
  readonly vadHandlers?: SherpaVadHandlers;
}

/** 生产入口：sherpa-onnx 流式 ASR */
export function useSpeechRecognition(
  opts?: UseSpeechRecognitionProdOptions,
): UseSpeechRecognitionResult {
  // 注册 VAD 端点回调（sherpa 提供声学端点）
  if (opts?.vadHandlers) {
    setSherpaVadHandlers(opts.vadHandlers);
  }

  return useSpeechRecognitionCore({
    nativeModule: sherpaNativeModule,
    requestPermission: opts?.requestPermission ?? defaultRequestMicPermission,
    createEmitter: createSherpaEmitter,
  });
}
