/**
 * FloatStageControls — Soft Pop 右侧浮动工具
 *
 * 默认仅一个四宫格入口；展开后为统一圆形图标列（无文字）。
 * 不用全屏遮罩，避免挡住底部 HUD / 通话按钮的点击。
 */

import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { kidsTheme as t } from "../theme/kidsTheme";
import {
  CloseIcon,
  MenuGridIcon,
  MinusIcon,
  PawIcon,
  PlusIcon,
  ResetIcon,
  SceneIcon,
  SettingsIcon,
} from "./KidsIcons";

export interface FloatStageControlsProps {
  readonly petScale: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onReset: () => void;
  readonly modelLabel: string;
  readonly onCycleModel: () => void;
  readonly sceneLabel: string;
  readonly onCycleScene: () => void;
  readonly onOpenSettings: () => void;
  readonly isLandscape?: boolean;
}

const BTN = 44;

/**
 * 渲染可折叠的纯图标浮动工具条。
 */
export function FloatStageControls(props: FloatStageControlsProps): React.JSX.Element {
  const {
    petScale,
    onZoomIn,
    onZoomOut,
    onReset,
    modelLabel,
    onCycleModel,
    sceneLabel,
    onCycleScene,
    onOpenSettings,
    isLandscape,
  } = props;

  const [open, setOpen] = useState(false);
  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => setOpen(false), []);

  /** 执行动作后收起菜单（进入设置页时用；缩放/换场景等保持展开） */
  const runAndClose = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  return (
    <View
      style={[styles.cluster, isLandscape && styles.clusterLandscape]}
      pointerEvents="box-none"
    >
      {!open ? (
        <TouchableOpacity
          style={styles.trigger}
          onPress={openMenu}
          activeOpacity={0.8}
          accessibilityLabel="打开工具菜单"
        >
          <MenuGridIcon size={18} color={t.colors.ink} />
        </TouchableOpacity>
      ) : (
        <View style={styles.panel}>
          <IconBtn accessibilityLabel="收起" onPress={closeMenu} tone="muted">
            <CloseIcon size={15} color={t.colors.ink} />
          </IconBtn>

          <View style={styles.divider} />

          <IconBtn
            accessibilityLabel="设置"
            onPress={() => runAndClose(onOpenSettings)}
            tone="coral"
          >
            <SettingsIcon size={16} color={t.colors.textOnAccent} />
          </IconBtn>

          <IconBtn
            accessibilityLabel={`换形象：${modelLabel}`}
            onPress={onCycleModel}
            tone="lavender"
          >
            <PawIcon size={16} color={t.colors.textOnAccent} />
          </IconBtn>

          <IconBtn
            accessibilityLabel={`换场景：${sceneLabel}`}
            onPress={onCycleScene}
            tone="gold"
          >
            <SceneIcon size={15} color={t.colors.textOnAccent} />
          </IconBtn>

          <View style={styles.divider} />

          <IconBtn accessibilityLabel="缩小" onPress={onZoomOut} tone="glass">
            <MinusIcon size={15} color={t.colors.ink} />
          </IconBtn>

          <View style={styles.scaleBadge} accessibilityLabel={`缩放 ${Math.round(petScale * 100)}%`}>
            <Text style={styles.scaleText}>{Math.round(petScale * 100)}</Text>
          </View>

          <IconBtn accessibilityLabel="放大" onPress={onZoomIn} tone="glass">
            <PlusIcon size={15} color={t.colors.ink} />
          </IconBtn>

          <IconBtn accessibilityLabel="重置位置与缩放" onPress={onReset} tone="glass">
            <ResetIcon size={15} color={t.colors.ink} />
          </IconBtn>
        </View>
      )}
    </View>
  );
}

/** 统一圆形图标按钮 */
function IconBtn(props: {
  readonly children: React.ReactNode;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly tone: "glass" | "coral" | "lavender" | "gold" | "muted";
}): React.JSX.Element {
  const { children, onPress, accessibilityLabel, tone } = props;
  return (
    <TouchableOpacity
      style={[styles.iconBtn, toneStyles[tone]]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </TouchableOpacity>
  );
}

const toneStyles = StyleSheet.create({
  glass: {
    backgroundColor: t.colors.glassStrong,
  },
  muted: {
    backgroundColor: t.colors.paperDeep,
  },
  coral: {
    backgroundColor: t.colors.coral,
  },
  lavender: {
    backgroundColor: t.colors.lavender,
  },
  gold: {
    backgroundColor: t.colors.gold,
  },
});

const styles = StyleSheet.create({
  cluster: {
    position: "absolute",
    top: 48,
    right: 14,
    alignItems: "flex-end",
    zIndex: 8,
    elevation: 8,
  },
  clusterLandscape: {
    top: 8,
  },
  trigger: {
    width: BTN,
    height: BTN,
    borderRadius: 16,
    backgroundColor: t.colors.floatBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: t.colors.floatBorder,
    ...t.shadow.float,
  },
  panel: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 22,
    backgroundColor: t.colors.hudBg,
    borderWidth: 1,
    borderColor: t.colors.glassBorder,
    ...t.shadow.float,
  },
  iconBtn: {
    width: BTN,
    height: BTN,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    ...t.shadow.soft,
  },
  divider: {
    width: 22,
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.hairlineStrong,
    marginVertical: 2,
  },
  scaleBadge: {
    minWidth: 28,
    paddingVertical: 2,
    alignItems: "center",
  },
  scaleText: {
    color: t.colors.cloudGray,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
