/**
 * KidsOverlayHeader — Soft Pop overlay 顶栏
 *
 * 毛玻璃返回钮 + 清晰标题层级，供设置子页复用。
 * 样式来自 themeStyles，与设置页保持同一色系。
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BackIcon } from "../../../components/KidsIcons";
import { kidsTheme as t, themeStyles as ts } from "../../../theme/kidsTheme";

export interface KidsOverlayHeaderProps {
  readonly title: string;
  readonly onBack: () => void;
  /** 可选副标题（如「和宠物一起玩过的」） */
  readonly subtitle?: string;
}

/** Soft Pop 风格 overlay 顶栏 */
export function KidsOverlayHeader(props: KidsOverlayHeaderProps): React.JSX.Element {
  const { title, onBack, subtitle } = props;
  return (
    <View style={styles.header}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.titleAccent} />
      </View>
      <TouchableOpacity style={styles.closeBtn} onPress={onBack} activeOpacity={0.75}>
        <BackIcon size={14} color={t.colors.ink} />
        <Text style={styles.closeText}>返回</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.hairline,
  },
  titleBlock: { flexShrink: 1, paddingRight: 12 },
  title: {
    color: t.colors.text,
    fontSize: t.font.title,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  subtitle: {
    color: t.colors.cloudGray,
    fontSize: t.font.hint,
    marginTop: 3,
    fontWeight: "600",
  },
  titleAccent: { ...ts.titleAccent },
  closeBtn: { ...ts.btnGhost },
  closeText: { ...ts.btnGhostText },
});
