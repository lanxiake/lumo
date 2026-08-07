/**
 * SceneBackground — Soft Pop 沉浸场景背景
 *
 * 零依赖：多层色带 + 半透明光斑（blob）模拟宣传图里的软渐变氛围，
 * 不再使用 emoji 贴纸，避免「剪贴画」感。百分比定位适配横竖屏。
 */

import React from "react";
import { StyleSheet, View } from "react-native";

/** 柔光斑：百分比定位的椭圆色块 */
interface SoftBlob {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly opacity?: number;
}

/** 细闪点（星空等场景） */
interface Sparkle {
  readonly left: number;
  readonly top: number;
  readonly size: number;
}

export interface Scene {
  readonly id: string;
  readonly label: string;
  /** 天空 / 中景 / 地面三层色带 */
  readonly topColor: string;
  readonly midColor: string;
  readonly bottomColor: string;
  readonly blobs: readonly SoftBlob[];
  readonly sparkles?: readonly Sparkle[];
  /** 深色场景时状态栏文字宜浅色（由上层自行选用） */
  readonly dark?: boolean;
}

/**
 * 内置 Soft Pop 场景：保留旧 id 兼容持久化，并新增多种风格。
 */
export const SCENES: readonly Scene[] = [
  {
    id: "beach",
    label: "海滩",
    topColor: "#9AD7F5",
    midColor: "#B8E4F2",
    bottomColor: "#F0CFA0",
    blobs: [
      { left: 8, top: 8, width: 120, height: 120, color: "#FFDC8C", opacity: 0.75 },
      { left: 70, top: 12, width: 90, height: 70, color: "#FFFFFF", opacity: 0.45 },
      { left: 4, top: 48, width: 130, height: 70, color: "#5ABEE6", opacity: 0.4 },
      { left: 68, top: 58, width: 100, height: 100, color: "#FF8C78", opacity: 0.22 },
    ],
  },
  {
    id: "meadow",
    label: "草地",
    topColor: "#8FD3F4",
    midColor: "#A8E4C8",
    bottomColor: "#B8E063",
    blobs: [
      { left: 72, top: 6, width: 110, height: 110, color: "#FFE696", opacity: 0.8 },
      { left: 10, top: 16, width: 80, height: 60, color: "#FFFFFF", opacity: 0.5 },
      { left: 20, top: 62, width: 140, height: 90, color: "#7BC96A", opacity: 0.35 },
      { left: 60, top: 70, width: 100, height: 70, color: "#FFE0A0", opacity: 0.25 },
    ],
  },
  {
    id: "night",
    label: "星空",
    topColor: "#0F2027",
    midColor: "#203A43",
    bottomColor: "#2C5364",
    dark: true,
    blobs: [
      { left: 70, top: 8, width: 70, height: 70, color: "#FFF5C8", opacity: 0.45 },
      { left: 20, top: 24, width: 100, height: 80, color: "#78A0FF", opacity: 0.18 },
      { left: 50, top: 55, width: 120, height: 90, color: "#1A3A50", opacity: 0.5 },
    ],
    sparkles: [
      { left: 18, top: 16, size: 4 },
      { left: 42, top: 10, size: 3 },
      { left: 62, top: 22, size: 5 },
      { left: 78, top: 36, size: 3 },
      { left: 30, top: 34, size: 4 },
      { left: 88, top: 14, size: 3 },
    ],
  },
  {
    id: "space",
    label: "太空",
    topColor: "#0B0B2B",
    midColor: "#1A1040",
    bottomColor: "#3A1C71",
    dark: true,
    blobs: [
      { left: 64, top: 10, width: 90, height: 90, color: "#C9B6F2", opacity: 0.35 },
      { left: 12, top: 40, width: 80, height: 80, color: "#5B8DEF", opacity: 0.25 },
      { left: 40, top: 60, width: 130, height: 100, color: "#FF7A9A", opacity: 0.15 },
    ],
    sparkles: [
      { left: 15, top: 12, size: 3 },
      { left: 35, top: 8, size: 4 },
      { left: 55, top: 18, size: 3 },
      { left: 75, top: 28, size: 5 },
      { left: 48, top: 40, size: 3 },
      { left: 22, top: 50, size: 4 },
    ],
  },
  {
    id: "forest",
    label: "森林",
    topColor: "#A8E6CF",
    midColor: "#7ED9A8",
    bottomColor: "#56C596",
    blobs: [
      { left: 76, top: 6, width: 90, height: 90, color: "#FFE8A0", opacity: 0.7 },
      { left: 2, top: 50, width: 100, height: 120, color: "#2F9E6E", opacity: 0.35 },
      { left: 72, top: 52, width: 90, height: 110, color: "#3CB878", opacity: 0.3 },
      { left: 30, top: 70, width: 110, height: 70, color: "#C8F0A8", opacity: 0.3 },
    ],
  },
  {
    id: "ocean",
    label: "海底",
    topColor: "#48CAE4",
    midColor: "#0096C7",
    bottomColor: "#0077B6",
    blobs: [
      { left: 10, top: 20, width: 70, height: 70, color: "#90E0EF", opacity: 0.45 },
      { left: 60, top: 30, width: 90, height: 60, color: "#00B4D8", opacity: 0.4 },
      { left: 20, top: 65, width: 120, height: 80, color: "#023E8A", opacity: 0.25 },
      { left: 70, top: 70, width: 80, height: 80, color: "#48CAE4", opacity: 0.35 },
    ],
    sparkles: [
      { left: 40, top: 45, size: 4 },
      { left: 55, top: 58, size: 3 },
      { left: 28, top: 72, size: 3 },
    ],
  },
  {
    id: "candy",
    label: "糖果",
    topColor: "#FFD3E0",
    midColor: "#FFB7C5",
    bottomColor: "#FF9EBB",
    blobs: [
      { left: 8, top: 12, width: 80, height: 80, color: "#C9B6F2", opacity: 0.45 },
      { left: 68, top: 16, width: 90, height: 70, color: "#FFE08A", opacity: 0.5 },
      { left: 20, top: 60, width: 100, height: 90, color: "#FF8FAB", opacity: 0.35 },
      { left: 65, top: 62, width: 110, height: 90, color: "#A8E6CF", opacity: 0.3 },
    ],
  },
  {
    id: "city",
    label: "城市",
    topColor: "#F6D365",
    midColor: "#F8B195",
    bottomColor: "#FDA085",
    blobs: [
      { left: 78, top: 6, width: 100, height: 100, color: "#FFE8A8", opacity: 0.7 },
      { left: 8, top: 18, width: 90, height: 60, color: "#FFFFFF", opacity: 0.4 },
      { left: 5, top: 55, width: 90, height: 130, color: "#E8956A", opacity: 0.28 },
      { left: 70, top: 52, width: 80, height: 140, color: "#F07868", opacity: 0.22 },
    ],
  },
  {
    id: "aurora",
    label: "极光",
    topColor: "#0D1B2A",
    midColor: "#1B4332",
    bottomColor: "#081C15",
    dark: true,
    blobs: [
      { left: 10, top: 18, width: 160, height: 70, color: "#52B788", opacity: 0.4 },
      { left: 40, top: 10, width: 140, height: 60, color: "#80FFDB", opacity: 0.28 },
      { left: 55, top: 28, width: 120, height: 50, color: "#7B2CBF", opacity: 0.25 },
      { left: 20, top: 60, width: 100, height: 80, color: "#144552", opacity: 0.45 },
    ],
    sparkles: [
      { left: 20, top: 10, size: 3 },
      { left: 50, top: 8, size: 4 },
      { left: 80, top: 16, size: 3 },
      { left: 35, top: 22, size: 3 },
    ],
  },
  {
    id: "sunset",
    label: "晚霞",
    topColor: "#FF9A8B",
    midColor: "#FF6A88",
    bottomColor: "#FF99AC",
    blobs: [
      { left: 60, top: 8, width: 130, height: 130, color: "#FFD166", opacity: 0.65 },
      { left: 5, top: 30, width: 120, height: 80, color: "#F72585", opacity: 0.2 },
      { left: 30, top: 55, width: 160, height: 100, color: "#FFB4A2", opacity: 0.35 },
      { left: 70, top: 65, width: 90, height: 80, color: "#E36414", opacity: 0.2 },
    ],
  },
  {
    id: "sakura",
    label: "樱花",
    topColor: "#FFE5EC",
    midColor: "#FFC2D1",
    bottomColor: "#FB6F92",
    blobs: [
      { left: 70, top: 8, width: 100, height: 100, color: "#FFCAD4", opacity: 0.7 },
      { left: 8, top: 20, width: 80, height: 60, color: "#FFFFFF", opacity: 0.55 },
      { left: 15, top: 55, width: 90, height: 100, color: "#FF8FAB", opacity: 0.35 },
      { left: 65, top: 58, width: 100, height: 110, color: "#FFB3C6", opacity: 0.4 },
      { left: 40, top: 35, width: 50, height: 50, color: "#FFFFFF", opacity: 0.35 },
    ],
  },
  {
    id: "lavender",
    label: "薰衣草",
    topColor: "#E0C3FC",
    midColor: "#C9B6F2",
    bottomColor: "#8E7CC3",
    blobs: [
      { left: 72, top: 10, width: 100, height: 100, color: "#FFF1B8", opacity: 0.55 },
      { left: 8, top: 22, width: 90, height: 70, color: "#FFFFFF", opacity: 0.4 },
      { left: 10, top: 55, width: 110, height: 100, color: "#9B7DE8", opacity: 0.35 },
      { left: 60, top: 60, width: 120, height: 90, color: "#B8A0E8", opacity: 0.3 },
    ],
  },
  {
    id: "peach_sky",
    label: "蜜桃",
    topColor: "#FFE5D9",
    midColor: "#FFCAD4",
    bottomColor: "#F4A261",
    blobs: [
      { left: 65, top: 6, width: 120, height: 120, color: "#FFB703", opacity: 0.45 },
      { left: 5, top: 18, width: 100, height: 70, color: "#FFFFFF", opacity: 0.5 },
      { left: 20, top: 58, width: 130, height: 90, color: "#E76F51", opacity: 0.22 },
      { left: 68, top: 62, width: 100, height: 80, color: "#F4A261", opacity: 0.3 },
    ],
  },
  {
    id: "snow",
    label: "雪原",
    topColor: "#D6EAF8",
    midColor: "#EBF5FB",
    bottomColor: "#FDFEFE",
    blobs: [
      { left: 70, top: 8, width: 90, height: 90, color: "#F9E79F", opacity: 0.55 },
      { left: 8, top: 16, width: 110, height: 70, color: "#FFFFFF", opacity: 0.7 },
      { left: 40, top: 28, width: 80, height: 50, color: "#FFFFFF", opacity: 0.55 },
      { left: 15, top: 62, width: 140, height: 80, color: "#AED6F1", opacity: 0.3 },
    ],
    sparkles: [
      { left: 25, top: 40, size: 4 },
      { left: 55, top: 48, size: 3 },
      { left: 78, top: 55, size: 4 },
      { left: 35, top: 70, size: 3 },
    ],
  },
];

export interface SceneBackgroundProps {
  /** 场景 id；未匹配时用第一个场景 */
  readonly sceneId: string;
}

/**
 * 渲染 Soft Pop 多层色带 + 光斑背景。
 */
export function SceneBackground(props: SceneBackgroundProps): React.JSX.Element {
  const scene = SCENES.find((s) => s.id === props.sceneId) ?? SCENES[0];

  return (
    <View style={styles.fill} pointerEvents="none">
      <View style={[styles.fillAbs, { backgroundColor: scene.topColor }]} />
      <View style={[styles.midBand, { backgroundColor: scene.midColor }]} />
      <View style={[styles.bottomBand, { backgroundColor: scene.bottomColor }]} />

      {scene.blobs.map((blob, i) => (
        <View
          key={`${scene.id}-blob-${i}`}
          style={[
            styles.blob,
            {
              left: `${blob.left}%`,
              top: `${blob.top}%`,
              width: blob.width,
              height: blob.height,
              backgroundColor: blob.color,
              opacity: blob.opacity ?? 0.4,
              borderRadius: Math.max(blob.width, blob.height) / 2,
            },
          ]}
        />
      ))}

      {(scene.sparkles ?? []).map((sp, i) => (
        <View
          key={`${scene.id}-sp-${i}`}
          style={[
            styles.sparkle,
            {
              left: `${sp.left}%`,
              top: `${sp.top}%`,
              width: sp.size,
              height: sp.size,
              borderRadius: sp.size / 2,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  fillAbs: { ...StyleSheet.absoluteFillObject },
  midBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "34%",
    bottom: 0,
    opacity: 0.92,
  },
  bottomBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "56%",
    bottom: 0,
  },
  blob: {
    position: "absolute",
  },
  sparkle: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    opacity: 0.85,
  },
});
