/**
 * creations-tool — Agent 感知/复用已有创作的工具集
 *
 * 儿童场景下，孩子重复想玩类似游戏或画类似的画时，应优先复用已有资源而不是
 * 重新生成（省额度、稳定质量）。本文件提供：
 *  - list_my_creations：列出孩子已有的画/游戏 + 内置精品游戏，供 Agent 判断复用。
 *  - get_edit_target：编辑态下取当前游戏的原始 HTML，供 Agent 在其上修改。
 */

import { Type } from "@sinclair/typebox";
import type { MtBotToolConfig, AgentToolResult, ToolExecutionContext } from "@lumo/agent-runtime";
import type { MobileToolExecutionContext } from "../host/mobile-tool-context.js";
import { BUILTIN_GAME_META } from "../config/builtin-games.js";

// ── list_my_creations ────────────────────────────────────────────────────

const NoParams = Type.Object({});

interface CreationsListResult {
  images: { id: string; title: string; prompt?: string }[];
  games: { id: string; title: string }[];
  builtinGames: { id: string; title: string; ageRange: readonly [number, number] }[];
}

export const listMyCreationsToolConfig: MtBotToolConfig<typeof NoParams> = {
  name: "list_my_creations",
  label: "看看已有的画和游戏",
  description:
    "列出小主人已经画过的画、玩过/做过的游戏，以及可直接推荐的内置精品游戏。" +
    "在打算画新画或做新游戏之前，先调用这个看看有没有可以直接复用或稍作修改的，" +
    "避免重复生成。孩子想'再玩上次那个'时，也用这个找到对应游戏。",
  parameters: NoParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    _params: Record<string, never>,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<CreationsListResult>> => {
    const ctx = context as MobileToolExecutionContext;
    const creations = ctx.listCreations();
    const result: CreationsListResult = {
      images: creations
        .filter((c) => c.kind === "image")
        .map((c) => ({ id: c.id, title: c.title, ...(c.prompt ? { prompt: c.prompt } : {}) })),
      games: creations.filter((c) => c.kind === "game").map((c) => ({ id: c.id, title: c.title })),
      builtinGames: BUILTIN_GAME_META.map((g) => ({ id: g.id, title: g.title, ageRange: g.ageRange })),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: result,
    };
  },
};

// ── get_edit_target ──────────────────────────────────────────────────────

interface EditTargetResult {
  editing: boolean;
  gameId?: string;
  title?: string;
  html?: string;
}

export const getEditTargetToolConfig: MtBotToolConfig<typeof NoParams> = {
  name: "get_edit_target",
  label: "取要修改的游戏",
  description:
    "当小主人要求'改一改'某个已有游戏时，先用这个取回该游戏的原始 HTML 代码，" +
    "在原代码基础上做尽量小的修改，再用 create_web_playground 生成改好的版本（标题保持不变）。",
  parameters: NoParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    _params: Record<string, never>,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<EditTargetResult>> => {
    const ctx = context as MobileToolExecutionContext;
    const target = ctx.getEditTarget();
    const result: EditTargetResult = target
      ? { editing: true, gameId: target.gameId, title: target.title, html: target.html }
      : { editing: false };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: result,
    };
  },
};
