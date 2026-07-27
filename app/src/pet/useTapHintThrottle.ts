/**
 * useTapHintThrottle — Live2D 点击「发给 AI 的隐式提示」防抖 + 冷却
 *
 * 背景：小朋友快速连点宠物时，每次 tap 都发 hint → Agent 每次都回一句 →
 * TTS 合成排不过来 → 大量静音/无响应。本 hook 只节流「发给 AI 的提示」，
 * 本地表情/动作/涟漪反馈仍应在调用方即时触发（不经此 hook）。
 *
 * 策略：
 *  - 防抖 debounceMs：连点合并，停手后才发一次（取最后一次点击的部位提示）。
 *  - 冷却 cooldownMs：一次真正发送后，冷却期内的点击不再发；冷却结束后若期间
 *    有新点击，则补发最后一次。
 */

import { useCallback, useEffect, useRef } from "react";

export interface UseTapHintThrottleOptions {
  /** 实际发送函数（如 voiceSession.sendHintMessage） */
  readonly send: (text: string) => void;
  /** 防抖窗口（默认 1500ms）：窗口内连点合并 */
  readonly debounceMs?: number;
  /** 冷却时长（默认 4000ms）：一次发送后静默期 */
  readonly cooldownMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 1500;
const DEFAULT_COOLDOWN_MS = 4000;

/**
 * 返回 pushTapHint：把一次点击的提示文本投入节流管线。
 */
export function useTapHintThrottle(options: UseTapHintThrottleOptions): (text: string) => void {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  // send 用 ref 持有，避免 pushTapHint 因 send 变化而重建
  const sendRef = useRef(options.send);
  sendRef.current = options.send;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最近一次点击待发送的文本（合并多次连点，取最后一个部位）
  const pendingTextRef = useRef<string | null>(null);
  // 是否处于冷却期
  const inCooldownRef = useRef(false);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // 真正发送：发出 pending 文本、进入冷却；冷却结束若有新 pending 则补发
  const flush = useCallback(() => {
    const text = pendingTextRef.current;
    if (text == null) return;
    pendingTextRef.current = null;
    sendRef.current(text);

    inCooldownRef.current = true;
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      inCooldownRef.current = false;
      cooldownTimerRef.current = null;
      // 冷却期间若有累积的点击，补发最后一次
      if (pendingTextRef.current != null) {
        flush();
      }
    }, cooldownMs);
  }, [cooldownMs]);

  const pushTapHint = useCallback(
    (text: string) => {
      // 始终记录最新点击文本（合并语义：摸头后又戳脸，应回应最新动作）
      pendingTextRef.current = text;
      // 冷却期内只累积、不发；冷却结束时统一补发
      if (inCooldownRef.current) return;
      // 防抖：停手后再发
      clearDebounce();
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        flush();
      }, debounceMs);
    },
    [clearDebounce, flush, debounceMs],
  );

  // 卸载清理所有 timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  return pushTapHint;
}
