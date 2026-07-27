/**
 * kidsTheme — 萌宠伴「国风暖纸笺」视觉 token（5–12 岁）
 *
 * 对齐 Figma：https://www.figma.com/design/ZdrMT4TwTOS6mOv7Pj39WZ
 * 主壳 / 设置 / 底部控件优先引用本文件，避免散落魔法色值。
 */

export const kidsTheme = {
  colors: {
    /** 纸底 #FFF8F0 */
    paper: "#FFF8F0",
    /** 暖米深 #F3E6D4 */
    paperDeep: "#F3E6D4",
    /** 墨色字 #3D2B1F */
    ink: "#3D2B1F",
    /** 朱砂主色 #E85D4C */
    cinnabar: "#E85D4C",
    cinnabarSoft: "rgba(232, 93, 76, 0.18)",
    /** 青绿 #3AAFA9 */
    teal: "#3AAFA9",
    tealSoft: "rgba(58, 175, 169, 0.22)",
    /** 软金装饰 #E8B86D */
    softGold: "#E8B86D",
    softGoldBorder: "rgba(232, 184, 109, 0.35)",
    /** 淡云灰 #8B7A6B */
    cloudGray: "#8B7A6B",
    /** 打字天蓝偏暖 #5BB8D4 */
    skyWarm: "#5BB8D4",
    skyWarmSoft: "rgba(91, 184, 212, 0.28)",
    /** HUD 纸白半透明 */
    hudPaper: "rgba(255, 248, 240, 0.92)",

    // —— 语义别名（兼容既有引用）——
    rootBg: "#FFF8F0",
    overlayBg: "rgba(255, 248, 240, 0.98)",
    hudBg: "rgba(255, 248, 240, 0.92)",
    hudBorder: "rgba(232, 184, 109, 0.35)",
    cardBg: "#FFF8F0",
    cardBorder: "rgba(232, 184, 109, 0.35)",
    cardIconBg: "#F3E6D4",
    primary: "#E85D4C",
    primarySoft: "rgba(232, 93, 76, 0.18)",
    sky: "#5BB8D4",
    skySoft: "rgba(91, 184, 212, 0.28)",
    call: "#3AAFA9",
    callSoft: "rgba(58, 175, 169, 0.22)",
    mint: "#3AAFA9",
    danger: "#E85D4C",
    dangerSoft: "rgba(232, 93, 76, 0.18)",
    text: "#3D2B1F",
    textSecondary: "#8B7A6B",
    textMuted: "#8B7A6B",
    textOnAccent: "#FFFFFF",
    inputBg: "#F3E6D4",
    inputBorder: "rgba(232, 184, 109, 0.35)",
    placeholder: "#8B7A6B",
    floatBg: "rgba(255, 248, 240, 0.92)",
    floatBorder: "rgba(61, 43, 31, 0.12)",
    floatBtn: "rgba(255, 248, 240, 0.92)",
    floatText: "#3D2B1F",
    parentBanner: "rgba(243, 230, 212, 0.9)",
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    pill: 999,
  },
  font: {
    title: 22,
    section: 13,
    body: 16,
    hint: 12,
    label: 14,
  },
  /** 儿童主操作触控下限 */
  touch: {
    minMain: 56,
    minFloat: 44,
  },
} as const;

export type KidsTheme = typeof kidsTheme;
