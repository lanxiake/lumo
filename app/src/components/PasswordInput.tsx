/**
 * PasswordInput — 带可见性切换的密码框（暖纸笺）
 */

import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { kidsTheme as t } from "../theme/kidsTheme";

export interface PasswordInputProps extends Omit<TextInputProps, "secureTextEntry"> {
  /** 输入框自定义样式 */
  readonly inputStyle?: TextInputProps["style"];
  /** 眼睛图标颜色 */
  readonly eyeColor?: string;
}

/** 密码输入：默认遮罩，点右侧文字切换可见 */
export function PasswordInput(props: PasswordInputProps): React.JSX.Element {
  const { style, inputStyle, eyeColor, ...rest } = props;
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.container, style]}>
      <TextInput
        {...rest}
        style={[styles.input, inputStyle]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        textContentType="password"
      />
      <Pressable
        style={styles.eye}
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.eyeText, eyeColor ? { color: eyeColor } : undefined]}>
          {visible ? "隐" : "显"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    position: "relative",
    justifyContent: "center",
    marginBottom: 12,
  },
  input: {
    width: "100%",
    backgroundColor: t.colors.paperDeep,
    borderRadius: t.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingRight: 48,
    color: t.colors.ink,
    fontSize: 15,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  eye: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  eyeText: {
    fontSize: 13,
    fontWeight: "700",
    color: t.colors.cloudGray,
  },
});
