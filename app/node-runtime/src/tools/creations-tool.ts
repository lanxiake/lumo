/**
 * creations-tool — Agent 感知/复用已有创作的工具集
 *
 * 儿童场景下，孩子重复想玩类似游戏或画类似的画时，应优先复用已有资源而不是
 * 重新生成（省额度、稳定质量）。本文件提供：
 *  - list_my_creations：列出孩子已有的画/游戏 + 内置精品游戏，供 Agent 判断复用。
 *  - get_edit_target：编辑态下取当前游戏的原始 HTML，供 Agent 在其上修改。
 */

import { Type, type Static } from "typebox";
import type { MtBotToolConfig, AgentToolResult, ToolExecutionContext } from "@lumo/agent-runtime";
import type { MobileToolExecutionContext } from "../host/mobile-tool-context.js";
import { BUILTIN_GAME_META } from "../config/builtin-games.js";

// ── list_my_creations ────────────────────────────────────────────────────

const NoParams = Type.Object({});
type NoParamsInput = Static<typeof NoParams>;

interface CreationsListResult {
  images: { id: string; title: string; prompt?: string }[];
  games: { id: string; title: string }[];
  builtinGames: { id: string; title: string; ageRange: readonly [number, number] }[];
  /** 正在后台生成中的游戏标题（孩子问进度时据此如实回答，别瞎猜） */
  generatingGame?: string;
}

export const listMyCreationsToolConfig: MtBotToolConfig<typeof NoParams> = {
  name: "list_my_creations",
  label: "看看已有的画和游戏",
  description:
    "列出小主人已经画过的画、玩过/做过的游戏，以及可直接推荐的内置精品游戏。" +
    "在打算画新画或做新游戏之前，先调用这个看看有没有可以直接复用或稍作修改的，" +
    "避免重复生成。孩子想'再玩上次那个'时，也用这个找到对应游戏。" +
    "孩子问'游戏做好了吗/怎么样了'时，也用这个查真实进度：返回的 generatingGame 非空表示那个游戏还在做，" +
    "要如实说'还在做，马上好'；若该游戏已出现在 games 列表里则说做好了可以打开。",
  parameters: NoParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    _params: NoParamsInput,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<CreationsListResult>> => {
    const ctx = context as MobileToolExecutionContext;
    const creations = ctx.listCreations();
    const generating = ctx.getPendingPlayground?.() ?? null;
    const result: CreationsListResult = {
      images: creations
        .filter((c) => c.kind === "image")
        .map((c) => ({ id: c.id, title: c.title, ...(c.prompt ? { prompt: c.prompt } : {}) })),
      games: creations.filter((c) => c.kind === "game").map((c) => ({ id: c.id, title: c.title })),
      builtinGames: BUILTIN_GAME_META.map((g) => ({ id: g.id, title: g.title, ageRange: g.ageRange })),
      ...(generating ? { generatingGame: generating } : {}),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: result,
    };
  },
};

// ── open_creation ────────────────────────────────────────────────────────

const OpenCreationParams = Type.Object({
  id: Type.String({
    description: "要打开的游戏 id：内置精品库 id（如 builtin-fireworks）或 list_my_creations 返回的历史作品 id",
  }),
});

/** 内置游戏 id 集合（校验用，避免打开不存在的 id） */
const BUILTIN_GAME_IDS = new Set(BUILTIN_GAME_META.map((g) => g.id));

export const openCreationToolConfig: MtBotToolConfig<typeof OpenCreationParams> = {
  name: "open_creation",
  label: "打开游戏",
  description:
    "按 id 直接打开一个已有游戏——内置精品游戏或小主人做过/玩过的游戏。" +
    "孩子想玩某个游戏时，先用 list_my_creations 拿到 id，再用这个打开，秒开不卡。" +
    "这是打开已有游戏的唯一方式，不要用 app_navigate 切页面来打开游戏。",
  parameters: OpenCreationParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    params: Static<typeof OpenCreationParams>,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<{ ok: boolean; error?: string }>> => {
    const ctx = context as MobileToolExecutionContext;
    const isBuiltin = BUILTIN_GAME_IDS.has(params.id);
    const builtinTitle = BUILTIN_GAME_META.find((g) => g.id === params.id)?.title;
    const creation = ctx.listCreations().find((c) => c.id === params.id && c.kind === "game");

    if (!isBuiltin && !creation) {
      const err = `未找到 id=${params.id} 的游戏，请先用 list_my_creations 确认可用 id`;
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: err }) }],
        details: { ok: false, error: err },
      };
    }

    const title = builtinTitle ?? creation?.title ?? "游戏";
    ctx.emit({ type: "open_creation", payload: { id: params.id, title } });
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, id: params.id, title }) }],
      details: { ok: true },
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
    _params: NoParamsInput,
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
