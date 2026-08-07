/**
 * KidsIcons — 暖纸笺风格纯 View 矢量图标（无 emoji）
 *
 * 供登录、设置卡片、底部控制坞、右上浮动钮复用。
 * color 默认白（色底按钮上）或墨色（纸白底上）。
 */

import React from "react";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import { kidsTheme as t } from "../theme/kidsTheme";

const phonePng = require("../assets/phone.png");

export interface IconProps {
  readonly size?: number;
  readonly color?: string;
  readonly style?: ViewStyle;
}

/** 键盘图标（打字） */
export function KeyboardIcon({ size = 28, color = "#FFFFFF", style }: IconProps): React.JSX.Element {
  const s = size / 40;
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ transform: [{ scale: s }] }}>
        <View style={[iconStyles.kbBody, { borderColor: color }]}>
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <View
                key={`${row}-${col}`}
                style={[
                  iconStyles.key,
                  {
                    backgroundColor: color,
                    top: 6 + row * 10,
                    left: 6 + col * 10,
                    opacity: row === 2 && col === 2 ? 0 : 1,
                  },
                ]}
              />
            )),
          )}
          <View style={[iconStyles.spaceBar, { backgroundColor: color, top: 26, left: 6 }]} />
        </View>
      </View>
    </View>
  );
}

/** 电话图标（直接用下载的 phone.png，tintColor 上色，白底按钮上默认白色） */
export function PhoneIcon({ size = 24, color = "#FFFFFF", style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Image source={phonePng} style={{ width: size, height: size, tintColor: color }} resizeMode="contain" />
    </View>
  );
}

/** 挂断（横放听筒） */
export function HangupIcon({ size = 22, color = "#FFFFFF", style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.72,
          height: size * 0.28,
          borderRadius: size * 0.14,
          backgroundColor: color,
          transform: [{ rotate: "0deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.08,
          width: size * 0.2,
          height: size * 0.2,
          borderRadius: size * 0.06,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: size * 0.08,
          width: size * 0.2,
          height: size * 0.2,
          borderRadius: size * 0.06,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** 麦克风 */
export function MicIcon({
  size = 24,
  color = t.colors.ink,
  muted = false,
  style,
}: IconProps & { readonly muted?: boolean }): React.JSX.Element {
  const s = size / 24;
  const c = muted ? t.colors.cinnabar : color;
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ transform: [{ scale: s }] }}>
        <View style={[iconStyles.micHead, { borderColor: c }]} />
        <View style={[iconStyles.micStand, { borderColor: c }]} />
        <View style={[iconStyles.micStem, { backgroundColor: c }]} />
        <View style={[iconStyles.micBase, { backgroundColor: c }]} />
        {muted && <View style={iconStyles.micSlash} />}
      </View>
    </View>
  );
}

/** 发送箭头 */
export function SendIcon({ size = 18, color = "#FFFFFF", style }: IconProps): React.JSX.Element {
  return (
    <View
      style={[
        {
          width: 0,
          height: 0,
          borderStyle: "solid",
          borderLeftWidth: size * 0.55,
          borderRightWidth: 0,
          borderTopWidth: size * 0.4,
          borderBottomWidth: size * 0.4,
          borderLeftColor: color,
          borderTopColor: "transparent",
          borderBottomColor: "transparent",
          marginLeft: 2,
        },
        style,
      ]}
    />
  );
}

/** 打断方块 */
export function InterruptIcon({ size = 18, color = "#FFFFFF", style }: IconProps): React.JSX.Element {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 4,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** 设置齿轮（简化） */
export function SettingsIcon({ size = 18, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  const tooth = size * 0.22;
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: size * 0.28,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View style={{ position: "absolute", top: 0, width: tooth, height: tooth, borderRadius: 2, backgroundColor: color }} />
      <View style={{ position: "absolute", bottom: 0, width: tooth, height: tooth, borderRadius: 2, backgroundColor: color }} />
      <View style={{ position: "absolute", left: 0, width: tooth, height: tooth, borderRadius: 2, backgroundColor: color }} />
      <View style={{ position: "absolute", right: 0, width: tooth, height: tooth, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

/** 返回箭头 */
export function BackIcon({ size = 16, color = t.colors.cinnabar, style }: IconProps): React.JSX.Element {
  return (
    <View
      style={[
        {
          width: size * 0.55,
          height: size * 0.55,
          borderLeftWidth: 2.5,
          borderBottomWidth: 2.5,
          borderColor: color,
          transform: [{ rotate: "45deg" }],
          marginLeft: 3,
        },
        style,
      ]}
    />
  );
}

/** 右箭头 chevron */
export function ChevronIcon({ size = 16, color = t.colors.cinnabar, style }: IconProps): React.JSX.Element {
  return (
    <View
      style={[
        {
          width: size * 0.55,
          height: size * 0.55,
          borderRightWidth: 2.5,
          borderTopWidth: 2.5,
          borderColor: color,
          transform: [{ rotate: "45deg" }],
          marginRight: 2,
        },
        style,
      ]}
    />
  );
}

/** 加号 */
export function PlusIcon({ size = 16, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  const bar = size * 0.12;
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ position: "absolute", width: size * 0.7, height: bar, borderRadius: 1, backgroundColor: color }} />
      <View style={{ position: "absolute", width: bar, height: size * 0.7, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

/** 减号 */
export function MinusIcon({ size = 16, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={{ width: size * 0.7, height: size * 0.12, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

/** 重置圆弧箭头（简化为圆形 + 缺口提示） */
export function ResetIcon({ size = 16, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.72,
          height: size * 0.72,
          borderRadius: size * 0.36,
          borderWidth: 2,
          borderColor: color,
          borderTopColor: "transparent",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: size * 0.08,
          right: size * 0.12,
          width: 0,
          height: 0,
          borderLeftWidth: 4,
          borderRightWidth: 4,
          borderBottomWidth: 6,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
          transform: [{ rotate: "40deg" }],
        }}
      />
    </View>
  );
}

/** 场景 / 风景 */
export function SceneIcon({ size = 16, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.85,
          height: size * 0.65,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: color,
          overflow: "hidden",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: size * 0.22,
            borderRightWidth: size * 0.22,
            borderBottomWidth: size * 0.28,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: color,
            alignSelf: "center",
            marginBottom: 2,
            opacity: 0.85,
          }}
        />
      </View>
    </View>
  );
}

/** 画廊（图片框） */
export function GalleryIcon({ size = 22, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.85,
          height: size * 0.7,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: size * 0.28,
          left: size * 0.28,
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: size * 0.09,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** 游戏手柄简化 */
export function GameIcon({ size = 22, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.9,
          height: size * 0.5,
          borderRadius: size * 0.2,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View style={{ position: "absolute", left: size * 0.22, width: size * 0.12, height: size * 0.12, borderRadius: 1, backgroundColor: color }} />
      <View style={{ position: "absolute", right: size * 0.28, width: size * 0.1, height: size * 0.1, borderRadius: size * 0.05, backgroundColor: color }} />
    </View>
  );
}

/** 聊天气泡 */
export function ChatIcon({ size = 22, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.78,
          height: size * 0.55,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: size * 0.12,
          left: size * 0.28,
          width: 0,
          height: 0,
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderTopWidth: 7,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: color,
        }}
      />
    </View>
  );
}

/** 爪印（默认宠物） */
export function PawIcon({ size = 22, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  const pad = size * 0.22;
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.42,
          height: size * 0.36,
          borderRadius: size * 0.2,
          backgroundColor: color,
          marginTop: size * 0.18,
        }}
      />
      <View style={{ position: "absolute", top: size * 0.12, left: size * 0.18, width: pad, height: pad, borderRadius: pad / 2, backgroundColor: color }} />
      <View style={{ position: "absolute", top: size * 0.06, left: size * 0.38, width: pad, height: pad, borderRadius: pad / 2, backgroundColor: color }} />
      <View style={{ position: "absolute", top: size * 0.12, right: size * 0.18, width: pad, height: pad, borderRadius: pad / 2, backgroundColor: color }} />
    </View>
  );
}

/** 声波（音色） */
export function VoiceIcon({ size = 18, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  const bars = [0.4, 0.7, 1, 0.7, 0.4];
  return (
    <View style={[{ width: size, height: size, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 }, style]}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: 2,
            height: size * h * 0.7,
            borderRadius: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

/** 锁 */
export function LockIcon({ size = 16, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          width: size * 0.45,
          height: size * 0.35,
          borderTopLeftRadius: size * 0.22,
          borderTopRightRadius: size * 0.22,
          borderWidth: 2,
          borderBottomWidth: 0,
          borderColor: color,
          marginBottom: -1,
        }}
      />
      <View
        style={{
          width: size * 0.65,
          height: size * 0.45,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** 四宫格菜单（主舞台工具展开入口） */
export function MenuGridIcon({ size = 18, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  const dot = Math.max(3, size * 0.22);
  const gap = size * 0.16;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap,
          padding: size * 0.08,
        },
        style,
      ]}
    >
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            width: dot,
            height: dot,
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

/** 关闭（X） */
export function CloseIcon({ size = 16, color = t.colors.ink, style }: IconProps): React.JSX.Element {
  const bar = size * 0.12;
  const len = size * 0.72;
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <View
        style={{
          position: "absolute",
          width: len,
          height: bar,
          borderRadius: 1,
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          width: len,
          height: bar,
          borderRadius: 1,
          backgroundColor: color,
          transform: [{ rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

const iconStyles = StyleSheet.create({
  kbBody: {
    width: 40,
    height: 36,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  key: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 1.5,
  },
  spaceBar: {
    position: "absolute",
    width: 28,
    height: 5,
    borderRadius: 2,
  },
  phoneEar: {
    width: 10,
    height: 14,
    borderRadius: 3,
    marginBottom: 2,
  },
  phoneBody: {
    width: 8,
    height: 10,
    borderRadius: 2,
    alignSelf: "center",
  },
  phoneMouth: {
    width: 10,
    height: 14,
    borderRadius: 3,
    marginTop: 2,
  },
  micHead: {
    width: 12,
    height: 16,
    borderRadius: 6,
    borderWidth: 2,
    alignSelf: "center",
  },
  micStand: {
    width: 16,
    height: 8,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignSelf: "center",
    marginTop: -1,
  },
  micStem: {
    width: 2,
    height: 4,
    alignSelf: "center",
  },
  micBase: {
    width: 10,
    height: 2,
    borderRadius: 1,
    alignSelf: "center",
  },
  micSlash: {
    position: "absolute",
    width: 22,
    height: 2.5,
    backgroundColor: t.colors.cinnabar,
    top: 12,
    left: 1,
    transform: [{ rotate: "-40deg" }],
    borderRadius: 1,
  },
});
