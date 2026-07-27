import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

export interface SlideCaptchaRef {
  /** 重置滑块到未验证状态 */
  reset: () => void;
}

export interface SlideCaptchaProps {
  /** 验证通过后回调，token 为 test- 前缀供后端放行 */
  readonly onVerified: (token: string) => void;
  /** 是否禁用 */
  readonly disabled?: boolean;
}

const THRESHOLD_RATIO = 0.9;

export const SlideCaptcha = forwardRef<SlideCaptchaRef, SlideCaptchaProps>(
  function SlideCaptcha(props, ref): React.JSX.Element {
    const { onVerified, disabled = false } = props;
    const [verified, setVerified] = useState(false);
    const [trackWidth, setTrackWidth] = useState(0);
    const translateX = useRef(new Animated.Value(0)).current;

    // PanResponder is created once and its closures capture initial state.
    // Read live values from refs so onPanResponderMove sees the real trackWidth/verified/disabled.
    const trackWidthRef = useRef(0);
    const verifiedRef = useRef(false);
    const disabledRef = useRef(disabled);
    disabledRef.current = disabled;

    const markVerified = useCallback(() => {
      verifiedRef.current = true;
      setVerified(true);
    }, []);

    useImperativeHandle(ref, () => ({
      reset: () => {
        verifiedRef.current = false;
        setVerified(false);
        translateX.setValue(0);
      },
    }));

    useEffect(() => {
      if (verified) {
        onVerified(`test-slide-${Date.now()}`);
      }
    }, [verified, onVerified]);

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current && !verifiedRef.current,
        onStartShouldSetPanResponderCapture: () => !disabledRef.current && !verifiedRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current && !verifiedRef.current,
        onMoveShouldSetPanResponderCapture: () => !disabledRef.current && !verifiedRef.current,
        onPanResponderTerminationRequest: () => false, // 不让父级接管手势
        onPanResponderMove: (_, gesture) => {
          if (disabledRef.current || verifiedRef.current || trackWidthRef.current === 0) return;
          const max = Math.max(0, trackWidthRef.current - THUMB_SIZE - 4);
          const next = Math.max(0, Math.min(gesture.dx, max));
          translateX.setValue(next);
          if (next >= max * THRESHOLD_RATIO && !verifiedRef.current) {
            markVerified();
            translateX.setValue(max);
          }
        },
        onPanResponderRelease: () => {
          if (verifiedRef.current) return;
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 5,
          }).start();
        },
      }),
    ).current;

    const onLayout = useCallback((e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      trackWidthRef.current = w;
      setTrackWidth(w);
    }, []);

    return (
      <View
        style={[styles.track, verified && styles.trackVerified]}
        onLayout={onLayout}
      >
        <Text style={[styles.label, verified && styles.labelVerified]}>
          {verified ? "验证通过" : "向右滑动完成验证"}
        </Text>
        <Animated.View
          style={[
            styles.thumb,
            { transform: [{ translateX }] },
            verified && styles.thumbVerified,
          ]}
          {...panResponder.panHandlers}
        >
          <Text style={styles.thumbText}>{verified ? "✓" : "→"}</Text>
        </Animated.View>
      </View>
    );
  },
);

const THUMB_SIZE = 44;

const styles = StyleSheet.create({
  track: {
    width: "100%",
    height: 48,
    borderRadius: 16,
    backgroundColor: "#F3E6D4",
    borderWidth: 1,
    borderColor: "rgba(58, 175, 169, 0.35)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
  trackVerified: {
    backgroundColor: "rgba(58, 175, 169, 0.2)",
    borderColor: "rgba(58, 175, 169, 0.5)",
  },
  label: {
    fontSize: 13,
    color: "#8B7A6B",
    fontWeight: "600",
  },
  labelVerified: {
    color: "#3AAFA9",
  },
  thumb: {
    position: "absolute",
    left: 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    backgroundColor: "#3AAFA9",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#3D2B1F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  thumbVerified: {
    backgroundColor: "#3AAFA9",
  },
  thumbText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
