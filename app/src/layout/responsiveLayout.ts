/**
 * responsiveLayout — 响应式布局档位派生（纯逻辑）
 *
 * 规范 Phase 5：禁单一尺寸硬编码，须适配手机竖屏 / 平板竖屏 / 平板横屏。
 * 本模块只做**尺寸 → 档位 + 布局参数**的纯函数派生，不 import react-native，
 * 便于脱离真机单测。RN 侧用 useWindowDimensions 取 {width,height} 喂入。
 *
 * 判定规则：
 *  - 平板阈值：较短边 >= 600dp（Android 惯例，7" 平板 ~600dp）。
 *  - 横竖屏：width > height 为横屏。
 *  - 手机横屏归入 phone-portrait 的紧凑变体（儿童 App 主打竖屏，横屏不单列档位）。
 */

/** 布局档位 */
export type LayoutMode = "phone-portrait" | "tablet-portrait" | "tablet-landscape";

/** 平板判定阈值（较短边 dp） */
const TABLET_MIN_SHORT_SIDE = 600;

/** 从视口尺寸派生布局档位 */
export function resolveLayoutMode(width: number, height: number): LayoutMode {
  const shortSide = Math.min(width, height);
  const isTablet = shortSide >= TABLET_MIN_SHORT_SIDE;
  const isLandscape = width > height;

  if (isTablet) {
    return isLandscape ? "tablet-landscape" : "tablet-portrait";
  }
  // 手机（含横屏）统一走竖屏档位，儿童 App 主打竖屏体验。
  return "phone-portrait";
}

/** 各档位的布局参数（舞台占比 / HUD 内边距 / 是否侧边布局） */
export interface LayoutMetrics {
  /** 舞台（Live2D）占视口高度比例（横屏为宽度比例） */
  readonly stageRatio: number;
  /** HUD 水平内边距 */
  readonly hudPaddingH: number;
  /** HUD 垂直内边距 */
  readonly hudPaddingV: number;
  /** 横屏布局：舞台与 HUD 左右分栏（true）还是上下堆叠（false） */
  readonly sideBySide: boolean;
  /** 输入/按钮基准字号 */
  readonly fontScale: number;
}

/** 按档位返回布局参数 */
export function layoutMetricsFor(mode: LayoutMode): LayoutMetrics {
  switch (mode) {
    case "tablet-landscape":
      // 横屏：舞台占左侧 60% 宽，HUD 右侧分栏，字号放大。
      return { stageRatio: 0.6, hudPaddingH: 32, hudPaddingV: 24, sideBySide: true, fontScale: 1.3 };
    case "tablet-portrait":
      // 平板竖屏：舞台更高占比，留白充裕，字号适中放大。
      return { stageRatio: 0.78, hudPaddingH: 32, hudPaddingV: 20, sideBySide: false, fontScale: 1.2 };
    case "phone-portrait":
    default:
      // 手机竖屏：人物占绝大部分屏幕，控制面板压缩为底部悬浮条。
      return { stageRatio: 0.88, hudPaddingH: 12, hudPaddingV: 8, sideBySide: false, fontScale: 1 };
  }
}
