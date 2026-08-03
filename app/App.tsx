/**
 * 儿童 AI Live2D 宠物 App — 入口
 *
 * 挂载 Live2DView（WebView 内跑 pixi + pixi-live2d-display），经 pet-core
 * orchestrator 驱动表情/动作/口型。真实链路：文本输入 → useNodeHost.sendMessage →
 * nodejs-mobile Agent loop（Gateway streamFn）→ agent_delta/final →
 * agentEventMapper 翻译成 AgentSignal → orchestrator.sendSignal 驱动状态机。
 *
 * 布局：
 *  - 舞台占满绝大部分屏幕（stageRatio ~0.88），人物支持 pinch/按钮缩放。
 *  - 底部 HUD 改为悬浮面板（半透明毛玻璃背景），极简单行状态 + 输入/语音。
 *  - 右上角浮动缩放控制（+ / - / 重置）。
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  PanResponder,
  NativeModules,
  Keyboard,
  BackHandler,
  type GestureResponderEvent,
} from "react-native";
import { Live2DView } from "./src/pet/Live2DView";
import {
  AudioPlayerView,
  type AudioPlayerHandle,
} from "./src/pet/AudioPlayerView";
import { DuplexAudioPlayerView } from "./src/pet/DuplexAudioPlayerView";
import { usePetOrchestrator } from "./src/pet/usePetOrchestrator";
import { tapHintForZone } from "./src/pet/petOrchestrator";
import { useTapHintThrottle } from "./src/pet/useTapHintThrottle";
import { useNodeHost, DEFAULT_INIT } from "./src/node-host/useNodeHost";
import { mapMobileEventToAgentSignal } from "./src/features/pet/agentEventMapper";
import { useResponsiveLayout } from "./src/layout/useResponsiveLayout";
import { useSessionPersistence } from "./src/storage/useSessionPersistence";
import { usePaginatedHistory } from "./src/storage/usePaginatedHistory";
import { loadChildProfile, mergeChildProfile, saveChildProfile } from "./src/storage/childProfilePersistence";
import { loadPetName, savePetName } from "./src/storage/petNamePersistence";
import { SceneBackground, SCENES } from "./src/pet/SceneBackground";
import { loadSceneId, saveSceneId } from "./src/storage/scenePersistence";
import { kidsTheme as t } from "./src/theme/kidsTheme";
import {
  MinusIcon,
  PlusIcon,
  ResetIcon,
  SceneIcon,
  SettingsIcon,
} from "./src/components/KidsIcons";
import type { MessageRow } from "./node-runtime/src/memory/local-session-memory";
import { SharedPrefsStorage } from "./src/auth/secureStorage";
import { resolveDeviceId, type DeviceIdStore } from "./src/auth/deviceIdentity";
import type { ChildProfile, CreationMeta, ImageProviderConfig, MobileNodeEvent, ProviderConfig, SystemLogLineWire } from "./node-runtime/src/bridge/schema";
import { getPetModelConfig } from "./node-runtime/src/config/model-registry";
import { stripVirtualHumanTags, type PetState } from "@lumo/core";
import {
  loadProviderConfig,
  saveProviderConfig,
  clearProviderConfig,
} from "./src/storage/providerConfigPersistence";
import {
  loadImageProviderConfig,
  saveImageProviderConfig,
  clearImageProviderConfig,
} from "./src/storage/imageProviderConfigPersistence";

import { useSpeechRecognition } from "./src/voice/useSpeechRecognition";
import { useVoiceSession } from "./src/voice/useVoiceSession";
import { setSherpaVadHandlers } from "./src/voice/sherpaSpeechRecognition";
import { engineHasVad } from "./src/voice/asrEngine";
import { ChatHistory } from "./src/chat/ChatHistory";
import { encodeEventMessage, decodeEventMessage, toolLabelFor, EVENT_MESSAGE_ROLE, type ChatEventPayload } from "./src/chat/eventMessage";
import { ChatControls } from "./src/app/controls/ChatControls";
import { useTagParser } from "./src/pet/useTagParser";
import { useAppActions, type ChildSafeScreen, type GalleryImage, type GameEntry } from "./src/hooks/useAppActions";
import { useNodeEvents } from "./src/hooks/useNodeEvents";
import { Toast } from "./src/components/Toast";
import { TapEffect } from "./src/components/TapEffect";
import { SwipeToDismiss } from "./src/components/SwipeToDismiss";
import { ConfirmCard } from "./src/components/ConfirmCard";
import { EditInstructionModal } from "./src/components/EditInstructionModal";
import { BUILTIN_GAMES, type BuiltinGame } from "./src/games/builtinGames";
import { wrapPlaygroundHtml } from "./node-runtime/src/tools/playground-html";
import { SoundEffectPlayer, type SoundEffectPlayerHandle } from "./src/components/SoundEffectPlayer";
import { GalleryScreen } from "./src/app/screens/GalleryScreen";
import { ChatHistoryScreen } from "./src/app/screens/ChatHistoryScreen";
import { PetSelectionScreen } from "./src/app/screens/PetSelectionScreen";
import { SettingsScreen, DEFAULT_TTS_VOICE } from "./src/app/screens/SettingsScreen";
import { GameHistoryScreen } from "./src/app/screens/GameHistoryScreen";
import { SystemLogsScreen } from "./src/app/screens/SystemLogsScreen";
import { PlaygroundView } from "./src/components/PlaygroundView";
import type { ConversationMode } from "./src/conversation/useConversationMode";
import type { NodeAuth } from "./src/node-host/nodeBridge";

// dev 过渡的安全存储（SharedPreferences 持久化，重启不丢）
const devSecureStorage = new SharedPrefsStorage();

/** 从 SharedPrefs 读取/写入 deviceId */
const devDeviceIdStore: DeviceIdStore = {
  get: () => {
    const SharedPrefs = (NativeModules as Record<string, unknown>).SharedPrefs as
      | { getItem(key: string): Promise<string | null> }
      | undefined;
    return SharedPrefs?.getItem("kids.deviceId") ?? Promise.resolve(null);
  },
  set: (id) => {
    const SharedPrefs = (NativeModules as Record<string, unknown>).SharedPrefs as
      | { setItem(key: string, value: string): Promise<void> }
      | undefined;
    return SharedPrefs?.setItem("kids.deviceId", id) ?? Promise.resolve();
  },
};

/** 可用 Live2D 模型（model-registry 中定义） */
const AVAILABLE_MODEL_IDS = ["mao_pro", "ug_official", "xiaomai"] as const;

/** 缩放限制 */
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.2;

/** 模型拖拽边界（逻辑像素，相对屏幕中心） */
const DRAG_BOUNDS = { x: 120, y: 120 };

/**
 * 内存态聊天记录的滑动窗口上限。messages 每次用户输入/流式回复/事件卡片都会
 * append，若不裁剪则随会话无限增长（内存泄漏）。HUD 里 ChatHistory 只展示最近
 * 6 条，完整历史另由 SQLite 持久化，故内存里保留最近 N 条即可，超出的丢弃。
 */
const MAX_MESSAGES = 60;

/** 裁剪到最近 MAX_MESSAGES 条（仅在超限时创建新数组，避免无谓拷贝）。 */
function clampMessages(rows: readonly MessageRow[]): readonly MessageRow[] {
  return rows.length > MAX_MESSAGES ? rows.slice(-MAX_MESSAGES) : rows;
}

/** 主应用所需上下文（独立运行：本机 deviceId，无后端登录） */
interface MainAppProps {
  readonly deviceId: string;
}

/**
 * App 入口 — 独立运行，无认证门控：解析本机 deviceId 后直接挂载主舞台。
 * 模型提供商由设置页配置，凭据仅存本机、直连上游。
 */
function App(): React.JSX.Element {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    resolveDeviceId(devDeviceIdStore).then(setDeviceId).catch(() => {
      setDeviceId(`kids-${Date.now().toString(36)}`);
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#0B1018" />

      {!deviceId ? (
        <View style={styles.authLoading}>
          <Text style={styles.authLoadingText}>加载中…</Text>
        </View>
      ) : (
        <MainApp deviceId={deviceId} />
      )}
    </SafeAreaView>
  );
}

/** 主应用：Live2D、Node 宿主、语音、画廊等 */
function MainApp(props: MainAppProps): React.JSX.Element {
  const { deviceId } = props;
  const [modelIndex, setModelIndex] = useState(0);
  const currentModelId = AVAILABLE_MODEL_IDS[modelIndex];
  const currentModelConfig = getPetModelConfig(currentModelId);

  // 每角色有效名字映射（petId → 自定义名或内置默认名），供宠物选择页展示/改名。
  // 启动时并发加载全部角色的名字；ref 为 init 注入的同步真值源。
  const [petNames, setPetNames] = useState<Record<string, string>>({});
  const petNamesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    Promise.all(
      AVAILABLE_MODEL_IDS.map((id) => loadPetName(devSecureStorage, id).then((name) => [id, name] as const)),
    )
      .then((pairs) => {
        const map = Object.fromEntries(pairs);
        petNamesRef.current = map;
        setPetNames(map);
      })
      .catch(() => {});
  }, []);
  // 当前角色名字：已加载则用映射值，否则回退内置默认名（首帧/加载前）。
  const petName = petNames[currentModelId] ?? currentModelConfig.name;

  // 宠物选择页保存自定义名字：写入持久化并刷新映射（切模型或重开会话时生效）。
  const handleSavePetName = useCallback(async (petId: string, name: string) => {
    await savePetName(devSecureStorage, petId, name);
    const next = await loadPetName(devSecureStorage, petId);
    setPetNames((prev) => {
      const map = { ...prev, [petId]: next };
      petNamesRef.current = map;
      return map;
    });
  }, []);

  const { state, onRendererReady, dispatch, sendSignal, playExpression, playMotionByTag, handleTapHit } =
    usePetOrchestrator({
      emotionMap: currentModelConfig.emotionMap,
      actionMotions: currentModelConfig.actionMotions,
      tapMotions: currentModelConfig.tapMotions,
      defaultExpression: currentModelConfig.defaultExpression,
    });
  const [defaultPetId, setDefaultPetId] = useState<string | null>(null);
  useEffect(() => {
    const SharedPrefs = (NativeModules as Record<string, unknown>).SharedPrefs as
      | { getItem(key: string): Promise<string | null> }
      | undefined;
    SharedPrefs?.getItem("kids.defaultPetId").then((id) => {
      if (id && (AVAILABLE_MODEL_IDS as readonly string[]).includes(id)) {
        setModelIndex(AVAILABLE_MODEL_IDS.indexOf(id as typeof AVAILABLE_MODEL_IDS[number]));
        setDefaultPetId(id);
      } else {
        setDefaultPetId("mao_pro");
      }
    }).catch(() => setDefaultPetId("mao_pro"));
  }, []);

  const persistDefaultPet = useCallback((petId: string) => {
    setDefaultPetId(petId);
    const SharedPrefs = (NativeModules as Record<string, unknown>).SharedPrefs as
      | { setItem(key: string, value: string): Promise<void> }
      | undefined;
    SharedPrefs?.setItem("kids.defaultPetId", petId);
  }, []);

  // 小主人档案：启动从本地恢复；hydrate 完成前延后 Node init，避免空档案竞态。
  // childProfile state 供设置页「记忆」查看/修改；ref 与 state 始终同步。
  const childProfileRef = useRef<ChildProfile>({});
  const [childProfile, setChildProfile] = useState<ChildProfile>({});
  const profileHydratedRef = useRef(false);
  const [profileHydrated, setProfileHydrated] = useState(false);
  useEffect(() => {
    loadChildProfile(devSecureStorage)
      .then((p) => {
        childProfileRef.current = p;
        setChildProfile(p);
      })
      .catch(() => {})
      .finally(() => {
        profileHydratedRef.current = true;
        setProfileHydrated(true);
      });
  }, []);

  // TTS 音色：从 SharedPrefs 恢复，随 _auth 下发给 Node（切换后下次合成生效）。
  // ttsVoiceRef 为 getAuth 注入的同步真值源（state 更新异步，试听需立即拿到新音色）。
  const [ttsVoice, setTtsVoice] = useState<string>(DEFAULT_TTS_VOICE);
  const ttsVoiceRef = useRef<string>(DEFAULT_TTS_VOICE);
  useEffect(() => {
    const SharedPrefs = (NativeModules as Record<string, unknown>).SharedPrefs as
      | { getItem(key: string): Promise<string | null> }
      | undefined;
    SharedPrefs?.getItem("kids.ttsVoice").then((v) => {
      if (v) {
        ttsVoiceRef.current = v;
        setTtsVoice(v);
      }
    }).catch(() => {});
  }, []);

  // 模型提供商配置：从本机安全存储恢复；随 _auth 下发给 Node（切换后下次发送生效）。
  // providerConfigRef 为 getAuth 注入的同步真值源。state 供设置页展示当前配置。
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const providerConfigRef = useRef<ProviderConfig | null>(null);
  useEffect(() => {
    loadProviderConfig(devSecureStorage)
      .then((cfg) => {
        providerConfigRef.current = cfg;
        setProviderConfig(cfg);
      })
      .catch(() => {});
  }, []);

  // 生图提供商配置：同 providerConfig 语义，独立恢复 + 随 _auth 下发。
  const [imageProviderConfig, setImageProviderConfig] = useState<ImageProviderConfig | null>(null);
  const imageProviderConfigRef = useRef<ImageProviderConfig | null>(null);
  useEffect(() => {
    loadImageProviderConfig(devSecureStorage)
      .then((cfg) => {
        imageProviderConfigRef.current = cfg;
        setImageProviderConfig(cfg);
      })
      .catch(() => {});
  }, []);

  // getAuth 注入当前音色 + 模型/生图提供商：Node 侧收到 _auth 即切换。独立运行无登录 token，
  // 仅带 deviceId（本地会话记忆键）+ ttsVoice + providerConfig + imageProviderConfig（null=清除）。
  const getAuthWithVoice = useCallback(
    (): NodeAuth => ({
      deviceId,
      ttsVoice: ttsVoiceRef.current,
      providerConfig: providerConfigRef.current,
      imageProviderConfig: imageProviderConfigRef.current,
    }),
    [deviceId],
  );

  // Agent 推荐活动的确认卡片（confirm_request → 大图标卡）
  const [confirmCard, setConfirmCard] = useState<{ requestId: string; kind: "game" | "drawing"; title: string } | null>(null);
  // 当前正在执行的工具标签（做小游戏/画画/查资料…），用于宠物旁常驻忙碌提示；null=空闲
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  // "改一改"输入弹窗：记录待编辑的游戏
  const [editTarget, setEditTarget] = useState<{ gameId: string; title: string; html: string } | null>(null);
  // 系统日志（Node 侧 SystemLogBuffer，经 system_logs_result 事件回传）
  const [sysLogs, setSysLogs] = useState<readonly SystemLogLineWire[]>([]);
  const [sysLogTotal, setSysLogTotal] = useState(0);

  // 监听键盘高度：仅移动 HUD，不动模型舞台
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const audioPlayerRef = useRef<AudioPlayerHandle | null>(null);
  const soundEffectRef = useRef<SoundEffectPlayerHandle | null>(null);

  // 阶段二：探测硬件 AEC 可用性，决定 TTS 播放走原生 DuplexAudio（全双工）
  // 还是 WebView AudioPlayerView（半双工，兼容无 AEC 设备）。
  const [duplexEnabled, setDuplexEnabled] = useState(false);
  useEffect(() => {
    NativeModules.DuplexAudio?.isAecAvailable()
      .then((available: boolean) => {
        setDuplexEnabled(available);
      })
      .catch(() => {
        setDuplexEnabled(false);
      });
  }, []);
  const { nodeReady, sessionReady, lastEvent, sendMessage, speakText, speakGameText, abort, initSession, closePlayground, updateCreations, sendConfirm, editCreation, updateChildProfile, requestSystemLogs, clientLog } = useNodeHost({
    getAuth: getAuthWithVoice,
    // 自动 init 带上已恢复的小主人档案（ref 同步真值源）
    getInitPayload: () => ({
      ...DEFAULT_INIT,
      petId: currentModelId,
      petName: petNamesRef.current[currentModelId] ?? currentModelConfig.name,
      childProfile: childProfileRef.current,
    }),
    // 档案未 hydrate 时不自动 init，等下方 effect 补发
    shouldAutoInit: () => profileHydratedRef.current,
  });

  /** 构造当前宠物的 init 载荷（含最新小主人档案）。 */
  const buildInitPayload = useCallback(
    (profile: ChildProfile = childProfileRef.current) => ({
      ...DEFAULT_INIT,
      petId: currentModelId,
      petName: petNamesRef.current[currentModelId] ?? currentModelConfig.name,
      childProfile: profile,
    }),
    [currentModelId, currentModelConfig.name],
  );

  // 档案 hydrate 完成且 Node 已就绪、但尚未建会话时，补发 init（覆盖延后竞态）。
  // 仅首次：家长保存会主动 re-init 并短暂把 sessionReady 置 false，不可再触发本 effect。
  const everSessionReadyRef = useRef(false);
  useEffect(() => {
    if (sessionReady) everSessionReadyRef.current = true;
  }, [sessionReady]);
  useEffect(() => {
    if (!profileHydrated || !nodeReady || sessionReady) return;
    if (everSessionReadyRef.current) return;
    initSession(buildInitPayload());
  }, [profileHydrated, nodeReady, sessionReady, initSession, buildInitPayload]);

  // 家长在设置里手动覆盖档案：落盘 → 热更新当前会话 soul → 再 re-init 清对话上下文，避免旧聊天与新档案冲突。
  const handleSaveProfile = useCallback(
    async (next: ChildProfile) => {
      await saveChildProfile(devSecureStorage, next);
      childProfileRef.current = next;
      setChildProfile(next);
      // 先热推：即使 re-init 尚未完成，下一轮 prompt 也会带上新档案
      updateChildProfile(next);
      if (nodeReady) {
        initSession(buildInitPayload(next));
      }
    },
    [nodeReady, initSession, buildInitPayload, updateChildProfile],
  );

  // 保存/清除模型提供商：更新 ref（下次发送 _auth 立即带上）→ 持久化 → re-init 让 Node 换模型源。
  const handleSaveProviderConfig = useCallback(
    (next: ProviderConfig | null) => {
      providerConfigRef.current = next;
      setProviderConfig(next);
      if (next) {
        void saveProviderConfig(devSecureStorage, next);
      } else {
        void clearProviderConfig(devSecureStorage);
      }
      // re-init：让 Node 侧 config-provider 按新 providerConfig 切换 direct/gateway 模型源。
      if (nodeReady) {
        initSession(buildInitPayload());
      }
    },
    [nodeReady, initSession, buildInitPayload],
  );

  // 保存/清除生图提供商：更新 ref → 持久化 → re-init 让 Node 侧 tool context 重建拿到新配置。
  const handleSaveImageProviderConfig = useCallback(
    (next: ImageProviderConfig | null) => {
      imageProviderConfigRef.current = next;
      setImageProviderConfig(next);
      if (next) {
        void saveImageProviderConfig(devSecureStorage, next);
      } else {
        void clearImageProviderConfig(devSecureStorage);
      }
      if (nodeReady) {
        initSession(buildInitPayload());
      }
    },
    [nodeReady, initSession, buildInitPayload],
  );

  // 选新音色：先同步更新 ref（试听命令的 _auth 立即带上新音色）→ 持久化 → 试听一句
  const persistVoice = useCallback((voice: string) => {
    ttsVoiceRef.current = voice;
    setTtsVoice(voice);
    const SharedPrefs = (NativeModules as Record<string, unknown>).SharedPrefs as
      | { setItem(key: string, value: string): Promise<void> }
      | undefined;
    SharedPrefs?.setItem("kids.ttsVoice", voice);
    speakText("你好呀，我是你的好朋友，很高兴认识你～");
  }, [speakText]);
  // 资源创建（图画/新游戏）统一插入聊天缩略图卡片；用 ref 转发避免与 appendEventMessage 定义顺序耦合。
  const appendEventMessageRef = useRef<((payload: ChatEventPayload) => void) | null>(null);
  // 事件卡片落库转发：内存卡片仅实时展示，持久化后设置页聊天记录才能回看工具调用/图画/游戏。
  const recordEventMessageRef = useRef<((content: string) => void) | null>(null);
  const { state: appState, actions: appActions } = useAppActions({
    soundPlayerRef: soundEffectRef,
    storage: devSecureStorage,
    onResourceCreated: (info) => {
      if (info.kind === "image") {
        appendEventMessageRef.current?.({ kind: "image_ready", prompt: info.prompt, url: info.url });
      } else {
        appendEventMessageRef.current?.({ kind: "playground_open", title: info.title, gameId: info.gameId });
      }
    },
  });
  useNodeEvents(lastEvent, appActions);
  const lastInitSigRef = useRef<string | null>(null);

  /** 游戏/互动页面消息路由：learn_char / speak 请求走系统 TTS 朗读。 */
  const handlePlaygroundMessage = useCallback(
    (type: string, data: unknown) => {
      if (type === "speak" || type === "learn_char") {
        const d = data as { text?: unknown; char?: unknown; word?: unknown; pinyin?: unknown };
        // 优先 text；learn_char 兼容 char/word 拼接（读汉字，可带组词）。
        const text =
          typeof d?.text === "string"
            ? d.text
            : [d?.char, d?.word].filter((x) => typeof x === "string").join("，");
        if (text) speakGameText(text);
      }
    },
    [speakGameText],
  );

  /** 关闭 playground（同时通知 Node 侧），供返回键/右滑/关闭按钮复用 */
  const handleClosePlayground = useCallback(
    (reason: "user" | "timeout") => {
      appActions.closePlayground();
      closePlayground(reason);
    },
    [appActions, closePlayground],
  );

  // Android 硬件返回键：优先关 playground，其次关 overlay，都没有才放行默认（退出 App）。
  // 避免"返回即退出"，实现返回上一级。
  const overlayOpen = appState.overlayOpen;
  const playgroundOpen = appState.playground.open;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (playgroundOpen) {
        handleClosePlayground("user");
        return true;
      }
      if (overlayOpen) {
        appActions.closeOverlay();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [playgroundOpen, overlayOpen, handleClosePlayground, appActions]);

  // 同步"已有创作"元信息给 Agent（复用感知）：画/游戏变化时去抖推送，会话就绪后首次也推。
  const galleryImages = appState.galleryImages;
  const gameHistory = appState.gameHistory;
  useEffect(() => {
    if (!sessionReady) return;
    const timer = setTimeout(() => {
      const creations: CreationMeta[] = [
        ...galleryImages.map((img, i) => ({
          kind: "image" as const,
          id: `img-${img.createdAt}-${i}`,
          title: img.prompt ?? "一张画",
          ...(img.prompt ? { prompt: img.prompt } : {}),
        })),
        ...gameHistory.map((g) => ({ kind: "game" as const, id: g.id, title: g.title })),
      ];
      updateCreations(creations);
    }, 500);
    return () => clearTimeout(timer);
  }, [sessionReady, galleryImages, gameHistory, updateCreations]);

  // 切换模型或改名后重新初始化 Node 会话，让提示词/动作映射随模型/名字更新。
  // 首次会话由 useNodeHost 的 node_ready 自动 init 建立（sig 记为已建），此处只处理后续变更；
  // petName 异步加载完成后 sig 变化会补发一次 init，确保自定义名字生效。
  useEffect(() => {
    if (!nodeReady || !sessionReady) return;
    const sig = `${currentModelId}::${petName}`;
    if (lastInitSigRef.current === null) {
      lastInitSigRef.current = sig;
      return;
    }
    if (sig === lastInitSigRef.current) return;
    lastInitSigRef.current = sig;
    initSession({
      ...DEFAULT_INIT,
      petId: currentModelId,
      petName: petName,
      childProfile: childProfileRef.current,
    });
  }, [nodeReady, sessionReady, currentModelId, petName, initSession]);
  const { metrics, width, height } = useResponsiveLayout();
  const isLandscape = width > height;
  const { history, recordUserMessage, recordAssistantFinal, recordEventMessage } =
    useSessionPersistence({
      sessionKey: DEFAULT_INIT.sessionKey,
      petId: DEFAULT_INIT.petId,
    });
  const [input, setInput] = useState("");
  /** 内存态聊天记录（支持实时流式展示） */
  const [messages, setMessages] = useState<readonly MessageRow[]>([]);
  // 控制坞聊天记录：持久化分页（默认 20/页，下拉加载更早）+ 内存实时尾巴（流式回复/事件卡片）
  const {
    visible: dockHistory,
    hasMore: dockHasMore,
    loadOlder: dockLoadOlder,
  } = usePaginatedHistory({ sessionKey: DEFAULT_INIT.sessionKey, live: messages });
  const streamingIdRef = useRef<number | null>(null);
  const lastHandledRef = useRef<MobileNodeEvent | null>(null);

  // 标签解析器：从 Agent 流中提取 [emotion] / [motion:tag] 并驱动模型
  const tagParser = useTagParser({
    emotionMap: currentModelConfig.emotionMap,
    onExpression: (index) => playExpression(index),
    onMotion: (tag) => playMotionByTag(tag),
  });

  // 历史回填：仅首次加载，避免 DB 刷新与内存态重复；旧记录可能含表情/动作标签，一并剥离
  useEffect(() => {
    if (history.length === 0 || messages.length > 0) return;
    setMessages(
      clampMessages(
        history.map((row) => ({
          ...row,
          content: stripVirtualHumanTags(row.content),
        })),
      ),
    );
  }, [history, messages.length]);

  /** 追加一条完整消息（用户输入 / 语音识别定稿） */
  const appendUserMessage = useCallback((text: string) => {
    const row: MessageRow = {
      id: Date.now(),
      sessionId: DEFAULT_INIT.sessionKey,
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => clampMessages([...prev, row]));
  }, []);

  /** 开启一条空的流式 assistant 消息 */
  const beginAssistantStream = useCallback(() => {
    tagParser.reset();
    const id = Date.now();
    streamingIdRef.current = id;
    setMessages((prev) => {
      const trimmed = prev.filter((m) => m.role !== "assistant" || m.content.trim().length > 0);
      return clampMessages([...trimmed, { id, sessionId: DEFAULT_INIT.sessionKey, role: "assistant", content: "", createdAt: Date.now() }]);
    });
  }, [tagParser]);

  /** 把 delta 累加到当前流式 assistant 消息 */
  const appendAssistantDelta = useCallback((delta: string) => {
    const id = streamingIdRef.current;
    if (!id) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    );
  }, []);

  /** 流式结束：用完整文本兜底 */
  const finalizeAssistantStream = useCallback((fullText: string) => {
    const id = streamingIdRef.current;
    if (!id || !fullText) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: fullText } : m)),
    );
    streamingIdRef.current = null;
  }, []);

  /** 追加一条系统事件卡片（画画完成 / 游戏生成 / 工具过程），供聊天记录内联展示 */
  const appendEventMessage = useCallback((payload: ChatEventPayload) => {
    const content = encodeEventMessage(payload);
    const row: MessageRow = {
      id: Date.now(),
      sessionId: DEFAULT_INIT.sessionKey,
      role: EVENT_MESSAGE_ROLE,
      content,
      createdAt: Date.now(),
    };
    setMessages((prev) => clampMessages([...prev, row]));
    // 图画/游戏卡片是终态，直接落库供设置页回看。
    recordEventMessageRef.current?.(content);
  }, []);

  /**
   * 工具调用卡片：按 toolCallId 合并 start→done（对齐 Windows ToolCall 状态机）；
   * 无 id 时退化为追加独立消息。
   */
  const upsertToolActivity = useCallback((payload: Extract<ChatEventPayload, { kind: "tool_activity" }>) => {
    setMessages((prev) => {
      if (payload.toolCallId) {
        const idx = prev.findIndex((m) => {
          if (m.role !== EVENT_MESSAGE_ROLE) return false;
          const decoded = decodeEventMessage(m.content);
          return decoded?.kind === "tool_activity" && decoded.toolCallId === payload.toolCallId;
        });
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx]!, content: encodeEventMessage(payload) };
          return clampMessages(next);
        }
      }
      const row: MessageRow = {
        id: Date.now(),
        sessionId: DEFAULT_INIT.sessionKey,
        role: EVENT_MESSAGE_ROLE,
        content: encodeEventMessage(payload),
        createdAt: Date.now(),
      };
      return clampMessages([...prev, row]);
    });
    // 仅在终态(done)落库：start/done 在内存合并为一张卡片，持久化只写一次终态，
    // 避免 JSONL 里同一工具调用留下两条记录。
    if (payload.status === "done") {
      recordEventMessageRef.current?.(encodeEventMessage(payload));
    }
  }, []);
  // 供 useAppActions.onResourceCreated 回调转发（图画/新游戏缩略图卡片）
  appendEventMessageRef.current = appendEventMessage;
  recordEventMessageRef.current = recordEventMessage;

  const {
    listening,
    result: speechResult,
    partialResult: speechPartialResult,
    error: speechError,
    available: sttAvailable,
    start: startSpeech,
    stop: stopSpeech,
    clear: clearSpeech,
  } = useSpeechRecognition();

  // 连续对话 / 打断：统一由 VoiceSession 编排（Phase 1）
  const petVisible = !appState.overlayOpen && !appState.playground.open;
  const stopTts = useCallback(() => {
    audioPlayerRef.current?.stop();
  }, []);
  const {
    mode: conversationMode,
    enterPhoneCall,
    exitPhoneCall,
    toggleMic,
    micMuted,
    handleInterrupt,
    onAudioEvent,
    handleSpeechResult,
    handleSpeechPartial,
    handleVadSpeechStart,
    handleVadSpeechEnd,
    handleMicLevel,
    handleTextSend,
    sendHintMessage,
    shouldPlayTts,
    setLastTtsText,
    handleTurnEndedWithoutAudio,
  } = useVoiceSession({
    petVisible,
    petState: state,
    sessionReady,
    startSpeech,
    stopSpeech,
    clearSpeech,
    abort,
    stopTts,
    dispatch,
    sendMessage,
    appendUserMessage,
    recordUserMessage,
    onModeChange: (next, prev) => {
      if (next === "phone_call" && prev === "normal") {
        soundEffectRef.current?.play("call_start");
      } else if (next === "normal" && prev === "phone_call") {
        soundEffectRef.current?.play("call_end");
      }
    },
    duplexEnabled,
    clientLog,
  });

  // 点击提示防抖+冷却：只节流「发给 AI 的隐式提示」，本地表情/涟漪反馈仍即时触发。
  // 避免小朋友快速连点导致 Agent 洪泛回复、TTS 跟不上而大量静音。
  const pushTapHint = useTapHintThrottle({ send: sendHintMessage });

  // 宠物缩放状态（默认 100%，居中显示；家长可捏合/按钮调整）
  const [petScale, setPetScale] = useState(1.0);
  // 模型位置偏移（长按拖动）
  const [modelOffset, setModelOffset] = useState({ x: 0, y: 0 });
  // 横竖屏切换时清零拖动偏移，让模型回到舞台中心（避免旧偏移把模型顶到屏幕边缘）。
  useEffect(() => {
    setModelOffset({ x: 0, y: 0 });
  }, [isLandscape]);

  // 场景背景选择（持久化到安全存储；切换按钮循环切换）。
  const [sceneIndex, setSceneIndex] = useState(0);
  const currentScene = SCENES[sceneIndex];
  useEffect(() => {
    void loadSceneId(devSecureStorage).then((id) => {
      if (!id) return;
      const idx = SCENES.findIndex((s) => s.id === id);
      if (idx >= 0) setSceneIndex(idx);
    });
  }, []);
  const cycleScene = useCallback(() => {
    setSceneIndex((i) => {
      const next = (i + 1) % SCENES.length;
      void saveSceneId(devSecureStorage, SCENES[next].id);
      return next;
    });
  }, []);
  // 键盘高度（Android 用 adjustNothing，手动让 HUD 上移，模型舞台保持不动）
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const hudAnim = useRef(new Animated.Value(1)).current;
  const [tapEffect, setTapEffect] = useState({ x: 0, y: 0, trigger: 0 });

  const toggleHud = useCallback(() => {
    const toValue = hudCollapsed ? 1 : 0;
    setHudCollapsed(!hudCollapsed);
    Animated.timing(hudAnim, { toValue, duration: 200, useNativeDriver: false }).start();
  }, [hudCollapsed, hudAnim]);

  // 捏合缩放（双指）
  const pinchRef = useRef({ initialScale: 1, initialDistance: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.numberActiveTouches === 2,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          pinchRef.current.initialDistance = Math.sqrt(dx * dx + dy * dy);
          pinchRef.current.initialScale = petScale;
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const ratio = distance / (pinchRef.current.initialDistance || 1);
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.initialScale * ratio));
          setPetScale(next);
        }
      },
    }),
  ).current;

  // 原生 TTS 已移除 —— 统一走 Edge TTS（nodejs-mobile 内 msedge-tts 合成，
  // 通过 bridge 发送 tts_audio 事件，AudioPlayerView 播放 base64 mp3）。

  // Node 事件 → AgentSignal → 驱动宠物状态机（每个新事件仅处理一次）。
  // agent_delta / agent_final 同步更新内存态聊天记录；tts_audio 经 generationId 门控后播放。
  useEffect(() => {
    if (!lastEvent || lastEvent === lastHandledRef.current) return;
    lastHandledRef.current = lastEvent;
    const signal = mapMobileEventToAgentSignal(lastEvent);
    if (signal.kind !== "noop") sendSignal(signal);
    if (lastEvent.type === "agent_delta") {
      const cleanDelta = tagParser.feed(lastEvent.payload.text);
      if (!streamingIdRef.current) beginAssistantStream();
      appendAssistantDelta(cleanDelta);
    }
    if (lastEvent.type === "agent_final") {
      // 必须走 tagParser.feed 而非 stripVirtualHumanTags：final payload 可能包含
      // 尚未在 delta 阶段出现过的标签（例如整段一次性返回），直接 strip 会丢弃
      // 表情/动作触发，导致模型上不出现任何反应。
      const cleanText = tagParser.feed(lastEvent.payload.text);
      finalizeAssistantStream(cleanText);
      recordAssistantFinal(cleanText);
      // 回合结束兜底清忙碌提示（防 tool_finished 丢失导致 pill 卡住）
      setActiveToolLabel(null);
      // Phase 4 lite：供播放期回声文本过滤
      setLastTtsText(cleanText);
    }
    if (lastEvent.type === "tts_audio") {
      console.log(`[App] tts_audio gen=${lastEvent.payload.generationId}`);
      if (!shouldPlayTts(lastEvent.payload.generationId)) {
        console.log(
          `[App] 丢弃过期音频 gen=${lastEvent.payload.generationId}`,
        );
        // 音频被丢弃→无 play_end 事件，phone_call 下兜底重开麦，避免连续对话卡死。
        handleTurnEndedWithoutAudio();
        return;
      }
      console.log(`[App] 播放 TTS 音频`);
      // tts_audio 到达即视为音频就绪,立即驱动状态机进入 speaking;
      // 避免 WebView play_start 回调丢失导致一直卡在 tts_converting。
      dispatch({ type: "TTS_READY" });
      audioPlayerRef.current?.play(lastEvent.payload.audioBase64, lastEvent.payload.mimeType);
    }
    if (lastEvent.type === "game_tts_audio") {
      // 游戏/互动页面朗读：直接播放，不过 shouldPlayTts 门控、不驱动宠物状态机
      // （游戏全屏时不该让宠物进入 speaking 态）。
      console.log(`[App] 播放游戏 TTS 音频 req=${lastEvent.payload.requestId ?? "-"}`);
      audioPlayerRef.current?.play(lastEvent.payload.audioBase64, lastEvent.payload.mimeType);
    }
    // image_ready / playground_open 的缩略图卡片改由 useAppActions.onResourceCreated
    // 统一插入（openGallery/openPlayground 触发），此处不再重复 append，避免竞态与重复。
    // 工具调用过程 → 显示具体工具名 + 开始/结束状态（按 toolCallId 合并）
    if (lastEvent.type === "tool_started") {
      const label = toolLabelFor(lastEvent.payload.toolName);
      setActiveToolLabel(label);
      upsertToolActivity({
        kind: "tool_activity",
        toolName: lastEvent.payload.toolName,
        toolLabel: label,
        status: "start",
        toolCallId: lastEvent.payload.toolCallId,
        ...(lastEvent.payload.paramsSummary ? { paramsSummary: lastEvent.payload.paramsSummary } : {}),
      });
    }
    if (lastEvent.type === "tool_finished") {
      setActiveToolLabel(null);
      upsertToolActivity({
        kind: "tool_activity",
        toolName: lastEvent.payload.toolName,
        toolLabel: toolLabelFor(lastEvent.payload.toolName),
        status: "done",
        ok: lastEvent.payload.ok,
        toolCallId: lastEvent.payload.toolCallId,
        ...(lastEvent.payload.resultSummary ? { resultSummary: lastEvent.payload.resultSummary } : {}),
      });
    }
    // Agent 请求按 id 打开已有游戏：内置库需包 CSP 沙箱，历史作品 html 已包过。
    if (lastEvent.type === "open_creation") {
      const { id } = lastEvent.payload;
      const builtin = BUILTIN_GAMES.find((g) => g.id === id);
      if (builtin) {
        appActions.openPlayground(wrapPlaygroundHtml(builtin.html), builtin.title, { existingId: id });
      } else {
        const history = appState.gameHistory.find((g) => g.id === id);
        if (history) {
          appActions.openPlayground(history.html, history.title, { existingId: id });
        } else {
          console.warn(`[App] open_creation 未找到 id=${id}`);
        }
      }
    }
    if (lastEvent.type === "confirm_request") {
      setConfirmCard({
        requestId: lastEvent.payload.requestId,
        kind: lastEvent.payload.kind,
        title: lastEvent.payload.title,
      });
    }
    if (lastEvent.type === "profile_update") {
      // AI 对话中收集到的小主人信息 → 合并进本地档案并热推 Node soul，避免长会话中途档案落盘但提示词未更新。
      mergeChildProfile(devSecureStorage, lastEvent.payload.patch)
        .then((merged) => {
          childProfileRef.current = merged;
          setChildProfile(merged);
          updateChildProfile(merged);
        })
        .catch(() => {});
    }
    // TTS 合成失败：给孩子/家长一个可见提示（此前只静默重开麦，表现为"没声音"）。
    if (lastEvent.type === "tts_failed") {
      const detail = lastEvent.payload.message ? `（${lastEvent.payload.message}）` : "";
      appActions.showToast(`声音没出来，再说一次试试~${detail}`, "hint");
    }
    // 系统日志回传（设置页「系统日志」请求的响应）
    if (lastEvent.type === "system_logs_result") {
      setSysLogs(lastEvent.payload.logs);
      setSysLogTotal(lastEvent.payload.logTotalCount);
    }
    // 本轮不会再产出音频的结束事件：phone_call 下兜底重开麦克风，防止连续对话卡死。
    // （tts_failed/agent_error/safety_blocked 都不会走 onTtsPlayEnd，否则麦永不重开）
    if (
      lastEvent.type === "tts_failed" ||
      lastEvent.type === "agent_error" ||
      lastEvent.type === "safety_blocked"
    ) {
      handleTurnEndedWithoutAudio();
    }
  }, [
    lastEvent,
    sendSignal,
    recordAssistantFinal,
    beginAssistantStream,
    appendAssistantDelta,
    finalizeAssistantStream,
    shouldPlayTts,
    setLastTtsText,
    tagParser,
    appendEventMessage,
    upsertToolActivity,
    handleTurnEndedWithoutAudio,
    appActions,
    updateChildProfile,
    appState.gameHistory,
  ]);

  // STT 结果 → VoiceSession 按 mode 路由（唤醒 / 打断 / 发消息）
  useEffect(() => {
    if (!speechResult) return;
    handleSpeechResult(speechResult.text);
  }, [speechResult, handleSpeechResult]);

  // STT partial 结果 → VoiceSession 软 barge-in 提前打断
  useEffect(() => {
    if (!speechPartialResult) return;
    handleSpeechPartial(speechPartialResult.text);
  }, [speechPartialResult, handleSpeechPartial]);

  // sherpa VAD 声学端点 → VoiceSession（barge-in 长度门控）。仅 sherpa 引擎提供。
  useEffect(() => {
    if (!engineHasVad()) return;
    setSherpaVadHandlers({
      onVadSpeechStart: handleVadSpeechStart,
      onVadSpeechEnd: handleVadSpeechEnd,
      onMicLevel: handleMicLevel,
    });
  }, [handleVadSpeechStart, handleVadSpeechEnd, handleMicLevel]);

  // STT 错误 → 日志 + 清状态（状态机保持 idle，不卡界面）。
  useEffect(() => {
    if (!speechError) return;
    console.warn("[STT]", speechError.code, speechError.message);
    clearSpeech();
  }, [speechError, clearSpeech]);

  const onSend = () => {
    if (!handleTextSend(input)) return;
    setInput("");
    // adjustNothing 下 keyboardDidHide 触发不稳，发送后主动收键盘并兜底复位，避免 HUD 卡在键盘高度下不来。
    Keyboard.dismiss();
    setKeyboardHeight(0);
  };

  const { hudPaddingH, fontScale } = metrics;
  const fs = (base: number) => Math.round(base * fontScale);
  const controlsEnabled = sessionReady && sttAvailable !== false;

  const statusLabel = useCallback((mode: ConversationMode, petState: PetState) => {
    if (mode === "phone_call") return `通话中${petState === "listening" ? " · 聆听中" : ""}`;
    return petState;
  }, []);

  // 忙碌提示：工具运行中优先显示具体动作（做小游戏…/画画…），否则按状态机给一句人话。
  // 常驻宠物上方，即使聊天坞收起也可见，避免"半天没反应以为坏了"。
  const busyLabel = activeToolLabel
    ? `${activeToolLabel}…`
    : state === "thinking"
      ? "思考中…"
      : state === "tts_converting"
        ? "准备说话…"
        : null;

  // [RENDER-DEBUG] 无限渲染排查：统计渲染次数 + 每帧哪些追踪值引用变了。
  // 短窗内渲染暴涨即命中循环，变化列表指出触发源。排查完删除。
  const renderCountRef = useRef(0);
  const renderWindowRef = useRef({ at: Date.now(), count: 0 });
  const prevTrackedRef = useRef<Record<string, unknown>>({});
  {
    renderCountRef.current += 1;
    const tracked: Record<string, unknown> = {
      lastEvent, messages, appState, appActions, state, input, activeToolLabel,
      confirmCard, editTarget, keyboardHeight, duplexEnabled, dockHistory,
      childProfile, providerConfig, imageProviderConfig, sysLogs, metrics,
      tagParser, gameHistory: appState.gameHistory, galleryImages: appState.galleryImages,
    };
    const changed: string[] = [];
    for (const k of Object.keys(tracked)) {
      if (prevTrackedRef.current[k] !== tracked[k]) changed.push(k);
    }
    prevTrackedRef.current = tracked;
    const w = renderWindowRef.current;
    w.count += 1;
    const dt = Date.now() - w.at;
    if (dt >= 1000) {
      const msg = `[RENDER-DEBUG] ${w.count} renders/${dt}ms total=${renderCountRef.current} changed=[${changed.join(",")}]`;
      console.log(msg);
      clientLog(msg);
      w.at = Date.now();
      w.count = 0;
    } else if (renderCountRef.current <= 30 || renderCountRef.current % 20 === 0) {
      console.log(`[RENDER-DEBUG] #${renderCountRef.current} changed=[${changed.join(",")}]`);
    }
  }

  return (
    <>
      {duplexEnabled ? (
        <DuplexAudioPlayerView ref={audioPlayerRef} onEvent={onAudioEvent} />
      ) : (
        <AudioPlayerView ref={audioPlayerRef} onEvent={onAudioEvent} />
      )}
      <SoundEffectPlayer ref={soundEffectRef} />

      {/* 场景背景（Live2D WebView 透明，叠在此层之上；百分比定位适配横竖屏） */}
      <SceneBackground sceneId={currentScene.id} />

      {/* 主舞台（HUD 绝对浮动在上方，舞台占满安全区） */}
      <View
        style={styles.stage}
        pointerEvents={playgroundOpen || overlayOpen ? "none" : "auto"}
        {...panResponder.panHandlers}
      >
        <Live2DView
          key={currentModelId}
          onRendererReady={onRendererReady}
          scale={petScale}
          modelPath={currentModelConfig.modelPath}
          offsetX={modelOffset.x}
          offsetY={modelOffset.y}
          viewportTick={width}
          onTapHit={(area, x, y) => {
            // 表情/动作本地即时触发（点了立刻有反应）
            handleTapHit(area);
            setTapEffect((prev) => ({ x, y, trigger: prev.trigger + 1 }));
            // 说的话交给 AI 即兴生成：把触摸动作当隐式提示发给 Agent（防抖+冷却，不落聊天记录）
            pushTapHint(tapHintForZone(area));
          }}
          onDragMove={(dx, dy) => {
            setModelOffset((prev) => ({
              x: Math.max(-DRAG_BOUNDS.x, Math.min(DRAG_BOUNDS.x, prev.x + dx)),
              y: Math.max(-DRAG_BOUNDS.y, Math.min(DRAG_BOUNDS.y, prev.y + dy)),
            }));
          }}
        />
      </View>

      {/* 右上角浮动控制：缩放 + 模型切换 + 设置（游戏页打开时隐藏，否则 Android 高 elevation 会截走游戏页触摸） */}
      {!playgroundOpen && (
      <View style={[styles.floatZoom, isLandscape && styles.floatZoomLandscape]}>
        <FloatBtn onPress={() => setPetScale((s) => Math.max(MIN_SCALE, +(s - 0.1).toFixed(2)))}>
          <MinusIcon size={14} color={t.colors.ink} />
        </FloatBtn>
        <Text style={styles.zoomText}>{Math.round(petScale * 100)}%</Text>
        <FloatBtn onPress={() => setPetScale((s) => Math.min(MAX_SCALE, +(s + 0.1).toFixed(2)))}>
          <PlusIcon size={14} color={t.colors.ink} />
        </FloatBtn>
        <FloatBtn
          onPress={() => {
            setPetScale(1.0);
            setModelOffset({ x: 0, y: 0 });
          }}
        >
          <ResetIcon size={14} color={t.colors.ink} />
        </FloatBtn>
        <TouchableOpacity
          style={styles.modelBtn}
          onPress={() => setModelIndex((i) => (i + 1) % AVAILABLE_MODEL_IDS.length)}
          activeOpacity={0.7}
        >
          <Text style={styles.modelBtnText}>{currentModelConfig.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sceneBtn} onPress={cycleScene} activeOpacity={0.7}>
          <SceneIcon size={14} color={t.colors.ink} />
          <Text style={styles.sceneBtnText}>{currentScene.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => appActions.navigate("settings")}
          activeOpacity={0.7}
        >
          <SettingsIcon size={16} color={t.colors.ink} />
        </TouchableOpacity>
      </View>
      )}

      {/* 忙碌状态胶囊：始终可见（即使聊天坞收起），让孩子知道宠物在思考/做游戏/画画 */}
      {petVisible && busyLabel && (
        <View style={[styles.busyPill, isLandscape && styles.busyPillLandscape]} pointerEvents="none">
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={[styles.busyPillText, { fontSize: fs(13) }]} numberOfLines={1}>
            {busyLabel}
          </Text>
        </View>
      )}

      {/* 底部悬浮控制面板（overlay/设置页/游戏页打开时隐藏：既无意义又会遮挡触摸） */}
      {!overlayOpen && !playgroundOpen && (
      <View
        style={[
          styles.hud,
          isLandscape && styles.hudLandscape,
          {
            paddingHorizontal: hudPaddingH,
            bottom: 6 + keyboardHeight,
          },
        ]}
      >
        {/* 收起/展开 tab */}
        <TouchableOpacity style={styles.hudToggle} onPress={toggleHud} activeOpacity={0.7}>
          <Text style={styles.hudToggleText}>{hudCollapsed ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {/* 可折叠内容区（横屏限高到半屏，避免面板过高） */}
        <Animated.View
          style={{
            opacity: hudAnim,
            maxHeight: hudAnim.interpolate({
              inputRange: [0, 1],
              /* 横屏放宽外层上限到 0.9 屏，只让聊天记录自身限高，状态条+输入框始终可见 */
              outputRange: [0, isLandscape ? Math.round(height * 0.9) : 500],
            }),
            overflow: "hidden",
          }}
          pointerEvents={hudCollapsed ? "none" : "auto"}
        >
          {/* 聊天记录（默认 20 条，下拉加载更早，持久化分页） */}
          <ChatHistory
            messages={dockHistory}
            hasMore={dockHasMore}
            onLoadOlder={dockLoadOlder}
            fontScale={fs}
            onNavigate={appActions.navigate}
            images={appState.galleryImages}
            games={appState.gameHistory}
            onReplayGame={(game) => appActions.openPlayground(game.html, game.title, { existingId: game.id })}
            maxHeight={isLandscape ? Math.round(height * 0.42) : undefined}
          />

          {/* 极简状态条 */}
          <View style={styles.statusBar}>
            <View
              style={[
                styles.statusDot,
                conversationMode === "phone_call" && { backgroundColor: "#00F0FF" },
                state === "idle" && conversationMode === "normal" && { backgroundColor: "#4ADE80" },
              ]}
            />
            <Text style={[styles.statusText, { fontSize: fs(11) }]} numberOfLines={1}>
              {statusLabel(conversationMode, state)}
              {nodeReady ? "" : " · 启动中"}
              {!sessionReady && nodeReady ? " · 连接中" : ""}
              {!providerConfig ? " · 未配置模型" : ""}
            </Text>
          </View>

          {/* 儿童友好控制面板：打字 / 打电话 / 按住说话 */}
          <ChatControls
            mode={conversationMode}
            petState={state}
            input={input}
            onChangeInput={setInput}
            onSend={onSend}
            onEnterPhoneCall={enterPhoneCall}
            onExitPhoneCall={exitPhoneCall}
            onToggleMic={toggleMic}
            micMuted={micMuted}
            onInterrupt={handleInterrupt}
            enabled={controlsEnabled}
            sessionReady={sessionReady}
            sttAvailable={sttAvailable}
            placeholder={sessionReady ? "和宠物说点什么…" : "会话建立中…"}
            fontSize={fs}
          />
        </Animated.View>
      </View>
      )}

      {/* 点击宠物粒子特效 */}
      <TapEffect x={tapEffect.x} y={tapEffect.y} trigger={tapEffect.trigger} />

      {/* 全局 Toast */}
      <Toast visible={appState.toast.visible} text={appState.toast.text} style={appState.toast.style} />

      {/* Agent 控制的小游戏/互动页面（全屏，优先级高于 overlay） */}
      {appState.playground.open && (() => {
        // 仅"我玩过的"用户游戏可编辑（按 html 匹配历史条目）；内置游戏不在历史中，不显示改一改。
        const currentGame = appState.gameHistory.find((g) => g.html === appState.playground.html);
        return (
          <SwipeToDismiss style={styles.playground} onDismiss={() => handleClosePlayground("user")}>
            <PlaygroundView
              html={appState.playground.html}
              title={appState.playground.title}
              onClose={(reason) => handleClosePlayground(reason)}
              onMessage={handlePlaygroundMessage}
              onEdit={
                currentGame
                  ? () => {
                      handleClosePlayground("user");
                      setEditTarget({ gameId: currentGame.id, title: currentGame.title, html: currentGame.html });
                    }
                  : undefined
              }
            />
          </SwipeToDismiss>
        );
      })()}

      {/* Agent 控制的页面 overlay（gallery / chat_history / pet_selection） */}
      {appState.overlayOpen && (
        <SwipeToDismiss style={styles.overlay} onDismiss={appActions.closeOverlay}>
          <SafeAreaView style={styles.overlaySafe}>
          <AppOverlay
            screen={appState.currentScreen}
            images={appState.galleryImages}
            games={appState.gameHistory}
            currentModelId={currentModelId}
            defaultPetId={defaultPetId ?? "mao_pro"}
            selectedVoice={ttsVoice}
            onVoiceChange={persistVoice}
            childProfile={childProfile}
            onSaveProfile={handleSaveProfile}
            providerConfig={providerConfig}
            onSaveProviderConfig={handleSaveProviderConfig}
            imageProviderConfig={imageProviderConfig}
            onSaveImageProviderConfig={handleSaveImageProviderConfig}
            onClose={appActions.closeOverlay}
            onGoBack={appActions.goBack}
            onNavigate={appActions.navigate}
            onDeleteImage={appActions.deleteImage}
            onDeleteGame={appActions.deleteGame}
            onReplayGame={(game) => {
              appActions.closeOverlay();
              appActions.openPlayground(game.html, game.title, { existingId: game.id });
            }}
            onPlayBuiltin={(game) => {
              // 内置游戏是裸 HTML，需先包 CSP 沙箱；existingId 避免把内置游戏塞进"我玩过的"历史。
              appActions.closeOverlay();
              appActions.openPlayground(wrapPlaygroundHtml(game.html), game.title, { existingId: game.id });
            }}
            onSetDefaultPet={(petId) => {
              persistDefaultPet(petId);
              setModelIndex(AVAILABLE_MODEL_IDS.indexOf(petId as typeof AVAILABLE_MODEL_IDS[number]));
            }}
            petNames={petNames}
            onRenamePet={handleSavePetName}
            sysLogs={sysLogs}
            sysLogTotal={sysLogTotal}
            requestSystemLogs={requestSystemLogs}
          />
          </SafeAreaView>
        </SwipeToDismiss>
      )}
      {/* Agent 推荐活动确认卡（大图标 + 语音双通道） */}
      <ConfirmCard
        visible={confirmCard != null}
        kind={confirmCard?.kind ?? "game"}
        title={confirmCard?.title ?? ""}
        onApprove={() => {
          if (confirmCard) sendConfirm(confirmCard.requestId, true);
          setConfirmCard(null);
        }}
        onReject={() => {
          if (confirmCard) sendConfirm(confirmCard.requestId, false);
          setConfirmCard(null);
        }}
      />

      {/* "改一改"修改要求输入 */}
      <EditInstructionModal
        visible={editTarget != null}
        gameTitle={editTarget?.title ?? ""}
        onCancel={() => setEditTarget(null)}
        onSubmit={(instruction) => {
          if (editTarget) {
            editCreation({
              gameId: editTarget.gameId,
              title: editTarget.title,
              html: editTarget.html,
              instruction,
            });
          }
          setEditTarget(null);
        }}
      />
    </>
  );
}

/** Agent 控制的页面 overlay */
function AppOverlay(props: {
  screen: ChildSafeScreen;
  images: readonly GalleryImage[];
  games: readonly GameEntry[];
  currentModelId: string;
  defaultPetId: string;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  childProfile: ChildProfile;
  onSaveProfile: (next: ChildProfile) => void;
  providerConfig: ProviderConfig | null;
  onSaveProviderConfig: (next: ProviderConfig | null) => void;
  imageProviderConfig: ImageProviderConfig | null;
  onSaveImageProviderConfig: (next: ImageProviderConfig | null) => void;
  /** 关闭整个 overlay（回舞台；设置页顶栏 / 滑动关闭） */
  onClose: () => void;
  /** 出栈一层（子页返回上一页，如设置） */
  onGoBack: () => void;
  onNavigate: (target: ChildSafeScreen) => void;
  onDeleteImage: (index: number) => void;
  onDeleteGame: (id: string) => void;
  onReplayGame: (game: GameEntry) => void;
  onPlayBuiltin: (game: BuiltinGame) => void;
  onSetDefaultPet: (petId: string) => void;
  petNames: Record<string, string>;
  onRenamePet: (petId: string, name: string) => void;
  sysLogs: readonly SystemLogLineWire[];
  sysLogTotal: number;
  requestSystemLogs: () => void;
}): React.JSX.Element | null {
  switch (props.screen) {
    case "gallery":
      return <GalleryScreen images={props.images} onClose={props.onGoBack} onDelete={props.onDeleteImage} />;
    case "chat_history":
      return (
        <ChatHistoryScreen
          sessionKey={DEFAULT_INIT.sessionKey}
          onClose={props.onGoBack}
          onNavigate={props.onNavigate}
        />
      );
    case "game_history":
      return (
        <GameHistoryScreen
          games={props.games}
          onClose={props.onGoBack}
          onReplay={props.onReplayGame}
          onDelete={props.onDeleteGame}
          onPlayBuiltin={props.onPlayBuiltin}
        />
      );
    case "pet_selection":
      return (
        <PetSelectionScreen
          pets={AVAILABLE_MODEL_IDS.map((id) => ({
            id,
            label: getPetModelConfig(id).label,
            modelPath: getPetModelConfig(id).modelPath,
            unlocked: true,
            name: props.petNames[id] ?? getPetModelConfig(id).name,
          }))}
          currentPetId={props.defaultPetId}
          onSelect={(petId) => {
            props.onSetDefaultPet(petId);
            props.onClose();
          }}
          onRename={props.onRenamePet}
          onClose={props.onGoBack}
        />
      );
    case "settings":
      return (
        <SettingsScreen
          defaultPetId={props.defaultPetId}
          selectedVoice={props.selectedVoice}
          onVoiceChange={props.onVoiceChange}
          childProfile={props.childProfile}
          onSaveProfile={props.onSaveProfile}
          providerConfig={props.providerConfig}
          onSaveProviderConfig={props.onSaveProviderConfig}
          imageProviderConfig={props.imageProviderConfig}
          onSaveImageProviderConfig={props.onSaveImageProviderConfig}
          onClose={props.onClose}
          onNavigate={(target) => {
            props.onNavigate(target);
          }}
        />
      );
    case "system_logs":
      return (
        <SystemLogsScreen
          onClose={props.onGoBack}
          requestLogs={props.requestSystemLogs}
          logs={props.sysLogs}
          logTotalCount={props.sysLogTotal}
        />
      );
    case "pet_stage":
    default:
      return null;
  }
}

/** 浮动小按钮（纸白圆钮 + 矢量图标） */
function FloatBtn(props: {
  readonly onPress: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <TouchableOpacity style={styles.floatBtn} onPress={props.onPress} activeOpacity={0.7}>
      {props.children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.rootBg },
  stage: {
    flex: 1,
    overflow: "hidden",
  },
  floatZoom: {
    position: "absolute",
    top: 48,
    right: 10,
    alignItems: "center",
    gap: 8,
    /* 抬到 hud(6) 之上，避免展开的聊天面板遮挡右侧按钮的点击 */
    elevation: 8,
    zIndex: 8,
  },
  /* 横屏屏高仅 ~369dp，压缩起点与间距，保证场景/设置按钮不出屏 */
  floatZoomLandscape: {
    top: 8,
    gap: 3,
  },
  /* 忙碌胶囊：顶部居中悬浮，高 elevation 保证浮在场景/人物之上；pointerEvents none 不拦触摸 */
  busyPill: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(58, 175, 169, 0.94)",
    shadowColor: t.colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 10,
  },
  busyPillLandscape: {
    top: 6,
  },
  busyPillText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  floatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.colors.hudPaper,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: t.colors.floatBorder,
    shadowColor: t.colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  zoomText: {
    color: t.colors.ink,
    fontSize: 10,
    fontWeight: "700",
  },
  modelBtn: {
    minWidth: 44,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: t.colors.hudPaper,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  modelBtnText: {
    color: t.colors.ink,
    fontSize: 10,
    fontWeight: "700",
  },
  sceneBtn: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: t.colors.hudPaper,
    borderWidth: 1,
    borderColor: t.colors.floatBorder,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  sceneBtnText: {
    color: t.colors.ink,
    fontSize: 10,
    fontWeight: "700",
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.colors.hudPaper,
    borderWidth: 1,
    borderColor: t.colors.floatBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: t.colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  // 底部悬浮 HUD：暖纸笺
  hud: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 6,
    backgroundColor: t.colors.hudPaper,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
    paddingTop: 4,
    paddingBottom: 8,
    marginHorizontal: 8,
    shadowColor: t.colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
  },
  hudLandscape: {
    maxWidth: 560,
    marginHorizontal: "auto",
  },
  hudToggle: {
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 2,
    marginBottom: 2,
  },
  hudToggleText: {
    color: t.colors.textMuted,
    fontSize: 10,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    gap: 5,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.colors.primary,
  },
  statusText: {
    color: t.colors.textSecondary,
    fontWeight: "500",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    // Android 触摸命中按 elevation 排序，须高于 HUD(elevation:6)，
    // 否则底部 HUD 悬浮层会盖住设置/日志页底部，吃掉那片滚动手势。
    elevation: 50,
    backgroundColor: t.colors.overlayBg,
  },
  overlaySafe: {
    flex: 1,
    // 横屏时系统状态栏/挖孔在顶部，SafeAreaView 在 Android 覆盖不全，
    // 用 StatusBar.currentHeight 兜底顶部内边距，保证顶栏「返回」按钮不被遮挡。
    paddingTop: StatusBar.currentHeight ?? 0,
  },
  playground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    // Android 触摸命中按 elevation 排序（压过 zIndex），必须高于 hud/floatZoom 才不被截走
    elevation: 60,
  },
  authLoading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
    backgroundColor: t.colors.rootBg,
    alignItems: "center",
    justifyContent: "center",
  },
  authLoadingText: {
    color: t.colors.textSecondary,
    fontSize: 15,
  },
});

export default App;
