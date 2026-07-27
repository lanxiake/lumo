/**
 * AvatarIcons — 聊天记录头像（纯 View 矢量图标）
 *
 * 替代 emoji 头像（🐱/👶），用 View 组合出猫脸/小朋友头像，风格对齐
 * ChatControls.tsx 中 KeyboardIcon/PhoneIcon/MicIcon 的做法。
 */

import React from "react";
import { View, StyleSheet } from "react-native";

const PET_COLOR = "#7FD0FF";
const CHILD_COLOR = "#FFB37F";
const BASE_SIZE = 32;

export interface AvatarIconProps {
  /** 图标容器边长（px），内部子元素按 32px 基准等比缩放。默认 32 */
  readonly size?: number;
}

export function PetAvatarIcon({ size = BASE_SIZE }: AvatarIconProps): React.JSX.Element {
  const scale = size / BASE_SIZE;
  return (
    <View style={[petIconStyles.container, { width: size, height: size }]}>
      <View style={{ transform: [{ scale }] }}>
        <View style={petIconStyles.inner}>
          <View style={[petIconStyles.ear, petIconStyles.earLeft]} />
          <View style={[petIconStyles.ear, petIconStyles.earRight]} />
          <View style={petIconStyles.face}>
            <View style={[petIconStyles.eye, petIconStyles.eyeLeft]} />
            <View style={[petIconStyles.eye, petIconStyles.eyeRight]} />
            <View style={petIconStyles.nose} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function ChildAvatarIcon({ size = BASE_SIZE }: AvatarIconProps): React.JSX.Element {
  const scale = size / BASE_SIZE;
  return (
    <View style={[childIconStyles.container, { width: size, height: size }]}>
      <View style={{ transform: [{ scale }] }}>
        <View style={childIconStyles.inner}>
          <View style={childIconStyles.head} />
          <View style={childIconStyles.body} />
        </View>
      </View>
    </View>
  );
}

const petIconStyles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  ear: {
    position: "absolute",
    top: 1,
    width: 8,
    height: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: PET_COLOR,
  },
  earLeft: {
    left: 4,
    transform: [{ rotate: "-20deg" }],
  },
  earRight: {
    right: 4,
    transform: [{ rotate: "20deg" }],
  },
  face: {
    width: 24,
    height: 22,
    borderRadius: 12,
    backgroundColor: PET_COLOR,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  eye: {
    position: "absolute",
    top: 8,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#0A1220",
  },
  eyeLeft: {
    left: 7,
  },
  eyeRight: {
    right: 7,
  },
  nose: {
    width: 4,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#0A1220",
    marginTop: 4,
  },
});

const childIconStyles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  inner: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  head: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: CHILD_COLOR,
    marginBottom: 1,
  },
  body: {
    width: 24,
    height: 14,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: CHILD_COLOR,
  },
});
