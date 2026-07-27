/**
 * TapEffect — 点击宠物时的视觉粒子特效
 *
 * 每次触发生成一个涟漪圆 + 5 个向外飞散的星形粒子，
 * 600ms 后自动消失。定位相对整个舞台层（absoluteFill）。
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

const PARTICLES = ["✦", "★", "✧", "✦", "★"];
const PARTICLE_ANGLES = [0, 72, 144, 216, 288]; // 均匀分布 360°
const PARTICLE_RADIUS = 48;
const DURATION = 600;

export interface TapEffectProps {
  /** 特效中心 x（相对父容器） */
  readonly x: number;
  /** 特效中心 y（相对父容器） */
  readonly y: number;
  /** 当此值变化时触发一次动画 */
  readonly trigger: number;
}

export function TapEffect({ x, y, trigger }: TapEffectProps): React.JSX.Element {
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0.7)).current;
  const particleAnims = useRef(
    PARTICLES.map(() => ({
      translate: new Animated.ValueXY({ x: 0, y: 0 }),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (trigger === 0) return;

    // 重置
    rippleScale.setValue(0);
    rippleOpacity.setValue(0.7);
    particleAnims.forEach((p) => {
      p.translate.setValue({ x: 0, y: 0 });
      p.opacity.setValue(0);
      p.scale.setValue(0);
    });

    // 涟漪动画
    Animated.parallel([
      Animated.timing(rippleScale, { toValue: 1, duration: DURATION, useNativeDriver: true }),
      Animated.timing(rippleOpacity, { toValue: 0, duration: DURATION, useNativeDriver: true }),
    ]).start();

    // 粒子动画
    particleAnims.forEach((p, i) => {
      const rad = (PARTICLE_ANGLES[i] * Math.PI) / 180;
      const tx = Math.cos(rad) * PARTICLE_RADIUS;
      const ty = Math.sin(rad) * PARTICLE_RADIUS;
      Animated.parallel([
        Animated.timing(p.opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(p.scale, { toValue: 1.2, duration: 150, useNativeDriver: true }),
        Animated.timing(p.translate, { toValue: { x: tx, y: ty }, duration: DURATION, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(p.opacity, { toValue: 0, duration: DURATION - 200, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, [trigger]);

  if (trigger === 0) return <View />;

  return (
    <View style={[styles.anchor, { left: x, top: y }]} pointerEvents="none">
      {/* 涟漪圆 */}
      <Animated.View
        style={[
          styles.ripple,
          {
            opacity: rippleOpacity,
            transform: [{ scale: rippleScale }],
          },
        ]}
      />
      {/* 粒子 */}
      {particleAnims.map((p, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.particle,
            {
              opacity: p.opacity,
              transform: [
                { translateX: p.translate.x },
                { translateY: p.translate.y },
                { scale: p.scale },
              ],
            },
          ]}
        >
          {PARTICLES[i]}
        </Animated.Text>
      ))}
    </View>
  );
}

const RIPPLE_SIZE = 80;

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ripple: {
    position: "absolute",
    width: RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
    backgroundColor: "rgba(180, 220, 255, 0.45)",
    borderWidth: 2,
    borderColor: "rgba(140, 200, 255, 0.6)",
    marginLeft: -RIPPLE_SIZE / 2,
    marginTop: -RIPPLE_SIZE / 2,
  },
  particle: {
    position: "absolute",
    fontSize: 14,
    color: "#FFD700",
    marginLeft: -8,
    marginTop: -8,
  },
});
