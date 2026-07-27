/**
 * Toast — 全局提示气泡
 *
 * 儿童使用场景：位置在屏幕上方，大圆角、大字体、高对比背景，
 * 3 秒后自动消失。新的 Toast 覆盖旧的。
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ToastStyle } from "../hooks/useAppActions";

export interface ToastProps {
  readonly visible: boolean;
  readonly text: string;
  readonly style: ToastStyle;
}

const STYLE_COLORS: Record<ToastStyle, string> = {
  info: "rgba(0, 120, 220, 0.92)",
  success: "rgba(34, 170, 90, 0.92)",
  hint: "rgba(240, 150, 40, 0.92)",
};

export function Toast(props: ToastProps): React.JSX.Element | null {
  if (!props.visible || !props.text) return null;

  return (
    <View style={[styles.container, { backgroundColor: STYLE_COLORS[props.style] }]}>
      <Text style={styles.text} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
        {props.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 56,
    left: "10%",
    right: "10%",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
