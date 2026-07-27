/**
 * useResponsiveLayout — 响应式布局档位 hook（RN 副作用薄封装）
 *
 * 用 RN useWindowDimensions 取实时视口尺寸（旋转/分屏自动更新），喂给纯逻辑
 * resolveLayoutMode/layoutMetricsFor 派生档位 + 布局参数。副作用极薄，纯派生
 * 逻辑全在 responsiveLayout.ts（已 8 测覆盖）。
 */

import { useWindowDimensions } from "react-native";
import {
  layoutMetricsFor,
  resolveLayoutMode,
  type LayoutMetrics,
  type LayoutMode,
} from "./responsiveLayout";

export interface ResponsiveLayout {
  readonly mode: LayoutMode;
  readonly metrics: LayoutMetrics;
  readonly width: number;
  readonly height: number;
}

/** 返回当前视口的布局档位与参数（视口变化自动重算） */
export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const mode = resolveLayoutMode(width, height);
  const metrics = layoutMetricsFor(mode);
  return { mode, metrics, width, height };
}
