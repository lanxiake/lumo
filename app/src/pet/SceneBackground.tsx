/**
 * SceneBackground — 可更换的儿童场景背景（零依赖，纯 RN View + emoji 装饰）
 *
 * Live2D 模型 WebView 背景透明，叠在本层之上。场景用纯色底 + 百分比定位的
 * emoji 装饰实现，无需图片资源；百分比定位天然适配横竖屏切换（旋转即重排）。
 *
 * 家长/儿童按场景切换按钮循环切换，选择持久化由上层负责。
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

/** 单个装饰：emoji + 百分比位置 + 字号 */
interface Decoration {
  readonly emoji: string;
  /** 左边距（视口宽百分比 0-100） */
  readonly left: number;
  /** 上边距（视口高百分比 0-100） */
  readonly top: number;
  readonly size: number;
}

export interface Scene {
  readonly id: string;
  readonly label: string;
  /** 底色（渐变用上下两段纯色 View 叠加模拟） */
  readonly topColor: string;
  readonly bottomColor: string;
  readonly decorations: readonly Decoration[];
}

/** 内置场景（草地/星空/海滩/太空），均儿童友好；label 纯文字供 HUD，装饰 emoji 仅在场景层 */
export const SCENES: readonly Scene[] = [
  {
    id: "meadow",
    label: "草地",
    topColor: "#8FD3F4",
    bottomColor: "#A8E063",
    decorations: [
      { emoji: "☀️", left: 78, top: 8, size: 52 },
      { emoji: "☁️", left: 12, top: 12, size: 44 },
      { emoji: "☁️", left: 55, top: 18, size: 36 },
      { emoji: "🌳", left: 6, top: 62, size: 60 },
      { emoji: "🌳", left: 82, top: 66, size: 56 },
      { emoji: "🌸", left: 22, top: 82, size: 30 },
      { emoji: "🦋", left: 68, top: 40, size: 32 },
      { emoji: "🌼", left: 88, top: 85, size: 28 },
    ],
  },
  {
    id: "night",
    label: "星空",
    topColor: "#0F2027",
    bottomColor: "#2C5364",
    decorations: [
      { emoji: "🌙", left: 76, top: 10, size: 54 },
      { emoji: "⭐", left: 15, top: 14, size: 26 },
      { emoji: "✨", left: 40, top: 8, size: 24 },
      { emoji: "⭐", left: 60, top: 22, size: 20 },
      { emoji: "✨", left: 85, top: 32, size: 22 },
      { emoji: "⭐", left: 10, top: 40, size: 18 },
      { emoji: "🌟", left: 30, top: 30, size: 24 },
    ],
  },
  {
    id: "beach",
    label: "海滩",
    topColor: "#2BC0E4",
    bottomColor: "#EACDA3",
    decorations: [
      { emoji: "☀️", left: 12, top: 10, size: 52 },
      { emoji: "☁️", left: 62, top: 12, size: 40 },
      { emoji: "⛱️", left: 78, top: 60, size: 56 },
      { emoji: "🌊", left: 8, top: 52, size: 40 },
      { emoji: "🐚", left: 30, top: 84, size: 30 },
      { emoji: "🦀", left: 60, top: 86, size: 30 },
      { emoji: "⭐", left: 45, top: 78, size: 24 },
    ],
  },
  {
    id: "space",
    label: "太空",
    topColor: "#0B0B2B",
    bottomColor: "#3A1C71",
    decorations: [
      { emoji: "🪐", left: 72, top: 14, size: 52 },
      { emoji: "🚀", left: 14, top: 60, size: 48 },
      { emoji: "⭐", left: 40, top: 10, size: 22 },
      { emoji: "✨", left: 60, top: 40, size: 24 },
      { emoji: "🌟", left: 22, top: 26, size: 26 },
      { emoji: "🌍", left: 82, top: 74, size: 40 },
      { emoji: "☄️", left: 34, top: 46, size: 30 },
    ],
  },
  {
    id: "forest",
    label: "森林",
    topColor: "#A8E6CF",
    bottomColor: "#56C596",
    decorations: [
      { emoji: "🌲", left: 8, top: 55, size: 60 },
      { emoji: "🌲", left: 84, top: 60, size: 56 },
      { emoji: "🍄", left: 30, top: 84, size: 34 },
      { emoji: "🦌", left: 60, top: 66, size: 48 },
      { emoji: "🐿️", left: 20, top: 44, size: 30 },
      { emoji: "🍃", left: 70, top: 20, size: 28 },
      { emoji: "☀️", left: 78, top: 10, size: 44 },
    ],
  },
  {
    id: "ocean",
    label: "海底",
    topColor: "#48CAE4",
    bottomColor: "#0077B6",
    decorations: [
      { emoji: "🐠", left: 20, top: 40, size: 40 },
      { emoji: "🐟", left: 70, top: 30, size: 34 },
      { emoji: "🐙", left: 78, top: 70, size: 48 },
      { emoji: "🐚", left: 30, top: 86, size: 30 },
      { emoji: "🌊", left: 8, top: 12, size: 40 },
      { emoji: "🪸", left: 55, top: 82, size: 36 },
      { emoji: "🫧", left: 45, top: 52, size: 24 },
    ],
  },
  {
    id: "candy",
    label: "糖果",
    topColor: "#FFD3E0",
    bottomColor: "#FF9EBB",
    decorations: [
      { emoji: "🍭", left: 14, top: 20, size: 48 },
      { emoji: "🍬", left: 76, top: 24, size: 40 },
      { emoji: "🧁", left: 20, top: 78, size: 44 },
      { emoji: "🍩", left: 72, top: 74, size: 44 },
      { emoji: "🌈", left: 44, top: 10, size: 44 },
      { emoji: "🍦", left: 52, top: 60, size: 38 },
      { emoji: "⭐", left: 34, top: 40, size: 24 },
    ],
  },
  {
    id: "city",
    label: "城市",
    topColor: "#F6D365",
    bottomColor: "#FDA085",
    decorations: [
      { emoji: "🏙️", left: 10, top: 58, size: 56 },
      { emoji: "🏢", left: 78, top: 60, size: 52 },
      { emoji: "🚗", left: 30, top: 86, size: 34 },
      { emoji: "🚦", left: 60, top: 80, size: 34 },
      { emoji: "☁️", left: 20, top: 14, size: 40 },
      { emoji: "🎈", left: 68, top: 24, size: 34 },
      { emoji: "☀️", left: 84, top: 12, size: 44 },
    ],
  },
];

export interface SceneBackgroundProps {
  /** 场景 id；未匹配时用第一个场景 */
  readonly sceneId: string;
}

export function SceneBackground(props: SceneBackgroundProps): React.JSX.Element {
  const scene = SCENES.find((s) => s.id === props.sceneId) ?? SCENES[0];
  return (
    <View style={styles.fill} pointerEvents="none">
      <View style={[styles.half, { backgroundColor: scene.topColor }]} />
      <View style={[styles.half, { backgroundColor: scene.bottomColor }]} />
      {scene.decorations.map((d, i) => (
        <Text
          key={`${scene.id}-${i}`}
          style={[
            styles.deco,
            { left: `${d.left}%`, top: `${d.top}%`, fontSize: d.size },
          ]}
        >
          {d.emoji}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  half: { flex: 1 },
  deco: { position: "absolute" },
});
