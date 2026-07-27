/**
 * KidsOverlayHeader — 暖纸笺 overlay 顶栏（与设置页一致）
 *
 * 标题 + 朱砂「返回」按钮，供我的画 / 我的游戏 / 聊天记录等子页复用。
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BackIcon } from "../../../components/KidsIcons";
import { kidsTheme as t } from "../../../theme/kidsTheme";

export interface KidsOverlayHeaderProps {
  readonly title: string;
  readonly onBack: () => void;
  /** 可选副标题（如「和宠物一起玩过的」） */
  readonly subtitle?: string;
}

/** 暖纸笺风格 overlay 顶栏 */
export function KidsOverlayHeader(props: KidsOverlayHeaderProps): React.JSX.Element {
  const { title, onBack, subtitle } = props;
  return (
    <View style={styles.header}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <TouchableOpacity style={styles.closeBtn} onPress={onBack} activeOpacity={0.7}>
        <BackIcon size={14} color={t.colors.cinnabar} />
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
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.cardBorder,
  },
  titleBlock: { flexShrink: 1, paddingRight: 12 },
  title: { color: t.colors.text, fontSize: t.font.title, fontWeight: "800" },
  subtitle: {
    color: t.colors.cloudGray,
    fontSize: t.font.hint,
    marginTop: 2,
    fontWeight: "600",
  },
  closeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: t.colors.paper,
    borderRadius: t.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: t.colors.cinnabarSoft,
  },
  closeText: { color: t.colors.cinnabar, fontSize: t.font.label, fontWeight: "700" },
});
