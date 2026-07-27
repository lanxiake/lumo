/**
 * ChatControls — 儿童友好底部交互控制栏（国风暖纸笺）
 *
 * 默认显示两大按钮:
 *   - 左边: 文字输入（键盘图标）
 *   - 右边: 打电话（电话图标）
 *
 * 点击文字输入展开输入框；点击打电话进入通话模式。
 * 按钮尺寸偏大，方便低龄儿童点按。图标为 View 矢量，无 emoji。
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { ConversationMode } from "../../conversation/useConversationMode";
import type { PetState } from "@lumo/core";
import { kidsTheme as t } from "../../theme/kidsTheme";
import {
  BackIcon,
  HangupIcon,
  InterruptIcon,
  KeyboardIcon,
  MicIcon,
  PhoneIcon,
  SendIcon,
} from "../../components/KidsIcons";

export interface ChatControlsProps {
  readonly mode: ConversationMode;
  readonly petState: PetState;
  readonly input: string;
  readonly onChangeInput: (text: string) => void;
  readonly onSend: () => void;
  readonly onEnterPhoneCall: () => void;
  readonly onExitPhoneCall: () => void;
  /** 通话中手动切换麦克风静音 */
  readonly onToggleMic: () => void;
  /** 麦克风是否已被手动静音 */
  readonly micMuted: boolean;
  readonly onInterrupt: () => void;
  readonly enabled: boolean;
  readonly sessionReady: boolean;
  readonly sttAvailable: boolean | null;
  readonly listening: boolean;
  readonly placeholder: string;
  readonly fontSize: (base: number) => number;
}

/** 底部控制坞入口 */
export function ChatControls(props: ChatControlsProps): React.JSX.Element {
  const {
    mode,
    petState,
    input,
    onChangeInput,
    onSend,
    onEnterPhoneCall,
    onExitPhoneCall,
    onToggleMic,
    micMuted,
    onInterrupt,
    enabled,
    sessionReady,
    sttAvailable,
    listening,
    placeholder,
    fontSize,
  } = props;

  const [textMode, setTextMode] = useState(false);

  const isPhoneMode = mode === "phone_call";
  useEffect(() => {
    if (isPhoneMode) setTextMode(false);
  }, [isPhoneMode]);

  const canUse = sessionReady && enabled;
  const reasonHint = !sessionReady
    ? "连接中…"
    : sttAvailable === false
      ? "语音未就绪"
      : "";

  const aiReplying =
    petState === "thinking" || petState === "tts_converting" || petState === "speaking";

  return (
    <View style={styles.container}>
      {aiReplying && !isPhoneMode && (
        <TouchableOpacity style={styles.interruptBtn} onPress={onInterrupt} activeOpacity={0.7}>
          <Text style={styles.interruptBtnText}>打断</Text>
        </TouchableOpacity>
      )}

      {isPhoneMode ? (
        <PhoneCallPanel
          petState={petState}
          listening={listening}
          micMuted={micMuted}
          aiReplying={aiReplying}
          onToggleMic={onToggleMic}
          onInterrupt={onInterrupt}
          onHangup={onExitPhoneCall}
        />
      ) : textMode ? (
        <TextInputPanel
          input={input}
          onChangeInput={onChangeInput}
          onSend={onSend}
          onClose={() => setTextMode(false)}
          placeholder={placeholder}
          editable={canUse}
          fontSize={fontSize}
        />
      ) : (
        <ButtonPanel
          onText={() => setTextMode(true)}
          onCall={onEnterPhoneCall}
          enabled={canUse}
          reasonHint={reasonHint}
        />
      )}
    </View>
  );
}

/** 两个大按钮面板：打字 / 打电话 */
function ButtonPanel(props: {
  readonly onText: () => void;
  readonly onCall: () => void;
  readonly enabled: boolean;
  readonly reasonHint: string;
}): React.JSX.Element {
  const { onText, onCall, enabled, reasonHint } = props;

  return (
    <View style={styles.buttonPanel}>
      <ActionButton
        icon={<KeyboardIcon size={28} color="#FFFFFF" />}
        label="打字"
        labelColor={t.colors.sky}
        fill={t.colors.sky}
        onPress={onText}
        disabled={!enabled}
      />
      <ActionButton
        icon={<PhoneIcon size={26} color="#FFFFFF" />}
        label="打电话"
        labelColor={t.colors.call}
        fill={t.colors.call}
        onPress={onCall}
        disabled={!enabled}
      />
      {!!reasonHint && <Text style={styles.reasonHint}>{reasonHint}</Text>}
    </View>
  );
}

/**
 * 通话面板：中央状态球 + 静音 / 打断 / 挂断
 *
 * 状态优先级：静音 > AI 回复 > 聆听 > 待命
 */
function PhoneCallPanel(props: {
  readonly petState: PetState;
  readonly listening: boolean;
  readonly micMuted: boolean;
  readonly aiReplying: boolean;
  readonly onToggleMic: () => void;
  readonly onInterrupt: () => void;
  readonly onHangup: () => void;
}): React.JSX.Element {
  const { petState, listening, micMuted, aiReplying, onToggleMic, onInterrupt, onHangup } = props;

  const status: "muted" | "replying" | "listening" | "ready" = micMuted
    ? "muted"
    : aiReplying
      ? "replying"
      : listening || petState === "listening"
        ? "listening"
        : "ready";

  const statusText =
    status === "muted"
      ? "麦克风已关闭"
      : status === "replying"
        ? "正在回复 · 点击可打断"
        : status === "listening"
          ? "正在聆听 · 说吧～"
          : "可以说话了";

  const orbActive = status === "listening";
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!orbActive) {
      pulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [orbActive, pulseAnim]);
  const ringScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const ringOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.callPanel}>
      <View style={styles.callOrbWrap}>
        {orbActive && (
          <Animated.View
            style={[styles.callOrbPulse, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
          />
        )}
        <View
          style={[
            styles.callOrb,
            status === "muted" && styles.callOrbMuted,
            status === "listening" && styles.callOrbListening,
          ]}
        >
          <MicIcon
            size={28}
            color={status === "muted" || status === "listening" ? "#FFFFFF" : t.colors.textSecondary}
            muted={status === "muted"}
          />
        </View>
      </View>

      <Text style={[styles.callStatusText, status === "muted" && styles.callStatusMuted]}>
        {statusText}
      </Text>

      <View style={styles.callActions}>
        <View style={styles.callActionItem}>
          <TouchableOpacity
            style={[styles.callSideBtn, micMuted && styles.callSideBtnMuted]}
            onPress={onToggleMic}
            activeOpacity={0.7}
          >
            <MicIcon
              size={22}
              color={micMuted ? "#FFFFFF" : t.colors.textSecondary}
              muted={micMuted}
            />
          </TouchableOpacity>
          <Text style={styles.callActionLabel}>{micMuted ? "已静音" : "静音"}</Text>
        </View>

        <View style={styles.callActionItem}>
          <TouchableOpacity
            style={[
              styles.callSideBtn,
              !aiReplying && styles.callSideBtnDisabled,
              aiReplying && styles.callSideBtnInterrupt,
            ]}
            onPress={aiReplying ? onInterrupt : undefined}
            activeOpacity={aiReplying ? 0.7 : 1}
            disabled={!aiReplying}
          >
            <InterruptIcon size={18} color={aiReplying ? "#FFFFFF" : t.colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.callActionLabel}>打断</Text>
        </View>

        <View style={styles.callActionItem}>
          <TouchableOpacity style={styles.hangupRoundBtn} onPress={onHangup} activeOpacity={0.7}>
            <HangupIcon size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.callActionLabel}>挂断</Text>
        </View>
      </View>
    </View>
  );
}

/** 文字输入面板：返回 + 输入框 + 朱砂发送 */
function TextInputPanel(props: {
  readonly input: string;
  readonly onChangeInput: (text: string) => void;
  readonly onSend: () => void;
  readonly onClose: () => void;
  readonly placeholder: string;
  readonly editable: boolean;
  readonly fontSize: (base: number) => number;
}): React.JSX.Element {
  const { input, onChangeInput, onSend, onClose, placeholder, editable, fontSize } = props;
  return (
    <View style={styles.textPanel}>
      <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
        <BackIcon size={16} color={t.colors.cinnabar} />
      </TouchableOpacity>
      <TextInput
        style={[styles.textInput, { fontSize: fontSize(15) }]}
        value={input}
        onChangeText={onChangeInput}
        placeholder={placeholder}
        placeholderTextColor={t.colors.placeholder}
        editable={editable}
        onSubmitEditing={onSend}
        returnKeyType="send"
        autoFocus
      />
      <TouchableOpacity
        style={[styles.sendRoundBtn, !input.trim() && styles.sendRoundBtnDisabled]}
        onPress={onSend}
        activeOpacity={0.7}
        disabled={!input.trim()}
      >
        <SendIcon size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

/** 统一外层结构的普通动作按钮 */
function ActionButton(props: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly labelColor: string;
  readonly fill: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}): React.JSX.Element {
  const { icon, label, labelColor, fill, onPress, disabled } = props;
  return (
    <View style={styles.actionWrapper}>
      <TouchableOpacity
        style={[
          styles.actionBtn,
          {
            backgroundColor: fill,
            borderColor: "#FFFFFFAA",
            shadowColor: fill,
          },
          disabled && styles.actionBtnDisabled,
        ]}
        onPress={disabled ? undefined : onPress}
        activeOpacity={disabled ? 1 : 0.7}
        disabled={disabled}
      >
        <View style={styles.actionIconBox}>{icon}</View>
      </TouchableOpacity>
      <Text style={[styles.actionLabel, { color: disabled ? t.colors.textMuted : labelColor }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
  },
  buttonPanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 28,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  reasonHint: {
    position: "absolute",
    bottom: -14,
    color: t.colors.cloudGray,
    fontSize: 11,
  },
  actionWrapper: {
    width: 78,
    alignItems: "center",
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: t.colors.sky,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  actionBtnDisabled: {
    backgroundColor: "rgba(180, 170, 160, 0.55)",
    borderColor: "rgba(160, 150, 140, 0.35)",
    shadowOpacity: 0,
    elevation: 0,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  callPanel: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 10,
    gap: 14,
  },
  callOrbWrap: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  callOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.colors.paperDeep,
    borderWidth: 2,
    borderColor: t.colors.softGoldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  callOrbListening: {
    backgroundColor: t.colors.teal,
    borderColor: t.colors.teal,
    shadowColor: t.colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
  callOrbMuted: {
    backgroundColor: t.colors.cinnabar,
    borderColor: t.colors.cinnabar,
  },
  callOrbPulse: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: t.colors.teal,
  },
  callStatusText: {
    color: t.colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  callStatusMuted: {
    color: t.colors.cinnabar,
  },
  callActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
  },
  callActionItem: {
    alignItems: "center",
    gap: 6,
  },
  callSideBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.paperDeep,
    borderWidth: 1.5,
    borderColor: t.colors.softGoldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  callSideBtnMuted: {
    backgroundColor: t.colors.cinnabar,
    borderColor: t.colors.cinnabar,
  },
  callSideBtnDisabled: {
    backgroundColor: t.colors.paperDeep,
    borderColor: t.colors.softGoldBorder,
    opacity: 0.45,
  },
  callSideBtnInterrupt: {
    backgroundColor: t.colors.cinnabar,
    borderColor: t.colors.cinnabar,
  },
  hangupRoundBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.cinnabar,
    borderWidth: 1.5,
    borderColor: t.colors.cinnabar,
    alignItems: "center",
    justifyContent: "center",
  },
  callActionLabel: {
    color: t.colors.cloudGray,
    fontSize: 12,
    fontWeight: "700",
  },
  textPanel: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.colors.paperDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: t.colors.paperDeep,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
    color: t.colors.ink,
  },
  sendRoundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.colors.cinnabar,
    borderWidth: 1.5,
    borderColor: t.colors.cinnabar,
    alignItems: "center",
    justifyContent: "center",
  },
  sendRoundBtnDisabled: {
    backgroundColor: "rgba(180, 170, 160, 0.45)",
    borderColor: "rgba(160, 150, 140, 0.35)",
  },
  interruptBtn: {
    alignSelf: "center",
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: t.colors.cinnabarSoft,
    borderWidth: 1,
    borderColor: t.colors.cinnabar,
  },
  interruptBtnText: {
    color: t.colors.cinnabar,
    fontSize: 13,
    fontWeight: "700",
  },
});
