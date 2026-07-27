/**
 * builtin-games（node 侧元信息）— 供 Agent 从内置游戏库按年龄/兴趣推荐。
 *
 * 只含 id/title/ageRange/category，不含 html（大字段留在 RN 侧 builtinGames.ts）。
 * RN 与 node 两份清单的 id/title 必须保持一致（内置库变更时同步更新）。
 */

export interface BuiltinGameMeta {
  readonly id: string;
  readonly title: string;
  readonly category: "game" | "effect" | "interactive";
  readonly ageRange: readonly [number, number];
}

export const BUILTIN_GAME_META: readonly BuiltinGameMeta[] = [
  { id: "builtin-fireworks", title: "梦幻烟花秀", category: "effect", ageRange: [3, 8] },
  { id: "builtin-piano", title: "钢琴弹儿歌", category: "interactive", ageRange: [3, 8] },
  { id: "builtin-catch-star", title: "接数字星星", category: "game", ageRange: [3, 8] },
  { id: "builtin-paint", title: "描红学画画", category: "interactive", ageRange: [3, 8] },
  { id: "builtin-literacy", title: "认字学拼音", category: "interactive", ageRange: [3, 8] },
  { id: "builtin-math", title: "快乐学数学", category: "game", ageRange: [4, 8] },
];
