/**
 * ChatHistory — 输入框上方的聊天记录展示
 *
 * 最多展示最近 N 条消息，新消息到达自动滚动到底部。
 * 空记录时不渲染，不占用 HUD 空间。
 *
 * 事件卡片（image_ready / playground_open / tool_activity）：
 *  - 图画：渲染 data URI 缩略图 + 文案，点击进画廊。
 *  - 游戏：按 gameId 从 games 查 html，用非交互 WebView 渲染真实缩略图 + ▶，
 *    点击重玩；查不到 html 时退化为图标瓦片。
 *  - 工具过程：显示"正在画画…/✅ 画画好啦"，让孩子看到宠物在忙什么。
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import type { MessageRow } from "../../node-runtime/src/memory/local-session-memory";
import { decodeEventMessage, eventCardLabel, EVENT_MESSAGE_ROLE, toolCardView } from "./eventMessage";
import type { ChildSafeScreen, GalleryImage, GameEntry } from "../hooks/useAppActions";
import { kidsTheme as t } from "../theme/kidsTheme";

export interface ChatHistoryProps {
  /** 已分页可见消息（按时间正序；分页由 usePaginatedHistory 负责） */
  readonly messages: readonly MessageRow[];
  /** 字体缩放函数 */
  readonly fontScale: (base: number) => number;
  /** 是否还有更早记录可加载 */
  readonly hasMore?: boolean;
  /** 下拉到顶时加载更早一页 */
  readonly onLoadOlder?: () => void;
  /** 点击事件卡片时的导航回调（跳转画廊/游戏历史） */
  readonly onNavigate?: (target: ChildSafeScreen) => void;
  /** 画廊图片（用于图画缩略图取最新一张的兜底） */
  readonly images?: readonly GalleryImage[];
  /** 游戏历史（用于按 gameId 查 html 渲染游戏缩略图 / 点击重玩） */
  readonly games?: readonly GameEntry[];
  /** 点击游戏缩略图重玩 */
  readonly onReplayGame?: (game: GameEntry) => void;
  /** 覆盖默认高度上限（横屏用更小值，避免挤占输入框） */
  readonly maxHeight?: number;
}

export function ChatHistory(props: ChatHistoryProps): React.JSX.Element | null {
  const { messages, fontScale, hasMore, onLoadOlder, onNavigate, images, games, onReplayGame, maxHeight } = props;
  const scrollRef = useRef<ScrollView>(null);
  // 长按复制消息文本：copiedId 短暂标记被复制的气泡，显示"已复制"反馈。
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyText = useCallback((id: number, text: string) => {
    Clipboard.setString(text);
    setCopiedId(id);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
  }, []);
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);
  const visible = messages.filter(
    (m) => m.role === "user" || m.role === EVENT_MESSAGE_ROLE || m.content.trim().length > 0,
  );
  const lastId = visible[visible.length - 1]?.id;

  useEffect(() => {
    // 仅在最新消息变化时滚到底部（加载更早记录时最新 id 不变，不打断阅读）。
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [lastId]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (hasMore && onLoadOlder && e.nativeEvent.contentOffset.y <= 4) onLoadOlder();
  };

  if (visible.length === 0) return null;

  return (
    <View style={[styles.container, maxHeight != null && { maxHeight }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={100}
      >
        {hasMore && <Text style={styles.loadOlderHint}>下拉查看更早的聊天…</Text>}
        {visible.map((msg) => {
          if (msg.role === EVENT_MESSAGE_ROLE) {
            const event = decodeEventMessage(msg.content);
            if (!event) return null;

            if (event.kind === "image_ready") {
              const thumbUrl = event.url ?? images?.[images.length - 1]?.url;
              return (
                <TouchableOpacity
                  key={msg.id}
                  style={styles.mediaCard}
                  activeOpacity={0.8}
                  onPress={() => onNavigate?.("gallery")}
                >
                  {thumbUrl ? (
                    <Image
                      source={{ uri: thumbUrl }}
                      style={styles.mediaThumb}
                      resizeMode="cover"
                      // 64px 缩略图无需解码全尺寸原图：Android 按目标尺寸缩采样，
                      // 大幅降低 base64 大图的解码内存占用。
                      resizeMethod="resize"
                    />
                  ) : (
                    <View style={[styles.mediaThumb, styles.mediaThumbFallback]}>
                      <Text style={styles.mediaThumbIcon}>🎨</Text>
                    </View>
                  )}
                  <Text style={[styles.mediaText, { fontSize: fontScale(12) }]} numberOfLines={2}>
                    {eventCardLabel(event)}
                  </Text>
                </TouchableOpacity>
              );
            }

            if (event.kind === "playground_open") {
              // 静态图标瓦片：不再用实时 WebView 渲染游戏画面（每张卡片会常驻一个
              // Canvas + WebAudio + rAF 动画循环，是主要的内存/CPU 消耗源）。
              // 点击仍全屏重玩，体验不变。
              const game = event.gameId ? games?.find((g) => g.id === event.gameId) : undefined;
              return (
                <TouchableOpacity
                  key={msg.id}
                  style={styles.mediaCard}
                  activeOpacity={0.8}
                  onPress={() => (game && onReplayGame ? onReplayGame(game) : onNavigate?.("game_history"))}
                >
                  <View style={[styles.mediaThumb, styles.mediaThumbFallback]}>
                    <Text style={styles.mediaThumbIcon}>🎮</Text>
                    <View style={styles.playOverlay} pointerEvents="none">
                      <Text style={styles.playIcon}>▶</Text>
                    </View>
                  </View>
                  <Text style={[styles.mediaText, { fontSize: fontScale(12) }]} numberOfLines={2}>
                    {`🎮 ${event.title}，点击开玩`}
                  </Text>
                </TouchableOpacity>
              );
            }

            // tool_activity：图标 + 工具名 + 状态徽章（+ 可选入参/结果明细行）
            const view = toolCardView(event);
            return (
              <View
                key={msg.id}
                style={[
                  styles.toolCardWrap,
                  view.tone === "done" && styles.toolCardDone,
                  view.tone === "error" && styles.toolCardError,
                ]}
              >
                <View style={styles.toolCardRow}>
                  <Text style={[styles.toolIcon, { fontSize: fontScale(14) }]}>{view.icon}</Text>
                  <Text style={[styles.toolText, { fontSize: fontScale(12) }]} numberOfLines={1}>
                    {view.label}
                  </Text>
                  <View
                    style={[
                      styles.toolBadge,
                      view.tone === "done" && styles.toolBadgeDone,
                      view.tone === "error" && styles.toolBadgeError,
                    ]}
                  >
                    <Text style={[styles.toolBadgeText, { fontSize: fontScale(10) }]}>
                      {view.statusText}
                    </Text>
                  </View>
                </View>
                {view.detail ? (
                  <Text style={[styles.toolDetail, { fontSize: fontScale(10) }]} numberOfLines={3}>
                    {view.detail}
                  </Text>
                ) : null}
              </View>
            );
          }
          const isUser = msg.role === "user";
          return (
            <TouchableOpacity
              key={msg.id}
              style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}
              activeOpacity={0.7}
              onLongPress={() => copyText(msg.id, msg.content)}
              delayLongPress={300}
            >
              <Text style={[styles.text, { fontSize: fontScale(12) }]}>
                {msg.content}
              </Text>
              {copiedId === msg.id && (
                <Text style={[styles.copiedHint, { fontSize: fontScale(10) }]}>已复制</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const THUMB = 64;

const styles = StyleSheet.create({
  container: {
    maxHeight: 220,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  loadOlderHint: {
    color: t.colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingVertical: 4,
    gap: 4,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "88%",
    marginVertical: 2,
    shadowColor: t.colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(126, 200, 227, 0.35)",
    borderWidth: 0,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: t.colors.bubble,
    borderWidth: 0,
    borderBottomLeftRadius: 6,
  },
  text: {
    color: t.colors.text,
    lineHeight: 20,
    fontWeight: "600",
  },
  copiedHint: {
    color: t.colors.primary,
    fontWeight: "700",
    marginTop: 2,
    alignSelf: "flex-end",
  },
  // Soft Pop 图画/游戏缩略图卡片
  mediaCard: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(58, 175, 169, 0.16)",
    borderWidth: 0,
    borderRadius: 16,
    padding: 8,
    marginVertical: 2,
    maxWidth: "90%",
  },
  mediaThumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 12,
    overflow: "hidden",
    marginRight: 10,
    backgroundColor: t.colors.cardIconBg,
  },
  mediaThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  mediaThumbIcon: { fontSize: 28 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.12)",
  },
  playIcon: {
    color: "#FFFFFF",
    fontSize: 22,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  mediaText: {
    flex: 1,
    color: t.colors.text,
    lineHeight: 18,
    fontWeight: "700",
  },
  toolCardWrap: {
    alignSelf: "flex-start",
    backgroundColor: t.colors.primarySoft,
    borderWidth: 0,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 2,
    maxWidth: "88%",
  },
  toolCardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  toolDetail: {
    color: t.colors.textMuted,
    marginTop: 4,
    lineHeight: 14,
  },
  toolCardDone: {
    backgroundColor: t.colors.tealSoft,
  },
  toolCardError: {
    backgroundColor: "rgba(220, 120, 90, 0.12)",
  },
  toolIcon: {
    marginRight: 6,
  },
  toolText: {
    color: t.colors.text,
    lineHeight: 18,
    flexShrink: 1,
    fontWeight: "600",
  },
  toolBadge: {
    marginLeft: 8,
    borderRadius: t.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: t.colors.primary,
  },
  toolBadgeDone: {
    backgroundColor: "rgba(58, 175, 169, 0.9)",
  },
  toolBadgeError: {
    backgroundColor: "rgba(220, 120, 90, 0.9)",
  },
  toolBadgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
