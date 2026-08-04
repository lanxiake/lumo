/**
 * SystemLogsScreen — 系统运行/错误日志查看与导出（设置入口）
 *
 * 展示 Node 侧 SystemLogBuffer 回传的运行日志，支持按级别筛选、导出分享。
 * lumo 无性能 span 子系统，故仅日志（info/warn/error），比 kids-mobile 更精简。
 */

import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { SystemLogLineWire } from "../../../node-runtime/src/bridge/schema";
import { kidsTheme as t } from "../../theme/kidsTheme";
import { BackIcon } from "../../components/KidsIcons";

export interface SystemLogsScreenProps {
  readonly onClose: () => void;
  readonly requestLogs: () => void;
  readonly logs: readonly SystemLogLineWire[];
  readonly logTotalCount: number;
}

/** 日志筛选：全部 / 运行（info+warn）/ 错误（error）/ 性能（CPU/内存采样） */
type LogFilter = "all" | "run" | "error" | "perf";

/** 性能采样日志前缀（perf-monitor 写入的 `perf cpu=...`） */
const PERF_PREFIX = "perf ";

const LOG_LEVEL_COLORS: Record<string, string> = {
  info: "#4CAF50",
  warn: "#FF9800",
  error: "#F44336",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function SystemLogsScreen(props: SystemLogsScreenProps): React.JSX.Element {
  const { onClose, requestLogs, logs, logTotalCount } = props;
  const [filter, setFilter] = useState<LogFilter>("all");

  useEffect(() => {
    requestLogs();
  }, [requestLogs]);

  const rows = React.useMemo<readonly SystemLogLineWire[]>(() => {
    const filtered =
      filter === "error"
        ? logs.filter((l) => l.level === "error")
        : filter === "perf"
          ? logs.filter((l) => l.message.startsWith(PERF_PREFIX))
          : filter === "run"
            ? logs.filter((l) => l.level !== "error" && !l.message.startsWith(PERF_PREFIX))
            : logs;
    return [...filtered].sort((a, b) => b.at - a.at); // 时间倒序
  }, [logs, filter]);

  const handleExport = useCallback(async () => {
    const lines = rows.map((l) => `[${formatTime(l.at)}] <${l.level}> ${l.message}`);
    const text = `=== 系统日志 (${logs.length}/${logTotalCount}) ===\n${lines.join("\n")}`;
    try {
      await Share.share({ message: text, title: "lumo 系统日志" });
    } catch {
      // 用户取消分享
    }
  }, [rows, logs.length, logTotalCount]);

  const renderItem = useCallback(({ item }: { item: SystemLogLineWire }) => (
    <View style={styles.row}>
      <View style={[styles.statusDot, { backgroundColor: LOG_LEVEL_COLORS[item.level] ?? "#999" }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={3}>{item.message}</Text>
        <Text style={styles.rowMeta}>{formatTime(item.at)} · {item.level}</Text>
      </View>
    </View>
  ), []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
          <BackIcon size={14} color={t.colors.cinnabar} />
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>系统日志</Text>
        <Text style={styles.count}>{rows.length}</Text>
      </View>

      <View style={styles.toolbar}>
        {(["all", "run", "error", "perf"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.sortBtn, filter === f && styles.sortBtnActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortText, filter === f && styles.sortTextActive]}>
              {f === "all" ? "全部" : f === "run" ? "运行" : f === "error" ? "错误" : "性能"}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.refreshBtn} onPress={() => requestLogs()} activeOpacity={0.7}>
          <Text style={styles.refreshText}>刷新</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport} activeOpacity={0.7}>
          <Text style={styles.exportText}>导出</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>暂无日志，发一条消息试试</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.overlayBg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.cardBorder,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: t.colors.paper,
    borderRadius: t.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: t.colors.cinnabarSoft,
  },
  backText: { color: t.colors.cinnabar, fontSize: 13, fontWeight: "700" },
  title: { color: t.colors.text, fontSize: 16, fontWeight: "800", marginLeft: 12 },
  count: { color: t.colors.cloudGray, fontSize: 12, marginLeft: 8 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: t.colors.paper,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  sortBtnActive: { backgroundColor: t.colors.cinnabar, borderColor: t.colors.cinnabar },
  sortText: { color: t.colors.cloudGray, fontSize: 12, fontWeight: "600" },
  sortTextActive: { color: t.colors.textOnAccent },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: t.colors.paper,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  refreshText: { color: t.colors.ink, fontSize: 12, fontWeight: "600" },
  exportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: t.colors.primary,
    borderWidth: 1,
    borderColor: t.colors.primary,
  },
  exportText: { color: t.colors.textOnAccent, fontSize: 12, fontWeight: "700" },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.paper,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  rowBody: { flex: 1 },
  rowName: { color: t.colors.ink, fontSize: 13, fontWeight: "700" },
  rowMeta: { color: t.colors.cloudGray, fontSize: 11, marginTop: 2 },
  empty: { color: t.colors.cloudGray, textAlign: "center", marginTop: 40, fontSize: 14 },
});
