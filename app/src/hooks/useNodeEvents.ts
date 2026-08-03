/**
 * useNodeEvents — 将 Node 侧 MobileNodeEvent 分发给 App Action 处理器
 *
 * 监听 useNodeHost 的 lastEvent，把 navigate / play_sound / show_toast / image_ready
 * 等事件转交给 useAppActions，实现 Agent 直接控制 App。
 *
 * 注意：agent_delta / agent_final / safety_blocked 等驱动宠物状态机的事件仍由
 * App.tsx 内已有逻辑处理；本 hook 只消费 App Action 类事件。
 */

import { useEffect, useRef } from "react";
import type { MobileNodeEvent } from "../../node-runtime/src/bridge/schema";
import type { AppActions, ChildSafeScreen, SoundName, ToastStyle } from "./useAppActions";

const CHILD_SAFE_SCREENS: readonly ChildSafeScreen[] = [
  "pet_stage",
  "gallery",
  "chat_history",
  "pet_selection",
  "settings",
  "game_history",
  "system_logs",
];

const SOUND_NAMES: readonly SoundName[] = [
  "success",
  "encourage",
  "tick",
  "pop",
  "complete",
  "error",
];

const TOAST_STYLES: readonly ToastStyle[] = ["info", "success", "hint"];

function isChildSafeScreen(value: string): value is ChildSafeScreen {
  return (CHILD_SAFE_SCREENS as readonly string[]).includes(value);
}

function isSoundName(value: string): value is SoundName {
  return (SOUND_NAMES as readonly string[]).includes(value);
}

function isToastStyle(value: string): value is ToastStyle {
  return (TOAST_STYLES as readonly string[]).includes(value);
}

export function useNodeEvents(
  lastEvent: MobileNodeEvent | null,
  actions: AppActions,
): void {
  // 每个 event 仅消费一次：actions 是每渲染新建的对象字面量（不稳定依赖），
  // 若不去重，任一无条件 setState 的分支（如 show_toast）会 setState→重渲染→
  // actions 新引用→effect 重跑同一 event→再 setState 死循环（Maximum update depth）。
  const handledRef = useRef<MobileNodeEvent | null>(null);
  useEffect(() => {
    if (!lastEvent || lastEvent === handledRef.current) return;
    handledRef.current = lastEvent;

    switch (lastEvent.type) {
      case "navigate": {
        const target = lastEvent.payload.target;
        if (!isChildSafeScreen(target)) {
          console.warn(`[useNodeEvents] 非法导航目标: ${target}`);
          return;
        }
        actions.navigate(target, lastEvent.payload.reason);
        break;
      }
      case "play_sound": {
        const sound = lastEvent.payload.sound;
        if (!isSoundName(sound)) {
          console.warn(`[useNodeEvents] 非法音效名: ${sound}`);
          return;
        }
        actions.playSound(sound, lastEvent.payload.volume);
        break;
      }
      case "show_toast": {
        const style = lastEvent.payload.style ?? "info";
        if (!isToastStyle(style)) {
          console.warn(`[useNodeEvents] 非法 Toast 样式: ${style}`);
          return;
        }
        actions.showToast(lastEvent.payload.text, style);
        break;
      }
      case "image_ready": {
        actions.openGallery(lastEvent.payload.url, lastEvent.payload.prompt);
        break;
      }
      case "playground_open": {
        // replaceId 存在表示这是"改一改"后的就地更新，替换同 id 条目而非新增。
        const replaceId = lastEvent.payload.replaceId;
        actions.openPlayground(
          lastEvent.payload.html,
          lastEvent.payload.title,
          replaceId ? { replaceId } : undefined,
        );
        break;
      }
      case "playground_close": {
        actions.closePlayground();
        break;
      }
      default:
        // 其它事件（agent_delta / agent_final 等）不在本层消费
        break;
    }
  }, [lastEvent, actions]);
}
