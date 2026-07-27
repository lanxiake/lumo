/**
 * SwipeToDismiss — 屏幕右边缘「从右往左」滑动返回上一级的包裹容器
 *
 * 儿童 App 的 overlay/playground 原先只能点"返回"按钮关闭，且 Android 硬件
 * 返回键会直接退出 App。本组件提供一个「边缘返回」手势，与 App.tsx 里的
 * BackHandler 一起，保证返回上一级而非退出 App。
 *
 * 防误触设计（针对小朋友）：三重门控，缺一不接管，避免中间随意划动就退出——
 *   1. 起手位置：必须落在屏幕右边缘 edgeWidth 内（默认 32px）。
 *   2. 方向：仅识别「从右往左」（dx 为负），左往右不触发。
 *   3. 阈值：水平位移绝对值需超过 threshold（默认 90px）才真正退出。
 * 纵向滚动/点击、以及非边缘区域的横划都不受影响，可安全包裹含 ScrollView 的页面。
 */

import React, { useMemo, useRef } from "react";
import { Dimensions, PanResponder, StyleSheet, View, type ViewStyle } from "react-native";

export interface SwipeToDismissProps {
  readonly children: React.ReactNode;
  readonly onDismiss: () => void;
  /** 触发返回的水平位移阈值（逻辑像素），默认 90 */
  readonly threshold?: number;
  /** 允许起手的右边缘宽度（逻辑像素），默认 32 */
  readonly edgeWidth?: number;
  readonly style?: ViewStyle;
}

export function SwipeToDismiss(props: SwipeToDismissProps): React.JSX.Element {
  const { children, onDismiss, threshold = 90, edgeWidth = 32, style } = props;

  // 起手是否落在屏幕右边缘（每次 grant 时记录，release 时校验）。
  const fromEdgeRef = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // 只接管「右边缘起手 + 明显向左横划」的手势，避免吃掉纵向滚动与点击。
        onMoveShouldSetPanResponder: (evt, g) => {
          const screenWidth = Dimensions.get("window").width;
          const startX = evt.nativeEvent.pageX - g.dx;
          const nearRightEdge = startX >= screenWidth - edgeWidth;
          fromEdgeRef.current = nearRightEdge;
          return (
            nearRightEdge &&
            g.dx < -12 &&
            Math.abs(g.dx) > Math.abs(g.dy) * 1.5
          );
        },
        onPanResponderRelease: (_evt, g) => {
          // 需同时满足：右边缘起手、从右往左（dx<0）、位移超阈值、横向占优。
          if (
            fromEdgeRef.current &&
            g.dx < -threshold &&
            Math.abs(g.dx) > Math.abs(g.dy)
          ) {
            onDismiss();
          }
          fromEdgeRef.current = false;
        },
      }),
    [onDismiss, threshold, edgeWidth],
  );

  return (
    <View style={[styles.fill, style]} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
