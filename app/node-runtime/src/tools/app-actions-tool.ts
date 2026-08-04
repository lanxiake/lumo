/**
 * app-actions-tool — Agent 直接控制 App 的工具集合
 *
 * MVP 儿童场景下，Agent 需要直接操作 App 界面（导航、音效、提示），
 * 降低儿童操作难度。本文件定义 app_navigate / app_play_sound / app_show_toast
 * 三个工具，通过 ToolExecutionContext.emit 将事件发回 RN。
 */

import { Type, type Static } from "typebox";
import type { MtBotToolConfig, AgentToolResult, ToolExecutionContext } from "@lumo/agent-runtime";
import type { MobileToolExecutionContext } from "../host/mobile-tool-context.js";
import type { MobileNodeEvent } from "../bridge/schema.js";

// ── app_navigate ───────────────────────────────────────────────────────────

const AppNavigateParams = Type.Object({
  target: Type.Union([
    Type.Literal("pet_stage"),
    Type.Literal("gallery"),
    Type.Literal("chat_history"),
    Type.Literal("pet_selection"),
  ], {
    description: "要切换到的儿童安全页面",
  }),
  reason: Type.Optional(Type.String({ description: "给 RN 的说明" })),
});

type AppNavigateInput = Static<typeof AppNavigateParams>;

export const appNavigateToolConfig: MtBotToolConfig<typeof AppNavigateParams> = {
  name: "app_navigate",
  label: "切换页面",
  description:
    "直接切换到 App 内的儿童安全页面。不要询问孩子，直接执行并语音告知。" +
    "可切换：pet_stage（宠物舞台）、gallery（画廊）、chat_history（聊天回顾）、pet_selection（宠物选择展示）。",
  parameters: AppNavigateParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    params: AppNavigateInput,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<{ ok: boolean }>> => {
    const event: MobileNodeEvent = {
      type: "navigate",
      payload: { target: params.target, reason: params.reason ?? "" },
    };
    (context as MobileToolExecutionContext).emit(event);
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, target: params.target }) }],
      details: { ok: true },
    };
  },
};

// ── app_play_sound ─────────────────────────────────────────────────────────

const AppPlaySoundParams = Type.Object({
  sound: Type.Union([
    Type.Literal("success"),
    Type.Literal("encourage"),
    Type.Literal("tick"),
    Type.Literal("pop"),
    Type.Literal("complete"),
    Type.Literal("error"),
  ], {
    description: "音效类型",
  }),
  volume: Type.Optional(Type.Number({ minimum: 0, maximum: 1, description: "音量 0-1，默认 0.8" })),
});

type AppPlaySoundInput = Static<typeof AppPlaySoundParams>;

export const appPlaySoundToolConfig: MtBotToolConfig<typeof AppPlaySoundParams> = {
  name: "app_play_sound",
  label: "播放音效",
  description: "播放一个短音效，用于吸引儿童注意或提供操作反馈。",
  parameters: AppPlaySoundParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    params: AppPlaySoundInput,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<{ ok: boolean }>> => {
    const event: MobileNodeEvent = {
      type: "play_sound",
      payload: { sound: params.sound, volume: params.volume ?? 0.8 },
    };
    (context as MobileToolExecutionContext).emit(event);
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, sound: params.sound }) }],
      details: { ok: true },
    };
  },
};

// ── app_show_toast ─────────────────────────────────────────────────────────

const AppShowToastParams = Type.Object({
  text: Type.String({ maxLength: 20, description: "提示文本，不超过 10 个汉字为宜" }),
  style: Type.Optional(Type.Union([
    Type.Literal("info"),
    Type.Literal("success"),
    Type.Literal("hint"),
  ], { description: "提示样式" })),
});

type AppShowToastInput = Static<typeof AppShowToastParams>;

export const appShowToastToolConfig: MtBotToolConfig<typeof AppShowToastParams> = {
  name: "app_show_toast",
  label: "显示提示",
  description: "在屏幕上显示一个简短、大字、易懂的提示气泡，帮助儿童理解当前状态。",
  parameters: AppShowToastParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    params: AppShowToastInput,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<{ ok: boolean }>> => {
    const event: MobileNodeEvent = {
      type: "show_toast",
      payload: { text: params.text, style: params.style ?? "info" },
    };
    (context as MobileToolExecutionContext).emit(event);
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      details: { ok: true },
    };
  },
};
