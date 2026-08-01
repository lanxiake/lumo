/**
 * SettingsScreen — 设置菜单
 *
 * 卡片化布局、大图标、分区清晰。支持：我的画、我的游戏、
 * 聊天记录、默认宠物、修改密码、退出登录。
 */

import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { ChildProfile, ImageProviderConfig, ProviderConfig } from "../../../node-runtime/src/bridge/schema";
import { kidsTheme as t } from "../../theme/kidsTheme";
import {
  BackIcon,
  ChatIcon,
  ChevronIcon,
  GalleryIcon,
  GameIcon,
  LockIcon,
  PawIcon,
  VoiceIcon,
} from "../../components/KidsIcons";

/**
 * 可选 TTS 音色（Edge TTS 真实可用的中文女声，约 8 种）。
 * value 为 Edge 语音代码，下发给 Node 侧 setVoice；第一项为默认。
 */
export const KIDS_VOICES = [
  { value: "zh-CN-XiaoxiaoNeural", label: "晓晓", hint: "温暖亲切" },
  { value: "zh-CN-XiaoyiNeural", label: "晓伊", hint: "活泼可爱" },
  { value: "zh-CN-liaoning-XiaobeiNeural", label: "晓北", hint: "东北话" },
  { value: "zh-CN-shaanxi-XiaoniNeural", label: "晓妮", hint: "陕西话" },
  { value: "zh-TW-HsiaoChenNeural", label: "晓臻", hint: "台湾·温柔" },
  { value: "zh-TW-HsiaoYuNeural", label: "晓雨", hint: "台湾·清亮" },
  { value: "zh-HK-HiuMaanNeural", label: "曉曼", hint: "粤语" },
  { value: "zh-HK-HiuGaaiNeural", label: "曉佳", hint: "粤语" },
] as const;

/** 默认音色（与 Node 侧 DEFAULT_KIDS_VOICE 对齐） */
export const DEFAULT_TTS_VOICE = KIDS_VOICES[0].value;

export interface SettingsScreenProps {
  readonly onClose: () => void;
  readonly defaultPetId: string;
  /** 当前选中的 TTS 音色 ID */
  readonly selectedVoice?: string;
  /** 选择新音色时回调 */
  readonly onVoiceChange?: (voice: string) => void;
  readonly onNavigate?: (
    target: "gallery" | "chat_history" | "game_history" | "pet_selection" | "system_logs",
  ) => void;
  /** 小主人记忆档案（AI 对话中收集，家长可查看/修改） */
  readonly childProfile?: ChildProfile;
  /** 保存整份档案 */
  readonly onSaveProfile?: (next: ChildProfile) => void;
  /** 当前模型提供商配置（null 表示未配置） */
  readonly providerConfig?: ProviderConfig | null;
  /** 保存模型提供商配置（null 清除） */
  readonly onSaveProviderConfig?: (next: ProviderConfig | null) => void;
  /** 当前生图提供商配置（null 表示未配置） */
  readonly imageProviderConfig?: ImageProviderConfig | null;
  /** 保存生图提供商配置（null 清除） */
  readonly onSaveImageProviderConfig?: (next: ImageProviderConfig | null) => void;
}

export function SettingsScreen(props: SettingsScreenProps): React.JSX.Element {
  const { onClose, defaultPetId, selectedVoice, onVoiceChange, onNavigate, childProfile, onSaveProfile, providerConfig, onSaveProviderConfig, imageProviderConfig, onSaveImageProviderConfig } = props;

  const defaultPetLabel =
    defaultPetId === "mao_pro"
      ? "小猫姐姐 (Mao)"
      : defaultPetId === "xiaomai"
        ? "小麦 (Xiaomai)"
        : "小美同学 (UG)";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>设置</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <BackIcon size={14} color={t.colors.cinnabar} />
          <Text style={styles.closeText}>返回</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>记录</Text>
        <Card
          icon={<GalleryIcon size={22} color={t.colors.ink} />}
          label="我的画"
          hint="查看历史生成的图片"
          onPress={() => onNavigate?.("gallery")}
        />
        <Card
          icon={<GameIcon size={22} color={t.colors.ink} />}
          label="我的游戏"
          hint="查看玩过的小游戏"
          onPress={() => onNavigate?.("game_history")}
        />
        <Card
          icon={<ChatIcon size={22} color={t.colors.ink} />}
          label="聊天记录"
          hint="回顾和宠物的对话"
          onPress={() => onNavigate?.("chat_history")}
        />

        <Text style={styles.sectionTitle}>偏好</Text>
        <Card
          icon={<PawIcon size={22} color={t.colors.ink} />}
          label="默认宠物"
          hint={`当前：${defaultPetLabel}`}
          onPress={() => onNavigate?.("pet_selection")}
        />

        <View style={styles.voiceLabelRow}>
          <VoiceIcon size={16} color={t.colors.cloudGray} />
          <Text style={styles.voiceLabel}>宠物声音</Text>
        </View>
        <View style={styles.voiceGrid}>
          {KIDS_VOICES.map((v) => {
            const active = (selectedVoice ?? KIDS_VOICES[0].value) === v.value;
            return (
              <TouchableOpacity
                key={v.value}
                style={[styles.voiceChip, active && styles.voiceChipActive]}
                onPress={() => onVoiceChange?.(v.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.voiceChipText, active && styles.voiceChipTextActive]}>{v.label}</Text>
                <Text style={[styles.voiceChipHint, active && styles.voiceChipHintActive]}>{v.hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {onSaveProviderConfig && (
          <>
            <Text style={styles.sectionTitle}>模型提供商</Text>
            <ProviderSection config={providerConfig ?? null} onSave={onSaveProviderConfig} />
          </>
        )}

        {onSaveImageProviderConfig && (
          <>
            <Text style={styles.sectionTitle}>生图模型</Text>
            <ImageProviderSection config={imageProviderConfig ?? null} onSave={onSaveImageProviderConfig} />
          </>
        )}

        {onSaveProfile && (
          <>
            <Text style={styles.sectionTitle}>小主人记忆</Text>
            <MemorySection profile={childProfile ?? {}} onSave={onSaveProfile} />
          </>
        )}

        <Text style={styles.sectionTitle}>诊断</Text>
        <Card
          icon={<ChevronIcon size={22} color={t.colors.ink} />}
          label="系统日志"
          hint="查看运行/错误日志，可导出"
          onPress={() => onNavigate?.("system_logs")}
        />

        <View style={styles.parentHintBox}>
          <LockIcon size={14} color={t.colors.ink} />
          <Text style={styles.parentHint}>
            模型 API Key 仅保存在本机，直连你配置的服务商，不经任何中转服务器。
          </Text>
        </View>

        <Text style={styles.version}>v0.1.0 · Lumo</Text>
      </ScrollView>
    </View>
  );
}

/** 设置列表卡片（图标为 View 矢量，无 emoji） */
function Card(props: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly hint: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly danger?: boolean;
}): React.JSX.Element {
  const { icon, label, hint, onPress, disabled, danger } = props;
  return (
    <TouchableOpacity
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
    >
      <View style={styles.cardIcon}>{icon}</View>
      <View style={styles.cardBody}>
        <Text
          style={[
            styles.cardLabel,
            danger && styles.cardLabelDanger,
            disabled && styles.cardLabelDisabled,
          ]}
        >
          {label}
        </Text>
        <Text style={styles.cardHint}>{hint}</Text>
      </View>
      {!disabled && <ChevronIcon size={14} color={t.colors.cinnabar} />}
    </TouchableOpacity>
  );
}

/**
 * 纯 host（无路径段）时补 /v1；已有路径段不动。
 * 字符串实现（不用 new URL）——RN/Hermes 的 URL polyfill pathname 不可靠。
 */
function ensureV1(root: string): string {
  const withoutProto = root.replace(/^[a-z]+:\/\//i, "");
  const slash = withoutProto.indexOf("/");
  const hasPath = slash >= 0 && withoutProto.slice(slash + 1).trim().length > 0;
  return hasPath ? root : `${root}/v1`;
}

/**
 * 拉取 provider 模型列表：OpenAI 兼容走 GET {baseUrl}/v1/models，Anthropic 走
 * GET {baseUrl}/v1/models。两者 baseUrl 都归一化补 /v1（幂等）。Anthropic 同时带
 * x-api-key 与 Authorization: Bearer 两种鉴权头，兼容真 Anthropic 与第三方兼容网关。
 * 客户端直连上游，凭据不出本机。
 */
async function fetchModelList(
  protocol: "openai" | "anthropic",
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const root = baseUrl.trim().replace(/\/+$/, "");
  const url = `${ensureV1(root)}/models`;
  const headers: Record<string, string> =
    protocol === "anthropic"
      ? {
          "x-api-key": apiKey,
          Authorization: `Bearer ${apiKey}`,
          "anthropic-version": "2023-06-01",
        }
      : { Authorization: `Bearer ${apiKey}` };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
    let json: { data?: ReadonlyArray<{ id?: string }> };
    try {
      json = JSON.parse(body);
    } catch {
      // 非 JSON：多半 baseUrl 指到了网页/错误路径，给出端点提示而非笼统解析异常
      throw new Error(`响应非 JSON（检查 baseUrl）：${body.slice(0, 80)}`);
    }
    const ids = (json.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
    return Array.from(new Set(ids)).sort();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 模型提供商配置区：协议 / baseUrl / apiKey / model。独立运行模式下这是唯一模型来源，
 * 客户端直连上游。apiKey 仅存本机，保存后经 _auth 通道下发 Node 侧内存缓存。
 */
function ProviderSection(props: {
  readonly config: ProviderConfig | null;
  readonly onSave: (next: ProviderConfig | null) => void;
}): React.JSX.Element {
  const { config, onSave } = props;
  const [protocol, setProtocol] = useState<"openai" | "anthropic">(config?.protocol ?? "openai");
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(config?.apiKey ?? "");
  const [model, setModel] = useState(config?.model ?? "");
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<readonly string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const configKey = `${config?.protocol ?? ""}|${config?.baseUrl ?? ""}|${config?.apiKey ?? ""}|${config?.model ?? ""}`;
  useEffect(() => {
    setProtocol(config?.protocol ?? "openai");
    setBaseUrl(config?.baseUrl ?? "");
    setApiKey(config?.apiKey ?? "");
    setModel(config?.model ?? "");
    setModels([]);
    setFetchError("");
  }, [configKey]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅在外部配置真正变化时回灌

  const canFetch = baseUrl.trim() !== "" && !loadingModels;

  const handleFetchModels = async (): Promise<void> => {
    if (!canFetch) return;
    setLoadingModels(true);
    setFetchError("");
    try {
      const list = await fetchModelList(protocol, baseUrl, apiKey.trim());
      setModels(list);
      if (list.length === 0) setFetchError("未返回任何模型，请手动填写");
    } catch (e) {
      setFetchError(`获取失败：${e instanceof Error ? e.message : String(e)}，可手动填写`);
    } finally {
      setLoadingModels(false);
    }
  };

  const canSave = baseUrl.trim() !== "" && apiKey.trim() !== "" && model.trim() !== "";

  const handleSave = (): void => {
    if (!canSave) return;
    onSave({ protocol, baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleClear = (): void => {
    setBaseUrl("");
    setApiKey("");
    setModel("");
    onSave(null);
    setSaved(false);
  };

  return (
    <View style={styles.memBox}>
      <View style={styles.memRow}>
        <Text style={styles.memLabel}>协议</Text>
        <View style={styles.genderRow}>
          {(["openai", "anthropic"] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.genderChip, protocol === p && styles.genderChipActive]}
              onPress={() => setProtocol(p)}
              activeOpacity={0.7}
            >
              <Text style={[styles.genderChipText, protocol === p && styles.voiceChipTextActive]}>
                {p === "openai" ? "OpenAI" : "Anthropic"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <MemoryField
        label="接口地址"
        value={baseUrl}
        onChangeText={setBaseUrl}
        placeholder={protocol === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com"}
      />
      <View style={styles.memRow}>
        <Text style={styles.memLabel}>API Key</Text>
        <TextInput
          style={styles.memInput}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="sk-..."
          placeholderTextColor={t.colors.placeholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View style={styles.memRow}>
        <Text style={styles.memLabel}>模型</Text>
        <TextInput
          style={styles.memInput}
          value={model}
          onChangeText={setModel}
          placeholder={protocol === "openai" ? "gpt-4o-mini" : "claude-3-5-sonnet-latest"}
          placeholderTextColor={t.colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <TouchableOpacity
        style={[styles.fetchModelsBtn, !canFetch && styles.fetchModelsBtnDisabled]}
        onPress={handleFetchModels}
        activeOpacity={0.7}
        disabled={!canFetch}
      >
        <Text style={styles.fetchModelsText}>
          {loadingModels ? "获取中…" : "获取模型列表"}
        </Text>
      </TouchableOpacity>
      {fetchError !== "" && <Text style={styles.memClearHint}>{fetchError}</Text>}
      {models.length > 0 && (
        <View style={styles.modelChipGrid}>
          {models.map((m) => {
            const active = model === m;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.modelChip, active && styles.modelChipActive]}
                onPress={() => setModel(m)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modelChipText, active && styles.voiceChipTextActive]}>{m}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.memActions}>
        <TouchableOpacity style={styles.memClearBtn} onPress={handleClear} activeOpacity={0.7}>
          <Text style={styles.memClearText}>清除</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.memSaveBtn, !canSave && styles.memSaveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.7}
          disabled={!canSave}
        >
          <Text style={styles.memSaveText}>{saved ? "已保存 ✓" : "保存"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * 生图提供商配置区：baseUrl / apiKey / model。仅 OpenAI 兼容图像端点
 * （POST {baseUrl}/images/generations）。缺省时生图回退 gateway 兜底。
 * apiKey 仅存本机，直连上游。
 */
function ImageProviderSection(props: {
  readonly config: ImageProviderConfig | null;
  readonly onSave: (next: ImageProviderConfig | null) => void;
}): React.JSX.Element {
  const { config, onSave } = props;
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(config?.apiKey ?? "");
  const [model, setModel] = useState(config?.model ?? "");
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<readonly string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const configKey = `${config?.baseUrl ?? ""}|${config?.apiKey ?? ""}|${config?.model ?? ""}`;
  useEffect(() => {
    setBaseUrl(config?.baseUrl ?? "");
    setApiKey(config?.apiKey ?? "");
    setModel(config?.model ?? "");
    setModels([]);
    setFetchError("");
  }, [configKey]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅在外部配置真正变化时回灌

  const canFetch = baseUrl.trim() !== "" && !loadingModels;

  const handleFetchModels = async (): Promise<void> => {
    if (!canFetch) return;
    setLoadingModels(true);
    setFetchError("");
    try {
      const list = await fetchModelList("openai", baseUrl, apiKey.trim());
      setModels(list);
      if (list.length === 0) setFetchError("未返回任何模型，请手动填写");
    } catch (e) {
      setFetchError(`获取失败：${e instanceof Error ? e.message : String(e)}，可手动填写`);
    } finally {
      setLoadingModels(false);
    }
  };

  const canSave = baseUrl.trim() !== "" && apiKey.trim() !== "" && model.trim() !== "";

  const handleSave = (): void => {
    if (!canSave) return;
    onSave({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleClear = (): void => {
    setBaseUrl("");
    setApiKey("");
    setModel("");
    onSave(null);
    setSaved(false);
  };

  return (
    <View style={styles.memBox}>
      <MemoryField
        label="接口地址"
        value={baseUrl}
        onChangeText={setBaseUrl}
        placeholder="https://api.openai.com/v1"
      />
      <View style={styles.memRow}>
        <Text style={styles.memLabel}>API Key</Text>
        <TextInput
          style={styles.memInput}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="sk-..."
          placeholderTextColor={t.colors.placeholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View style={styles.memRow}>
        <Text style={styles.memLabel}>模型</Text>
        <TextInput
          style={styles.memInput}
          value={model}
          onChangeText={setModel}
          placeholder="dall-e-3 / gpt-image-1"
          placeholderTextColor={t.colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <TouchableOpacity
        style={[styles.fetchModelsBtn, !canFetch && styles.fetchModelsBtnDisabled]}
        onPress={handleFetchModels}
        activeOpacity={0.7}
        disabled={!canFetch}
      >
        <Text style={styles.fetchModelsText}>{loadingModels ? "获取中…" : "获取模型列表"}</Text>
      </TouchableOpacity>
      {fetchError !== "" && <Text style={styles.memClearHint}>{fetchError}</Text>}
      {models.length > 0 && (
        <View style={styles.modelChipGrid}>
          {models.map((m) => {
            const active = model === m;
            return (
              <TouchableOpacity
                key={m}
                style={[styles.modelChip, active && styles.modelChipActive]}
                onPress={() => setModel(m)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modelChipText, active && styles.voiceChipTextActive]}>{m}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.memActions}>
        <TouchableOpacity style={styles.memClearBtn} onPress={handleClear} activeOpacity={0.7}>
          <Text style={styles.memClearText}>清除</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.memSaveBtn, !canSave && styles.memSaveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.7}
          disabled={!canSave}
        >
          <Text style={styles.memSaveText}>{saved ? "已保存 ✓" : "保存"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** 将 ChildProfile 摊平成表单草稿字符串，便于与输入框对照。 */
function profileToDraft(profile: ChildProfile): {
  name: string;
  age: string;
  gender: string;
  height: string;
  likes: string;
  dislikes: string;
  personality: string;
  learning: string;
} {
  return {
    name: profile.name ?? "",
    age: profile.age != null ? String(profile.age) : "",
    gender: profile.gender ?? "",
    height: profile.heightCm != null ? String(profile.heightCm) : "",
    likes: (profile.likes ?? []).join("、"),
    dislikes: (profile.dislikes ?? []).join("、"),
    personality: profile.personality ?? "",
    learning: profile.learning ?? "",
  };
}

/**
 * 记忆字段输入行（模块级组件，避免写在父组件内导致每次渲染重建类型、键盘失焦）。
 */
function MemoryField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (t: string) => void;
  readonly keyboardType?: "default" | "numeric";
  readonly placeholder?: string;
}): React.JSX.Element {
  const { label, value, onChangeText, keyboardType, placeholder } = props;
  return (
    <View style={styles.memRow}>
      <Text style={styles.memLabel}>{label}</Text>
      <TextInput
        style={styles.memInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "还没记录"}
        placeholderTextColor={t.colors.placeholder}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}

/** 记忆编辑区：把 ChildProfile 摊平成可编辑文本，保存时解析回结构化档案。 */
function MemorySection(props: {
  readonly profile: ChildProfile;
  readonly onSave: (next: ChildProfile) => void;
}): React.JSX.Element {
  const { profile, onSave } = props;
  const initial = profileToDraft(profile);
  const [name, setName] = useState(initial.name);
  const [age, setAge] = useState(initial.age);
  const [gender, setGender] = useState(initial.gender);
  const [height, setHeight] = useState(initial.height);
  const [likes, setLikes] = useState(initial.likes);
  const [dislikes, setDislikes] = useState(initial.dislikes);
  const [personality, setPersonality] = useState(initial.personality);
  const [learning, setLearning] = useState(initial.learning);
  const [saved, setSaved] = useState(false);
  const [clearedHint, setClearedHint] = useState(false);

  // AI 异步更新档案时回灌；用字段快照做浅比较，避免引用变化冲掉正在编辑的内容。
  const profileKey = [
    profile.name ?? "",
    profile.age ?? "",
    profile.gender ?? "",
    profile.heightCm ?? "",
    (profile.likes ?? []).join("、"),
    (profile.dislikes ?? []).join("、"),
    profile.personality ?? "",
    profile.learning ?? "",
  ].join("|");

  useEffect(() => {
    const next = profileToDraft(profile);
    setName(next.name);
    setAge(next.age);
    setGender(next.gender);
    setHeight(next.height);
    setLikes(next.likes);
    setDislikes(next.dislikes);
    setPersonality(next.personality);
    setLearning(next.learning);
    setClearedHint(false);
  }, [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps -- 仅在档案内容真正变化时回灌

  const splitList = (s: string): string[] =>
    s.split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean);

  /** 将当前草稿解析并持久化；空草稿保存为空档案。 */
  const handleSave = (): void => {
    const next: Record<string, unknown> = {};
    if (name.trim()) next.name = name.trim();
    const ageNum = Number(age);
    if (age.trim() && Number.isFinite(ageNum)) next.age = ageNum;
    if (gender === "男孩" || gender === "女孩" || gender === "保密") next.gender = gender;
    const hNum = Number(height);
    if (height.trim() && Number.isFinite(hNum)) next.heightCm = hNum;
    const likesArr = splitList(likes);
    if (likesArr.length) next.likes = likesArr;
    const dislikesArr = splitList(dislikes);
    if (dislikesArr.length) next.dislikes = dislikesArr;
    if (personality.trim()) next.personality = personality.trim();
    if (learning.trim()) next.learning = learning.trim();
    onSave(next as ChildProfile);
    setClearedHint(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  /** 仅清空本地草稿，不写盘；需再点「保存」才生效。 */
  const handleClear = (): void => {
    setName("");
    setAge("");
    setGender("");
    setHeight("");
    setLikes("");
    setDislikes("");
    setPersonality("");
    setLearning("");
    setSaved(false);
    setClearedHint(true);
  };

  return (
    <View style={styles.memBox}>
      <MemoryField label="名字" value={name} onChangeText={setName} />
      <MemoryField label="年龄" value={age} onChangeText={setAge} keyboardType="numeric" />
      <View style={styles.memRow}>
        <Text style={styles.memLabel}>性别</Text>
        <View style={styles.genderRow}>
          {(["男孩", "女孩", "保密"] as const).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.genderChip, gender === g && styles.genderChipActive]}
              onPress={() => setGender(gender === g ? "" : g)}
              activeOpacity={0.7}
            >
              <Text style={[styles.genderChipText, gender === g && styles.voiceChipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <MemoryField label="身高cm" value={height} onChangeText={setHeight} keyboardType="numeric" />
      <MemoryField label="喜欢" value={likes} onChangeText={setLikes} placeholder="顿号或逗号分隔" />
      <MemoryField label="不喜欢" value={dislikes} onChangeText={setDislikes} placeholder="顿号或逗号分隔" />
      <MemoryField label="性格" value={personality} onChangeText={setPersonality} />
      <MemoryField label="学习" value={learning} onChangeText={setLearning} />

      {clearedHint && (
        <Text style={styles.memClearHint}>已清空草稿，点「保存」后才会真正删除记忆</Text>
      )}

      <View style={styles.memActions}>
        <TouchableOpacity style={styles.memClearBtn} onPress={handleClear} activeOpacity={0.7}>
          <Text style={styles.memClearText}>清空</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.memSaveBtn} onPress={handleSave} activeOpacity={0.7}>
          <Text style={styles.memSaveText}>{saved ? "已保存 ✓" : "保存"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.colors.overlayBg,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.cardBorder,
  },
  title: { color: t.colors.text, fontSize: t.font.title, fontWeight: "800" },
  closeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: t.colors.paper,
    borderRadius: t.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: t.colors.cinnabarSoft,
  },
  closeText: { color: t.colors.cinnabar, fontSize: t.font.label, fontWeight: "700" },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 48 },
  sectionTitle: {
    color: t.colors.cloudGray,
    fontSize: t.font.section,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
    paddingLeft: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.paper,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
    shadowColor: t.colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  cardDisabled: {
    backgroundColor: "rgba(243, 230, 212, 0.5)",
    borderColor: t.colors.softGoldBorder,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: t.colors.paperDeep,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardBody: { flex: 1 },
  cardLabel: { color: t.colors.ink, fontSize: t.font.body, fontWeight: "700", marginBottom: 3 },
  cardLabelDanger: { color: t.colors.cinnabar },
  cardLabelDisabled: { color: t.colors.cloudGray },
  cardHint: { color: t.colors.cloudGray, fontSize: t.font.hint, lineHeight: 16 },
  voiceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
    paddingLeft: 4,
  },
  voiceLabel: {
    color: t.colors.cloudGray,
    fontSize: t.font.section,
    fontWeight: "700",
  },
  voiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  voiceChip: {
    backgroundColor: t.colors.paper,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
    minWidth: 82,
    alignItems: "center",
  },
  voiceChipActive: {
    backgroundColor: t.colors.cinnabar,
    borderColor: t.colors.cinnabar,
  },
  voiceChipText: { color: t.colors.ink, fontSize: 15, fontWeight: "700" },
  voiceChipHint: { color: t.colors.cloudGray, fontSize: 11, marginTop: 2 },
  voiceChipTextActive: { color: t.colors.textOnAccent },
  voiceChipHintActive: { color: t.colors.textOnAccent, opacity: 0.9 },
  version: {
    color: t.colors.cloudGray,
    fontSize: 11,
    textAlign: "center",
    marginTop: 32,
  },
  parentHintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: t.colors.paperDeep,
  },
  parentHint: {
    flex: 1,
    color: t.colors.cloudGray,
    fontSize: 12,
    lineHeight: 18,
  },
  memBox: {
    backgroundColor: t.colors.paper,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  memRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  memLabel: {
    color: t.colors.cloudGray,
    fontSize: t.font.label,
    fontWeight: "600",
    width: 64,
  },
  memInput: {
    flex: 1,
    backgroundColor: t.colors.paperDeep,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: t.colors.ink,
    fontSize: 14,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  genderRow: { flexDirection: "row", gap: 8, flex: 1 },
  genderChip: {
    backgroundColor: t.colors.paperDeep,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  genderChipActive: {
    backgroundColor: t.colors.teal,
    borderColor: t.colors.teal,
  },
  genderChipText: { color: t.colors.cloudGray, fontSize: 14, fontWeight: "600" },
  memClearHint: {
    color: t.colors.cinnabar,
    fontSize: 12,
    marginBottom: 8,
    paddingLeft: 2,
  },
  fetchModelsBtn: {
    borderRadius: t.radius.sm,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: t.colors.paperDeep,
    borderWidth: 1,
    borderColor: t.colors.teal,
    alignItems: "center",
  },
  fetchModelsBtnDisabled: {
    borderColor: t.colors.softGoldBorder,
    opacity: 0.5,
  },
  fetchModelsText: { color: t.colors.teal, fontSize: 14, fontWeight: "700" },
  modelChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  modelChip: {
    backgroundColor: t.colors.paperDeep,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  modelChipActive: {
    backgroundColor: t.colors.cinnabar,
    borderColor: t.colors.cinnabar,
  },
  modelChipText: { color: t.colors.ink, fontSize: 13, fontWeight: "600" },
  memActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  memClearBtn: {
    flex: 1,
    borderRadius: t.radius.sm,
    paddingVertical: 11,
    backgroundColor: "rgba(180, 160, 150, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(180, 160, 150, 0.4)",
    alignItems: "center",
  },
  memClearText: { color: t.colors.textSecondary, fontSize: 14, fontWeight: "600" },
  memSaveBtn: {
    flex: 2,
    borderRadius: t.radius.sm,
    paddingVertical: 11,
    backgroundColor: t.colors.primary,
    borderWidth: 1,
    borderColor: t.colors.primary,
    alignItems: "center",
  },
  memSaveText: { color: t.colors.textOnAccent, fontSize: 14, fontWeight: "700" },
  memSaveBtnDisabled: {
    backgroundColor: "rgba(180, 170, 160, 0.45)",
    borderColor: "rgba(160, 150, 140, 0.35)",
  },
});
