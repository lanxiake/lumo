/**
 * Live2DView — Live2D 宠物渲染视图（react-native-webview 封装）
 *
 * Live2D 跑在 WebView 内（pixi + pixi-live2d-display），资源由
 * scripts/sync-live2d-assets.mjs 同步到 android assets，用
 * file:///android_asset/live2d/webview.html 加载。RN 侧通过 postMessage 下发
 * pet-core 的 WebViewCommand（序列化字符串），WebView 回传 WebViewInbound。
 *
 * 约束（规范 §7.1）：本视图只负责渲染管道，不调 Gateway / 不访问 SQLite /
 * 不运行 Agent——那些在 node-runtime + orchestrator 层。
 *
 * 平台：MVP 先覆盖 Android（file:///android_asset）。iOS 待补 bundle 资源路径。
 */

import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { parseWebViewInbound, type WebViewInbound } from "@lumo/core";

/** 默认模型（相对 assets/live2d/models） */
const DEFAULT_MODEL = "./models/mao_pro/runtime/mao_pro.model3.json";

/** Android assets 下的 WebView 运行时入口 */
const WEBVIEW_URI = "file:///android_asset/live2d/webview.html";

export interface Live2DViewProps {
  /** 模型相对路径（相对 assets/live2d），默认 mao_pro */
  readonly modelPath?: string;
  /** WebView 就绪并可接收指令时回调，传入下发指令的 post 函数 */
  readonly onRendererReady?: (post: (serialized: string) => void) => void;
  /** 模型加载失败回调 */
  readonly onError?: (message: string) => void;
  /** 动作真正播放的反馈 */
  readonly onMotionPlayed?: (info: Extract<WebViewInbound, { type: "motion_played" }>) => void;
  /** 缩放比例（捏合/按钮控制），默认 1 */
  readonly scale?: number;
  /** 水平位置偏移（拖动），默认 0 */
  readonly offsetX?: number;
  /** 垂直位置偏移（拖动），默认 0 */
  readonly offsetY?: number;
  /** WebView 内长按并开始拖动时回调 */
  readonly onDragStart?: (x: number, y: number) => void;
  /** WebView 内拖动位移回调 */
  readonly onDragMove?: (dx: number, dy: number) => void;
  /** WebView 内拖动结束回调 */
  readonly onDragEnd?: () => void;
  /** 点击模型时命中的区域名称（hitTest 结果），未命中时为 "none"；x/y 为 WebView 内坐标 */
  readonly onTapHit?: (area: string, x: number, y: number) => void;
  /** 视口变化信号（如横竖屏切换）：值变化时触发 WebView 内模型重新 fit+居中 */
  readonly viewportTick?: number;
}

/**
 * 把序列化指令注入 WebView：派发一个 message 事件，交给 runtime 的 message 监听。
 * 用 JSON.stringify 二次转义，避免指令内容破坏注入脚本。
 */
function buildInjection(serialized: string): string {
  return `(function(){try{window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(
    serialized,
  )}}));}catch(e){}})();true;`;
}

export function Live2DView(props: Live2DViewProps): React.JSX.Element {
  const {
    modelPath = DEFAULT_MODEL,
    onRendererReady,
    onError,
    onMotionPlayed,
    onDragStart,
    onDragMove,
    onDragEnd,
    onTapHit,
    scale = 1,
    offsetX = 0,
    offsetY = 0,
    viewportTick = 0,
  } = props;
  const webviewRef = useRef<WebView>(null);

  /** 经 injectJavaScript 下发指令到 WebView */
  const post = useCallback((serialized: string) => {
    webviewRef.current?.injectJavaScript(buildInjection(serialized));
  }, []);

  // 视口变化（横竖屏切换）：注入调用 runtime 暴露的 __fitModel，重新按新尺寸 fit+居中。
  // WebView 的 window.resize 在 RN 旋转时不一定触发，故由 RN 主动驱动。
  useEffect(() => {
    webviewRef.current?.injectJavaScript(
      "(function(){try{window.__fitModel&&window.__fitModel();}catch(e){}})();true;",
    );
  }, [viewportTick]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const inbound = parseWebViewInbound(event.nativeEvent.data);
      if (!inbound) return;
      switch (inbound.type) {
        case "ready":
          onRendererReady?.(post);
          break;
        case "error":
          onError?.(inbound.message);
          break;
        case "motion_played":
          onMotionPlayed?.(inbound);
          break;
        case "drag_start":
          onDragStart?.(inbound.x, inbound.y);
          break;
        case "drag_move":
          onDragMove?.(inbound.dx, inbound.dy);
          break;
        case "drag_end":
          onDragEnd?.();
          break;
        case "tap_hit":
          onTapHit?.(inbound.area, inbound.x, inbound.y);
          break;
      }
    },
    [post, onRendererReady, onError, onMotionPlayed, onDragStart, onDragMove, onDragEnd, onTapHit],
  );

  // 首屏模型经 query 传入（runtime.js 读 ?model=）
  const source = { uri: `${WEBVIEW_URI}?model=${encodeURIComponent(modelPath)}` };

  // 注入点击检测：runtime.js 是 APK 静态资源，需通过 injectedJavaScript 动态补充。
  // 命中策略（紧贴包围盒）：
  //   1) 以 window.__petModelRect（fitModel 发布）为基准，四边各内缩 HIT_INSET（贴合立绘、减误触）
  //   2) 点在内缩盒外 → 直接忽略，不发 tap_hit（避免模型外空白区域触发互动）
  //   3) 盒内按纵向比例分区：head_top / face / body / legs
  //   4) rect 未就绪时也不回退全屏，避免首帧全屏误触
  const TAP_DETECTOR_JS = `
(function() {
  var HIT_INSET = 0.08;
  function setup() {
    var canvas = document.getElementById('stage');
    if (!canvas) { setTimeout(setup, 200); return; }
    var lastDown = 0;
    canvas.addEventListener('pointerdown', function() { lastDown = Date.now(); });
    canvas.addEventListener('pointerup', function(e) {
      if (Date.now() - lastDown > 400) return;
      var rect = window.__petModelRect;
      if (!rect || !(rect.width > 0) || !(rect.height > 0)) return;
      var ix = rect.width * HIT_INSET;
      var iy = rect.height * HIT_INSET;
      var hx = rect.x + ix;
      var hy = rect.y + iy;
      var hw = rect.width - ix * 2;
      var hh = rect.height - iy * 2;
      if (hw <= 0 || hh <= 0) return;
      var x = e.clientX;
      var y = e.clientY;
      // 模型包围盒（内缩后）外：忽略，防止空白处误触
      if (x < hx || x > hx + hw || y < hy || y > hy + hh) return;
      var r = (y - hy) / hh;
      if (r < 0) r = 0; else if (r > 1) r = 1;
      var area = r < 0.25 ? 'head_top' : r < 0.45 ? 'face' : r < 0.72 ? 'body' : 'legs';
      var msg = JSON.stringify({ type: 'tap_hit', area: area, x: x, y: y });
      try {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
        else if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
      } catch(err) {}
    });
  }
  setup();
})();true;
`;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.scaleBox,
          {
            transform: [
              { translateX: offsetX },
              { translateY: offsetY },
              { scale },
            ],
          },
        ]}
      >
        <WebView
          ref={webviewRef}
          source={source}
          onMessage={handleMessage}
          originWhitelist={["file://", "about:"]}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          domStorageEnabled
          injectedJavaScript={TAP_DETECTOR_JS}
          style={styles.webview}
          // 透明背景（宠物叠在 App 背景上）：Android 需 hardware 层 + style 透明
          androidLayerType="hardware"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  scaleBox: {
    width: "100%",
    height: "100%",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
