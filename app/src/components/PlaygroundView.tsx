/**
 * PlaygroundView — Agent 生成的小游戏/互动页面全屏渲染器
 *
 * 在 WebView 沙箱中运行 Node 侧已包装 CSP + 禁用外部资源的 HTML。
 * 提供关闭按钮、标题栏、消息桥接（子页面可调用 window.sendToPet）。
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export interface PlaygroundViewProps {
  readonly html: string;
  readonly title: string;
  /** 自动关闭超时（毫秒），默认 5 分钟；0 表示不自动关闭 */
  readonly autoCloseMs?: number;
  readonly onClose: (reason: "user" | "timeout") => void;
  readonly onMessage?: (type: string, data: unknown) => void;
  /** 点击"改一改"编辑当前游戏（无则不显示按钮） */
  readonly onEdit?: () => void;
}

const DEFAULT_AUTO_CLOSE_MS = 5 * 60 * 1000;

export function PlaygroundView(props: PlaygroundViewProps): React.JSX.Element {
  const { html, title, autoCloseMs = DEFAULT_AUTO_CLOSE_MS, onClose, onMessage, onEdit } = props;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    onClose("user");
  }, [onClose]);

  useEffect(() => {
    if (autoCloseMs > 0) {
      timeoutRef.current = setTimeout(() => {
        onClose("timeout");
      }, autoCloseMs);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [autoCloseMs, onClose]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event.nativeEvent.data;
      try {
        const parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
        const type = typeof parsed.type === "string" ? parsed.type : "unknown";
        onMessage?.(type, parsed.data);
      } catch {
        onMessage?.("raw", raw);
      }
    },
    [onMessage],
  );

  const handleError = useCallback(() => {
    setError("小游戏加载出错啦");
  }, []);

  const handleHttpError = useCallback(
    (event: { nativeEvent: { statusCode: number; description: string } }) => {
      console.warn(`[PlaygroundView] HTTP ${event.nativeEvent.statusCode}: ${event.nativeEvent.description}`);
      setError("小游戏加载出错啦");
    },
    [],
  );

  const handleProcessTermination = useCallback(() => {
    setError("小游戏被系统回收了，重新打开试试吧");
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{title || "小游戏"}</Text>
        <View style={styles.headerBtns}>
          {onEdit && (
            <TouchableOpacity style={styles.editBtn} onPress={onEdit} activeOpacity={0.7}>
              <Text style={styles.editText}>改一改</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={styles.closeText}>关闭</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={styles.retryText}>返回</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          originWhitelist={["about:"]}
          source={{ html }}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          onMessage={handleMessage}
          onError={handleError}
          onHttpError={handleHttpError}
          onRenderProcessGone={handleProcessTermination}
          onContentProcessDidTerminate={handleProcessTermination}
          style={styles.webview}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(10, 18, 32, 0.96)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(15, 28, 48, 0.9)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(100, 170, 255, 0.15)",
  },
  title: {
    flex: 1,
    color: "#E0F0FF",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 12,
  },
  headerBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editBtn: {
    backgroundColor: "rgba(160, 120, 255, 0.28)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(180, 140, 255, 0.4)",
  },
  editText: {
    color: "#D8C8FF",
    fontSize: 14,
    fontWeight: "700",
  },
  closeBtn: {
    backgroundColor: "rgba(80, 140, 220, 0.25)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(100, 170, 255, 0.35)",
  },
  closeText: {
    color: "#A8D0FF",
    fontSize: 14,
    fontWeight: "700",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  errorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#FFB0B0",
    fontSize: 16,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: "rgba(80, 140, 220, 0.25)",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(100, 170, 255, 0.35)",
  },
  retryText: {
    color: "#A8D0FF",
    fontSize: 14,
    fontWeight: "700",
  },
});
