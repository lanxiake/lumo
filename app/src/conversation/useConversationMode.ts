/**
 * useConversationMode — 会话模式管理
 *
 * 简化为二态：normal | phone_call，由用户手动切换。
 * 移除 standby 自动进入与唤醒词相关逻辑。
 */

import { useCallback, useState } from "react";

export type ConversationMode = "normal" | "phone_call";

export interface UseConversationModeOptions {
  /** @deprecated 宠物可见性不再影响模式切换 */
  readonly petVisible?: boolean;
  /** 模式变化回调 */
  readonly onModeChange?: (mode: ConversationMode, prev: ConversationMode) => void;
}

export interface UseConversationModeResult {
  readonly mode: ConversationMode;
  readonly enterPhoneCall: () => void;
  readonly exitPhoneCall: () => void;
  /** @deprecated standby 已移除，保留空实现避免外部引用报错 */
  readonly wakeUp: () => void;
  /** @deprecated standby 已移除，保留空实现避免外部引用报错 */
  readonly resetInactivityTimer: () => void;
}

export function useConversationMode(options?: UseConversationModeOptions): UseConversationModeResult {
  const { onModeChange } = options ?? {};
  const [mode, setMode] = useState<ConversationMode>("normal");

  const transition = useCallback(
    (next: ConversationMode) => {
      setMode((prev) => {
        if (prev === next) return prev;
        onModeChange?.(next, prev);
        return next;
      });
    },
    [onModeChange],
  );

  const enterPhoneCall = useCallback(() => {
    transition("phone_call");
  }, [transition]);

  const exitPhoneCall = useCallback(() => {
    transition("normal");
  }, [transition]);

  const wakeUp = useCallback(() => {
    // standby 已移除：从 normal 进入 phone_call 保持语义兼容。
    if (mode !== "phone_call") {
      transition("phone_call");
    }
  }, [mode, transition]);

  const resetInactivityTimer = useCallback(() => {
    // standby 已移除：无需任何操作。
  }, []);

  return {
    mode,
    enterPhoneCall,
    exitPhoneCall,
    wakeUp,
    resetInactivityTimer,
  };
}
