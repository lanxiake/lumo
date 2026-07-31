/**
 * ChatControls — 儿童友好底部交互控制栏（国风暖纸笺）
 *
 * 常驻输入框 + 右侧单按钮：
 *   - 输入框有内容 → 发送按钮
 *   - 输入框为空 → 电话按钮（单击进入通话）
 *
 * 通话面板扁平排列：静音 / 打断 / 挂断。图标为 View 矢量，无 emoji。
 */

import React from "react";
import {
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
  HangupIcon,
  InterruptIcon,
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
    placeholder,
    fontSize,
  } = props;

  const isPhoneMode = mode === "phone_call";

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
          micMuted={micMuted}
          aiReplying={aiReplying}
          onToggleMic={onToggleMic}
          onInterrupt={onInterrupt}
          onHangup={onExitPhoneCall}
        />
      ) : (
        <InputBar
          input={input}
          onChangeInput={onChangeInput}
          onSend={onSend}
          onCall={onEnterPhoneCall}
          placeholder={placeholder}
          editable={canUse}
          reasonHint={reasonHint}
          fontSize={fontSize}
        />
      )}
    </View>
  );
}

/**
 * 常驻输入栏：输入框 + 右侧单按钮
 * 有内容→发送（朱砂）；为空→电话（单击进入通话）
 */
function InputBar(props: {
  readonly input: string;
  readonly onChangeInput: (text: string) => void;
  readonly onSend: () => void;
  readonly onCall: () => void;
  readonly placeholder: string;
  readonly editable: boolean;
  readonly reasonHint: string;
  readonly fontSize: (base: number) => number;
}): React.JSX.Element {
  const { input, onChangeInput, onSend, onCall, placeholder, editable, reasonHint, fontSize } =
    props;
  const hasText = input.trim().length > 0;
  /* 按钮随字号缩放：手机 ~44，平板更大，与输入框视觉齐高 */
  const btnSize = fontSize(44);
  const iconSize = Math.round(btnSize * (hasText ? 0.4 : 0.45));

  return (
    <View style={styles.inputBar}>
      <TextInput
        style={[styles.textInput, { fontSize: fontSize(15) }]}
        value={input}
        onChangeText={onChangeInput}
        placeholder={editable ? placeholder : reasonHint || placeholder}
        placeholderTextColor={t.colors.placeholder}
        editable={editable}
        onSubmitEditing={hasText ? onSend : undefined}
        returnKeyType="send"
      />
      <TouchableOpacity
        style={[
          styles.trailingBtn,
          { width: btnSize, height: btnSize, borderRadius: btnSize / 2 },
          hasText ? styles.trailingBtnSend : styles.trailingBtnCall,
          !editable && styles.trailingBtnDisabled,
        ]}
        onPress={editable ? (hasText ? onSend : onCall) : undefined}
        activeOpacity={editable ? 0.7 : 1}
        disabled={!editable}
      >
        {hasText ? (
          <SendIcon size={iconSize} color="#FFFFFF" />
        ) : (
          <PhoneIcon size={iconSize} color="#FFFFFF" />
        )}
      </TouchableOpacity>
    </View>
  );
}

/** 通话面板：扁平一排 静音 / 打断 / 挂断（状态由上方状态条展示） */
function PhoneCallPanel(props: {
  readonly micMuted: boolean;
  readonly aiReplying: boolean;
  readonly onToggleMic: () => void;
  readonly onInterrupt: () => void;
  readonly onHangup: () => void;
}): React.JSX.Element {
  const { aiReplying, micMuted, onToggleMic, onInterrupt, onHangup } = props;

  return (
    <View style={styles.callPanel}>
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

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
  },
  callPanel: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
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
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: t.colors.paperDeep,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
    color: t.colors.ink,
  },
  trailingBtn: {
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  trailingBtnSend: {
    backgroundColor: t.colors.cinnabar,
    borderColor: t.colors.cinnabar,
  },
  trailingBtnCall: {
    backgroundColor: t.colors.call,
    borderColor: t.colors.call,
  },
  trailingBtnDisabled: {
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
