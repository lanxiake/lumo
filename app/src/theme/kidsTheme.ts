/**
 * kidsTheme — Soft Pop 主题色系（5–12 岁）
 *
 * 结构：
 *   palette  → 原始色板（扩展主题时优先改这里）
 *   colors   → 语义色（页面/组件引用）
 *   radius / font / space / shadow / touch → 尺度与质感
 *   themeStyles → 可复用组件样式（屏幕底、卡片、芯片、按钮、输入框）
 *
 * 主壳 / 设置 / overlay 子页应优先引用本文件，避免散落魔法色值。
 */

import type { TextStyle, ViewStyle } from "react-native";

/** Soft Pop 原始色板 — 后续换肤/扩展主题从此改起 */
export const softPopPalette = {
  cream: "#FFF8F0",
  creamDeep: "#F3E6D4",
  creamRoot: "#FFF6EF",
  ink: "#3D2B1F",
  mist: "#8B7A6B",
  placeholder: "#A99484",

  coral: "#F07868",
  cinnabar: "#E85D4C",
  teal: "#3AAFA9",
  softGold: "#E8B86D",
  sky: "#5BB8D4",
  lavender: "#9B7DE8",
  gold: "#E0A84E",

  white: "#FFFFFF",
  white90: "rgba(255, 255, 255, 0.9)",
  white86: "rgba(255, 255, 255, 0.86)",
  white82: "rgba(255, 255, 255, 0.82)",
  white72: "rgba(255, 255, 255, 0.72)",
  white55: "rgba(255, 255, 255, 0.55)",

  glassFill: "rgba(255, 252, 247, 0.94)",
  glassHud: "rgba(255, 250, 245, 0.78)",
  glassBorder: "rgba(255, 255, 255, 0.78)",
  overlayFill: "rgba(255, 246, 239, 0.97)",
  surfaceElevated: "rgba(255, 255, 255, 0.92)",
  surfaceMuted: "rgba(243, 230, 212, 0.55)",
  surfaceInput: "#FFFFFF",
  /** 设置页控件统一描边（奶油底上可见、同一色系） */
  controlBorder: "rgba(61, 43, 31, 0.12)",
  controlBorderStrong: "rgba(61, 43, 31, 0.18)",

  coralSoft: "rgba(240, 120, 104, 0.14)",
  cinnabarSoft: "rgba(232, 93, 76, 0.18)",
  tealSoft: "rgba(58, 175, 169, 0.22)",
  goldSoft: "rgba(232, 184, 109, 0.28)",
  goldBorder: "rgba(61, 43, 31, 0.12)",
  skySoft: "rgba(91, 184, 212, 0.28)",
  lavenderSoft: "rgba(155, 125, 232, 0.16)",
  mutedBtn: "rgba(243, 230, 212, 0.7)",
  mutedBtnBorder: "rgba(61, 43, 31, 0.12)",
  disabled: "rgba(180, 170, 160, 0.45)",
  hairline: "rgba(61, 43, 31, 0.08)",
  hairlineStrong: "rgba(61, 43, 31, 0.14)",
  tealOutline: "rgba(58, 175, 169, 0.35)",
  tealOutlineStrong: "rgba(58, 175, 169, 0.4)",
  tealSolid: "rgba(58, 175, 169, 0.9)",
  errorSoft: "rgba(220, 120, 90, 0.12)",
  errorOutline: "rgba(220, 120, 90, 0.4)",
  errorSolid: "rgba(220, 120, 90, 0.9)",
  inkScrim: "rgba(61, 43, 31, 0.92)",
  creamOnDark: "rgba(255, 248, 240, 0.75)",
  white75: "rgba(255, 255, 255, 0.75)",
} as const;

const p = softPopPalette;

export const kidsTheme = {
  /** 语义色：页面与组件统一引用 */
  colors: {
    // —— 基础 ——
    paper: p.cream,
    paperDeep: p.creamDeep,
    ink: p.ink,
    cloudGray: p.mist,

    // —— 品牌强调 ——
    coral: p.coral,
    cinnabar: p.cinnabar,
    cinnabarSoft: p.cinnabarSoft,
    teal: p.teal,
    tealSoft: p.tealSoft,
    softGold: p.softGold,
    softGoldBorder: p.goldBorder,
    skyWarm: p.sky,
    skyWarmSoft: p.skySoft,
    lavender: p.lavender,
    gold: p.gold,

    // —— 表面 / 玻璃 ——
    hudPaper: p.glassHud,
    glassStrong: p.glassFill,
    glassBorder: p.controlBorder,
    bubble: p.white86,
    surfaceElevated: p.surfaceElevated,
    surfaceMuted: p.surfaceMuted,
    surfaceInput: p.surfaceInput,
    controlBg: p.surfaceElevated,
    controlBorder: p.controlBorder,
    controlBorderStrong: p.controlBorderStrong,

    // —— 图标井（设置页统一用 primarySoft，不再彩虹）——
    iconWell: p.coralSoft,
    iconWellLavender: p.coralSoft,
    iconWellTeal: p.coralSoft,
    iconWellCoral: p.coralSoft,
    iconWellGold: p.coralSoft,

    // —— 语义别名（兼容既有引用）——
    rootBg: p.creamRoot,
    overlayBg: p.overlayFill,
    hudBg: p.glassHud,
    hudBorder: p.controlBorder,
    cardBg: p.surfaceElevated,
    cardBorder: p.controlBorder,
    cardIconBg: p.coralSoft,
    primary: p.coral,
    primarySoft: p.coralSoft,
    sky: p.sky,
    skySoft: p.skySoft,
    call: p.teal,
    callSoft: p.tealSoft,
    mint: p.teal,
    danger: p.cinnabar,
    dangerSoft: p.cinnabarSoft,
    text: p.ink,
    textSecondary: p.mist,
    textMuted: p.mist,
    textOnAccent: p.white,
    inputBg: p.surfaceInput,
    inputBorder: p.controlBorder,
    placeholder: p.placeholder,
    floatBg: p.glassFill,
    floatBorder: p.controlBorder,
    floatBtn: p.glassFill,
    floatText: p.ink,
    parentBanner: "rgba(243, 230, 212, 0.85)",
    busyPillBg: p.glassFill,
    btnMuted: p.mutedBtn,
    btnMutedBorder: p.mutedBtnBorder,
    disabled: p.disabled,
    hairline: p.hairline,
    hairlineStrong: p.hairlineStrong,
    tealOutline: p.tealOutline,
    tealOutlineStrong: p.tealOutlineStrong,
    tealSolid: p.tealSolid,
    errorSoft: p.errorSoft,
    errorOutline: p.errorOutline,
    errorSolid: p.errorSolid,
    inkScrim: p.inkScrim,
    creamOnDark: p.creamOnDark,
    white75: p.white75,
  },

  radius: {
    sm: 14,
    md: 18,
    lg: 22,
    xl: 28,
    card: 20,
    chip: 16,
    pill: 999,
  },

  font: {
    title: 22,
    section: 12,
    body: 16,
    hint: 12,
    label: 14,
  },

  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    screenX: 16,
  },

  shadow: {
    soft: {
      shadowColor: p.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 1,
    },
    card: {
      shadowColor: p.ink,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 1,
    },
    float: {
      shadowColor: p.ink,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 20,
      elevation: 5,
    },
    accent: {
      shadowColor: p.coral,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 2,
    },
  },

  touch: {
    minMain: 56,
    minFloat: 44,
  },
} as const;

export type KidsTheme = typeof kidsTheme;

const t = kidsTheme;

/**
 * Soft Pop 可复用组件样式 — 设置 / overlay / 表单优先引用，保证视觉一致。
 *
 * 控件语言（统一）：
 *   背景 = controlBg（近白）
 *   描边 = controlBorder（暖墨浅描边）
 *   阴影 = soft（轻、一致）
 *   强调 = coral（仅选中 / 主按钮）
 */
export const themeStyles = {
  /** 全屏 / overlay 底 */
  screen: {
    flex: 1,
    backgroundColor: t.colors.overlayBg,
  } satisfies ViewStyle,

  /** 分区标题 */
  sectionTitle: {
    color: t.colors.cloudGray,
    fontSize: t.font.section,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 22,
    marginBottom: 12,
    paddingLeft: 6,
    textTransform: "uppercase",
  } satisfies TextStyle,

  /** 列表 / 内容卡片 */
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.controlBg,
    borderRadius: t.radius.card,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: t.colors.controlBorder,
    ...t.shadow.soft,
  } satisfies ViewStyle,

  /** 表单区块容器 */
  panel: {
    backgroundColor: t.colors.controlBg,
    borderRadius: t.radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: t.colors.controlBorder,
    ...t.shadow.soft,
  } satisfies ViewStyle,

  /** 弱化信息条 */
  mutedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: t.colors.controlBorder,
  } satisfies ViewStyle,

  /** 胶囊返回 / 次要操作 — 与卡片同色同边 */
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: t.colors.controlBg,
    borderRadius: t.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: t.colors.controlBorder,
    ...t.shadow.soft,
  } satisfies ViewStyle,
  btnGhostText: {
    color: t.colors.ink,
    fontSize: t.font.label,
    fontWeight: "700",
  } satisfies TextStyle,

  /** 主按钮（保存等） */
  btnPrimary: {
    borderRadius: t.radius.pill,
    paddingVertical: 12,
    backgroundColor: t.colors.coral,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.colors.coral,
    ...t.shadow.accent,
  } satisfies ViewStyle,
  btnPrimaryText: {
    color: t.colors.textOnAccent,
    fontSize: 14,
    fontWeight: "700",
  } satisfies TextStyle,
  btnPrimaryDisabled: {
    backgroundColor: t.colors.disabled,
    borderColor: t.colors.controlBorder,
    shadowOpacity: 0,
    elevation: 0,
  } satisfies ViewStyle,

  /** 次要 / 清除按钮 — 同套描边语言 */
  btnSecondary: {
    borderRadius: t.radius.pill,
    paddingVertical: 12,
    backgroundColor: t.colors.controlBg,
    borderWidth: 1,
    borderColor: t.colors.controlBorder,
    alignItems: "center",
  } satisfies ViewStyle,
  btnSecondaryText: {
    color: t.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  } satisfies TextStyle,

  /** 描边强调按钮 — 珊瑚软底，不用第三方色 */
  btnOutline: {
    borderRadius: t.radius.pill,
    paddingVertical: 11,
    backgroundColor: t.colors.primarySoft,
    borderWidth: 1,
    borderColor: t.colors.controlBorder,
    alignItems: "center",
  } satisfies ViewStyle,
  btnOutlineText: {
    color: t.colors.coral,
    fontSize: 14,
    fontWeight: "700",
  } satisfies TextStyle,

  /** 选择芯片 — 未选中与卡片一致 */
  chip: {
    backgroundColor: t.colors.controlBg,
    borderRadius: t.radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: t.colors.controlBorder,
    alignItems: "center",
    ...t.shadow.soft,
  } satisfies ViewStyle,
  chipActive: {
    backgroundColor: t.colors.coral,
    borderColor: t.colors.coral,
    ...t.shadow.accent,
  } satisfies ViewStyle,
  chipText: {
    color: t.colors.ink,
    fontSize: 15,
    fontWeight: "700",
  } satisfies TextStyle,
  chipTextActive: {
    color: t.colors.textOnAccent,
  } satisfies TextStyle,
  chipHint: {
    color: t.colors.cloudGray,
    fontSize: 11,
    marginTop: 2,
  } satisfies TextStyle,
  chipHintActive: {
    color: t.colors.textOnAccent,
    opacity: 0.9,
  } satisfies TextStyle,

  /** 表单输入 — 同套描边 */
  input: {
    flex: 1,
    backgroundColor: t.colors.surfaceInput,
    borderRadius: t.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: t.colors.ink,
    fontSize: 14,
    borderWidth: 1,
    borderColor: t.colors.controlBorder,
  } satisfies TextStyle,

  /** 顶栏标题短线 */
  titleAccent: {
    marginTop: 8,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: t.colors.coral,
  } satisfies ViewStyle,

  /** 图标井 — 统一珊瑚软底 */
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    backgroundColor: t.colors.iconWell,
  } satisfies ViewStyle,
} as const;
