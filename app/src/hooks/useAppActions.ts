/**
 * useAppActions — App Action 状态管理 hook
 *
 * 封装 MVP 儿童 App 的交互状态：页面导航 overlay、Toast、画廊图片、游戏历史。
 * 不依赖具体导航库，便于后续替换为 React Navigation。
 *
 * 页面策略（方案 A）：主舞台始终可见，gallery / chat_history / settings 等
 * 作为 overlay 从底部滑入。overlay 内用栈式导航：设置 → 我的画/游戏/聊天
 * 时 goBack 回到设置；栈空或 closeOverlay 才回宠物舞台。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SoundEffectPlayerHandle } from "../components/SoundEffectPlayer";
import type { SecureStorage } from "../auth/secureStorage";
import {
  dedupeGalleryImages,
  dedupeGameHistory,
  loadGalleryImages,
  loadGameHistory,
  normalizeKey,
  saveGalleryImages,
  saveGameHistory,
} from "../storage/appDataPersistence";

/** 儿童安全页面 */
export type ChildSafeScreen =
  | "pet_stage"
  | "gallery"
  | "chat_history"
  | "pet_selection"
  | "settings"
  | "game_history"
  | "system_logs";

/** 音效名 */
export type SoundName =
  | "success"
  | "encourage"
  | "tick"
  | "pop"
  | "complete"
  | "error"
  | "call_start"
  | "call_end";

/** Toast 样式 */
export type ToastStyle = "info" | "success" | "hint";

/** 画廊图片项 */
export interface GalleryImage {
  readonly url: string;
  readonly prompt?: string;
  readonly createdAt: number;
}

/** 游戏历史项 */
export interface GameEntry {
  readonly id: string;
  readonly title: string;
  readonly html: string;
  readonly createdAt: number;
}

/** Toast 状态 */
export interface ToastState {
  readonly visible: boolean;
  readonly text: string;
  readonly style: ToastStyle;
}

/** 资源创建通知（用于统一在聊天记录插入缩略图卡片） */
export type ResourceCreatedInfo =
  | { readonly kind: "image"; readonly url: string; readonly prompt?: string }
  | { readonly kind: "game"; readonly gameId: string; readonly title: string };

/** App Action 可执行方法 */
export interface AppActions {
  readonly navigate: (target: ChildSafeScreen, reason?: string) => void;
  readonly playSound: (sound: SoundName, volume?: number) => void;
  readonly showToast: (text: string, style?: ToastStyle) => void;
  readonly openGallery: (imageUrl: string, prompt?: string) => void;
  /** 打开互动页面。existingId：从历史重玩（不新增）；replaceId：编辑后就地替换同 id 条目 */
  readonly openPlayground: (
    html: string,
    title: string,
    opts?: { existingId?: string; replaceId?: string },
  ) => void;
  readonly closePlayground: () => void;
  /** 关闭整个 overlay（清空导航栈，回舞台） */
  readonly closeOverlay: () => void;
  /** 栈顶出栈；栈空则关闭 overlay */
  readonly goBack: () => void;
  readonly deleteImage: (index: number) => void;
  readonly deleteGame: (id: string) => void;
}

/** Playground 状态 */
export interface PlaygroundState {
  readonly open: boolean;
  readonly html: string;
  readonly title: string;
}

/** App Action 暴露给 UI 的状态 */
export interface AppActionsState {
  readonly currentScreen: ChildSafeScreen;
  readonly overlayOpen: boolean;
  readonly toast: ToastState;
  readonly galleryImages: readonly GalleryImage[];
  readonly gameHistory: readonly GameEntry[];
  readonly playground: PlaygroundState;
}

export interface UseAppActionsOptions {
  readonly soundPlayerRef?: React.RefObject<SoundEffectPlayerHandle | null>;
  /** 本地存储（用于画廊/游戏历史持久化） */
  readonly storage?: SecureStorage;
  /** 资源创建后回调（图画/新游戏），供上层统一在聊天记录插入缩略图卡片 */
  readonly onResourceCreated?: (info: ResourceCreatedInfo) => void;
}

export interface UseAppActionsResult {
  readonly state: AppActionsState;
  readonly actions: AppActions;
}

/** 合法页面白名单（RN 侧二次校验，防止非法 target） */
const CHILD_SAFE_SCREENS: readonly ChildSafeScreen[] = [
  "pet_stage",
  "gallery",
  "chat_history",
  "pet_selection",
  "settings",
  "game_history",
  "system_logs",
];

export function useAppActions(options: UseAppActionsOptions = {}): UseAppActionsResult {
  /** overlay 导航栈：栈顶为当前页；空栈 = 已关闭 overlay */
  const [screenStack, setScreenStack] = useState<readonly ChildSafeScreen[]>([]);
  const [toast, setToast] = useState<ToastState>({ visible: false, text: "", style: "info" });
  const [galleryImages, setGalleryImages] = useState<readonly GalleryImage[]>([]);
  const [gameHistory, setGameHistory] = useState<readonly GameEntry[]>([]);
  const [playground, setPlayground] = useState<PlaygroundState>({ open: false, html: "", title: "" });
  const [dataHydrated, setDataHydrated] = useState(!options.storage);

  const currentScreen: ChildSafeScreen =
    screenStack.length > 0 ? screenStack[screenStack.length - 1]! : "pet_stage";
  const overlayOpen = screenStack.length > 0;

  /** 压入 overlay 页（与栈顶相同则忽略，避免重复） */
  const pushScreen = useCallback((target: ChildSafeScreen) => {
    setScreenStack((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === target) return prev;
      return [...prev, target];
    });
  }, []);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 回调用 ref 持有，避免因 options 变化导致 openGallery/openPlayground 重建。
  const onResourceCreatedRef = useRef(options.onResourceCreated);
  onResourceCreatedRef.current = options.onResourceCreated;
  // 列表的同步镜像：去重判断需在 setState 外同步得出「是否新增」，
  // 不能依赖 updater 内改闭包变量（React 不保证 updater 同步执行）。
  const galleryImagesRef = useRef<readonly GalleryImage[]>(galleryImages);
  galleryImagesRef.current = galleryImages;
  const gameHistoryRef = useRef<readonly GameEntry[]>(gameHistory);
  gameHistoryRef.current = gameHistory;

  /** 启动时从本地存储恢复画廊与游戏历史 */
  useEffect(() => {
    const storage = options.storage;
    if (!storage) return;
    let cancelled = false;
    void (async () => {
      try {
        const [images, games] = await Promise.all([
          loadGalleryImages(storage),
          loadGameHistory(storage),
        ]);
        if (cancelled) return;
        // 加载时清理已存在的重复条目（存量数据可能因旧版本无去重而积累重复）。
        setGalleryImages(dedupeGalleryImages(images));
        setGameHistory(dedupeGameHistory(games));
      } finally {
        if (!cancelled) setDataHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [options.storage]);

  /** 画廊/游戏变更后写入本地存储 */
  useEffect(() => {
    const storage = options.storage;
    if (!storage || !dataHydrated) return;
    void saveGalleryImages(storage, galleryImages);
  }, [options.storage, dataHydrated, galleryImages]);

  useEffect(() => {
    const storage = options.storage;
    if (!storage || !dataHydrated) return;
    void saveGameHistory(storage, gameHistory);
  }, [options.storage, dataHydrated, gameHistory]);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const navigate = useCallback(
    (target: ChildSafeScreen, _reason?: string) => {
      if (!CHILD_SAFE_SCREENS.includes(target)) {
        console.warn(`[useAppActions] 非法导航目标: ${target}`);
        return;
      }
      if (target === "pet_stage") {
        setScreenStack([]);
        return;
      }
      pushScreen(target);
    },
    [pushScreen],
  );

  const playSound = useCallback((sound: SoundName, volume = 0.8) => {
    const player = options.soundPlayerRef?.current;
    if (player) {
      player.play(sound, volume);
    } else {
      console.log(`[useAppActions] playSound sound=${sound} volume=${volume} (no player)`);
    }
  }, [options.soundPlayerRef]);

  const showToast = useCallback((text: string, style: ToastStyle = "info") => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ visible: true, text, style });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
  }, []);

  const openGallery = useCallback(
    (imageUrl: string, prompt?: string) => {
      // 按归一化提示词去重：Agent 可能对同一提示词返回不同 URL，避免「我的画」里堆相似的图。
      const key = normalizeKey(prompt ?? imageUrl);
      const isNew = !galleryImagesRef.current.some(
        (img) => normalizeKey(img.prompt ?? img.url) === key,
      );
      if (isNew) {
        setGalleryImages((prev) => [...prev, { url: imageUrl, prompt, createdAt: Date.now() }]);
        // 仅新图才插聊天缩略图卡片，重复图不再重复插卡。
        onResourceCreatedRef.current?.({ kind: "image", url: imageUrl, prompt });
      }
      pushScreen("gallery");
    },
    [pushScreen],
  );

  /** 清空栈，整页关闭 overlay */
  const closeOverlay = useCallback(() => {
    setScreenStack([]);
  }, []);

  /** 出栈一层；无上一页则关闭 overlay（回舞台） */
  const goBack = useCallback(() => {
    setScreenStack((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1)));
  }, []);

  const openPlayground = useCallback(
    (html: string, title: string, opts?: { existingId?: string; replaceId?: string }) => {
      const existingId = opts?.existingId;
      const replaceId = opts?.replaceId;
      if (replaceId) {
        // 编辑后就地替换同 id 条目（保持"允许多次编辑"），不新增、不再插卡片。
        setGameHistory((prev) =>
          prev.map((g) => (g.id === replaceId ? { ...g, title, html, createdAt: Date.now() } : g)),
        );
      } else if (!existingId) {
        // 新游戏：按归一化标题去重（同一主题 Agent 可能生成不同 HTML，避免堆相似游戏）。
        const key = normalizeKey(title);
        const isNew = !gameHistoryRef.current.some((g) => normalizeKey(g.title) === key);
        if (isNew) {
          const newId = `game-${Date.now()}`;
          setGameHistory((prev) => [...prev, { id: newId, title, html, createdAt: Date.now() }]);
          // 仅新游戏才插聊天缩略图卡片，重复游戏不再重复插卡。
          onResourceCreatedRef.current?.({ kind: "game", gameId: newId, title });
        }
      }
      setPlayground({ open: true, html, title });
    },
    [],
  );

  const closePlayground = useCallback(() => {
    setPlayground({ open: false, html: "", title: "" });
  }, []);

  const deleteImage = useCallback((index: number) => {
    setGalleryImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const deleteGame = useCallback((id: string) => {
    setGameHistory((prev) => prev.filter((g) => g.id !== id));
  }, []);

  return {
    state: {
      currentScreen,
      overlayOpen,
      toast,
      galleryImages,
      gameHistory,
      playground,
    },
    actions: {
      navigate,
      playSound,
      showToast,
      openGallery,
      openPlayground,
      closePlayground,
      closeOverlay,
      goBack,
      deleteImage,
      deleteGame,
    },
  };
}
