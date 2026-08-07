/**
 * ChatHistoryScreen — 全屏聊天记录回顾（暖纸笺风格）
 *
 * 独立渲染所有对话记录，气泡式布局。区别于 HUD 迷你 ChatHistory。
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { ChildAvatarIcon, PetAvatarIcon } from "./components/AvatarIcons";
import { KidsOverlayHeader } from "./components/KidsOverlayHeader";
import { decodeEventMessage, eventCardLabel, EVENT_MESSAGE_ROLE, toolCardView } from "../../chat/eventMessage";
import type { ChildSafeScreen } from "../../hooks/useAppActions";
import { usePaginatedHistory } from "../../storage/usePaginatedHistory";
import { kidsTheme as t } from "../../theme/kidsTheme";

export interface ChatHistoryScreenProps {
  /** 会话标识（读持久化分页） */
  readonly sessionKey: string;
  readonly onClose: () => void;
  readonly onNavigate?: (target: ChildSafeScreen) => void;
}

/** 全屏聊天记录页 */
export function ChatHistoryScreen(props: ChatHistoryScreenProps): React.JSX.Element {
  const { sessionKey, onClose, onNavigate } = props;
  const scrollRef = useRef<ScrollView>(null);
  const { visible: paged, hasMore, loadOlder } = usePaginatedHistory({ sessionKey });
  const visible = paged.filter((m) => m.content.trim().length > 0);
  const lastId = visible[visible.length - 1]?.id;
  // 长按复制消息文本 + 短暂"已复制"反馈
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

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [lastId]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (hasMore && e.nativeEvent.contentOffset.y <= 4) loadOlder();
  };

  return (
    <View style={styles.container}>
      <KidsOverlayHeader title="聊天记录" onBack={onClose} />

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>还没有聊过天哦</Text>
          <Text style={styles.emptyHint}>和宠物说点什么吧~</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator
          onScroll={onScroll}
          scrollEventThrottle={100}
        >
          {hasMore && <Text style={styles.loadOlderHint}>下拉查看更早的聊天…</Text>}
          {visible.map((msg) => {
            if (msg.role === EVENT_MESSAGE_ROLE) {
              const event = decodeEventMessage(msg.content);
              if (!event) return null;
              const time = new Date(msg.createdAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              });
              if (event.kind === "tool_activity") {
                const view = toolCardView(event);
                return (
                  <View key={msg.id} style={styles.row}>
                    <View
                      style={[
                        styles.toolCard,
                        view.tone === "done" && styles.toolCardDone,
                        view.tone === "error" && styles.toolCardError,
                      ]}
                    >
                      <Text style={styles.toolIcon}>{view.icon}</Text>
                      <Text style={styles.toolLabel} numberOfLines={1}>
                        {view.label}
                      </Text>
                      <View
                        style={[
                          styles.toolBadge,
                          view.tone === "done" && styles.toolBadgeDone,
                          view.tone === "error" && styles.toolBadgeError,
                        ]}
                      >
                        <Text style={styles.toolBadgeText}>{view.statusText}</Text>
                      </View>
                      <Text style={styles.toolTime}>{time}</Text>
                    </View>
                  </View>
                );
              }
              const target: ChildSafeScreen = event.kind === "image_ready" ? "gallery" : "game_history";
              return (
                <View key={msg.id} style={styles.row}>
                  <TouchableOpacity
                    style={styles.eventCard}
                    activeOpacity={0.7}
                    onPress={() => onNavigate?.(target)}
                  >
                    <Text style={styles.eventText}>{eventCardLabel(event)}</Text>
                    <Text style={styles.time}>{time}</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            const isUser = msg.role === "user";
            const time = new Date(msg.createdAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <View key={msg.id} style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
                {!isUser && (
                  <View style={styles.avatar}>
                    <PetAvatarIcon size={20} />
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}
                  activeOpacity={0.7}
                  onLongPress={() => copyText(msg.id, msg.content)}
                  delayLongPress={300}
                >
                  <Text style={isUser ? styles.userText : styles.assistantText}>{msg.content}</Text>
                  <Text style={[styles.time, isUser && styles.timeOnAccent]}>
                    {copiedId === msg.id ? "已复制" : time}
                  </Text>
                </TouchableOpacity>
                {isUser && (
                  <View style={styles.avatar}>
                    <ChildAvatarIcon size={20} />
                  </View>
                )}
              </View>
            );
          })}
          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.colors.overlayBg,
    paddingTop: 16,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    color: t.colors.ink,
    fontSize: t.font.body,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyHint: {
    color: t.colors.cloudGray,
    fontSize: t.font.label,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  rowUser: {
    justifyContent: "flex-end",
  },
  rowAssistant: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.colors.paperDeep,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: t.colors.glassBorder,
  },
  bubble: {
    maxWidth: "70%",
    borderRadius: t.radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: t.colors.coral,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.glassBorder,
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: t.colors.textOnAccent,
    fontSize: 15,
    lineHeight: 22,
  },
  assistantText: {
    color: t.colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  time: {
    color: t.colors.cloudGray,
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
  timeOnAccent: {
    color: t.colors.white75,
  },
  bottomPad: {
    height: 40,
  },
  loadOlderHint: {
    color: t.colors.cloudGray,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
  },
  eventCard: {
    backgroundColor: t.colors.tealSoft,
    borderWidth: 1,
    borderColor: t.colors.tealOutline,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
  },
  eventText: {
    color: t.colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  // 工具调用卡片：图标 + 工具名 + 状态徽章 + 时间
  toolCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.primarySoft,
    borderWidth: 1,
    borderColor: t.colors.primary,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "90%",
  },
  toolCardDone: {
    backgroundColor: t.colors.tealSoft,
    borderColor: t.colors.tealOutlineStrong,
  },
  toolCardError: {
    backgroundColor: t.colors.errorSoft,
    borderColor: t.colors.errorOutline,
  },
  toolIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  toolLabel: {
    color: t.colors.ink,
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  toolBadge: {
    marginLeft: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: t.colors.primary,
  },
  toolBadgeDone: {
    backgroundColor: t.colors.tealSolid,
  },
  toolBadgeError: {
    backgroundColor: t.colors.errorSolid,
  },
  toolBadgeText: {
    color: t.colors.textOnAccent,
    fontSize: 11,
    fontWeight: "700",
  },
  toolTime: {
    color: t.colors.cloudGray,
    fontSize: 10,
    marginLeft: 8,
  },
});
