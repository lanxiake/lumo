/**
 * VoiceButton.tsx — 科技风语音按钮（按住说话）
 *
 * 交互：
 *  - onPressIn（按住）：触发 onStart，状态机进入 listening
 *  - onPressOut（松开）：触发 onStop，状态机进入 thinking，等待 STT 结果
 *
 * 视觉（科技风）：
 *  - 未按住：深色半透明圆环 + 中心麦克风几何图标 + 柔和发光
 *  - 按住中：脉冲扩散动画 + 青色高亮发光 + "聆听中…"
 *  - 禁用态：置灰无发光
 */

import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export interface VoiceButtonProps {
  /** 是否正在识别 */
  readonly listening: boolean;
  /** 是否可用（设备支持 + 已配对 + 会话就绪） */
  readonly enabled: boolean;
  /** 是否已配对（用于未启用时显示更准确的提示） */
  readonly provisioned?: boolean;
  /** STT 是否可用（null 表示检测中） */
  readonly sttAvailable?: boolean | null;
  /** 按住回调 */
  readonly onPressIn: () => void;
  /** 松开回调 */
  readonly onPressOut: () => void;
}

/** 几何麦克风图标（纯 View 绘制，零外部图标依赖） */
export function MicIcon({ active }: { readonly active: boolean }): React.JSX.Element {
  const color = active ? "#00F0FF" : "#C0D0E0";
  return (
    <View style={micStyles.container}>
      {/* 麦克风头：圆角矩形 */}
      <View style={[micStyles.head, { borderColor: color }]} />
      {/* 麦克风支架：U 形弧线（用半个圆环模拟） */}
      <View style={[micStyles.stand, { borderColor: color }]} />
      {/* 竖杆 */}
      <View style={[micStyles.stem, { backgroundColor: color }]} />
      {/* 底座 */}
      <View style={[micStyles.base, { backgroundColor: color }]} />
    </View>
  );
}

export function VoiceButton(props: VoiceButtonProps): React.JSX.Element {
  const { listening, enabled, provisioned, sttAvailable, onPressIn, onPressOut } = props;

  // 脉冲动画：按住时外圈持续扩散
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!listening) {
      pulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulseAnim]);

  const ringScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const ringOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  return (
    <Pressable
      onPressIn={enabled ? onPressIn : undefined}
      onPressOut={enabled ? onPressOut : undefined}
      disabled={!enabled}
      style={styles.wrapper}
    >
      {/* 脉冲光环 */}
      {listening && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />
      )}

      {/* 主按钮 */}
      <View style={[styles.btn, listening && styles.btnActive, !enabled && styles.btnDisabled]}>
        <MicIcon active={listening} />
      </View>

      {/* 状态文字 */}
      <Text style={[styles.label, listening && styles.labelActive, !enabled && styles.labelDisabled]}>
        {listening
          ? "聆听中…"
          : enabled
            ? "按住说话"
            : provisioned === false
              ? "请先配对"
              : sttAvailable === false
                ? "语音未就绪"
                : "未就绪"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginVertical: 6,
  },
  pulseRing: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "#00F0FF",
  },
  btn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(20, 30, 50, 0.85)",
    borderWidth: 1.5,
    borderColor: "rgba(120, 160, 220, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    // 柔和发光（未按住）
    shadowColor: "#78A0DC",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  btnActive: {
    backgroundColor: "rgba(0, 40, 60, 0.95)",
    borderColor: "#00F0FF",
    shadowColor: "#00F0FF",
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  btnDisabled: {
    backgroundColor: "rgba(60, 60, 70, 0.5)",
    borderColor: "rgba(150, 150, 160, 0.3)",
    shadowOpacity: 0,
    elevation: 0,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: "#A0B0C0",
    letterSpacing: 0.5,
  },
  labelActive: {
    color: "#00F0FF",
  },
  labelDisabled: {
    color: "#707080",
  },
});

const micStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
  },
  head: {
    width: 12,
    height: 16,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  stand: {
    position: "absolute",
    top: 10,
    width: 18,
    height: 12,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderTopWidth: 0,
    backgroundColor: "transparent",
  },
  stem: {
    position: "absolute",
    top: 22,
    width: 2,
    height: 6,
    borderRadius: 1,
  },
  base: {
    position: "absolute",
    top: 27,
    width: 10,
    height: 2,
    borderRadius: 1,
  },
});
