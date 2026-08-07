/**
 * GameHistoryScreen — 我的游戏（暖纸笺风格）
 *
 * 推荐内置精品 + 历史生成的小游戏；点击重玩，长按/删除按钮可删。
 */

import React, { useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import type { GameEntry } from "../../hooks/useAppActions";
import { BUILTIN_GAMES, type BuiltinGame } from "../../games/builtinGames";
import { GameIcon } from "../../components/KidsIcons";
import { kidsTheme as t } from "../../theme/kidsTheme";
import { KidsOverlayHeader } from "./components/KidsOverlayHeader";

export interface GameHistoryScreenProps {
  readonly games: readonly GameEntry[];
  readonly onClose: () => void;
  readonly onReplay: (game: GameEntry) => void;
  readonly onDelete: (id: string) => void;
  /** 点击推荐（内置）游戏直接开玩 */
  readonly onPlayBuiltin?: (game: BuiltinGame) => void;
}

/** 我的游戏列表页 */
export function GameHistoryScreen(props: GameHistoryScreenProps): React.JSX.Element {
  const { games, onClose, onReplay, onDelete, onPlayBuiltin } = props;

  const confirmDelete = useCallback(
    (game: GameEntry) => {
      Alert.alert("删除游戏", `确定要删除「${game.title}」吗？`, [
        { text: "取消", style: "cancel" },
        { text: "删除", style: "destructive", onPress: () => onDelete(game.id) },
      ]);
    },
    [onDelete],
  );

  return (
    <View style={styles.container}>
      <KidsOverlayHeader title="我的游戏" onBack={onClose} />

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator>
        <Text style={styles.sectionTitle}>推荐游戏</Text>
        <View style={styles.recommendGrid}>
          {BUILTIN_GAMES.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={styles.recommendCard}
              onPress={() => onPlayBuiltin?.(g)}
              activeOpacity={0.8}
            >
              <Text style={styles.recommendIcon}>{g.icon}</Text>
              <Text style={styles.recommendTitle} numberOfLines={1}>
                {g.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>我玩过的</Text>
        {games.length === 0 ? (
          <View style={styles.emptyInline}>
            <Text style={styles.emptyHint}>还没有玩过自己的游戏哦，让宠物给你做一个吧~</Text>
          </View>
        ) : (
          [...games].reverse().map((game) => (
            <TouchableOpacity
              key={game.id}
              style={styles.card}
              onPress={() => onReplay(game)}
              onLongPress={() => confirmDelete(game)}
              activeOpacity={0.8}
            >
              <View style={styles.cardIcon}>
                <GameIcon size={22} color={t.colors.ink} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {game.title}
                </Text>
                <Text style={styles.cardTime}>
                  {new Date(game.createdAt).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => confirmDelete(game)}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteText}>删除</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.colors.overlayBg,
    paddingTop: 16,
  },
  list: { paddingHorizontal: t.space.screenX, paddingBottom: 48 },
  sectionTitle: {
    color: t.colors.cloudGray,
    fontSize: t.font.section,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 16,
    marginBottom: 10,
    paddingLeft: 4,
    textTransform: "uppercase",
  },
  recommendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  recommendCard: {
    width: "31%",
    aspectRatio: 1,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.chip,
    borderWidth: 1,
    borderColor: t.colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    ...t.shadow.soft,
  },
  recommendIcon: { fontSize: 30, marginBottom: 6 },
  recommendTitle: {
    color: t.colors.ink,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  emptyInline: {
    paddingVertical: 20,
    paddingHorizontal: 8,
    alignItems: "center",
    backgroundColor: t.colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.colors.glassBorder,
  },
  emptyHint: {
    color: t.colors.cloudGray,
    fontSize: t.font.label,
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: t.colors.glassBorder,
    ...t.shadow.card,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: t.colors.iconWellCoral,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardBody: { flex: 1 },
  cardTitle: {
    color: t.colors.ink,
    fontSize: t.font.body,
    fontWeight: "700",
    marginBottom: 3,
  },
  cardTime: { color: t.colors.cloudGray, fontSize: t.font.hint },
  deleteBtn: {
    backgroundColor: t.colors.cinnabarSoft,
    borderRadius: t.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: t.colors.cinnabarSoft,
  },
  deleteText: { color: t.colors.cinnabar, fontSize: 12, fontWeight: "600" },
});
