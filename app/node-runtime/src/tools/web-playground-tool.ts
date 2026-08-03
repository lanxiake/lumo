/**
 * web-playground-tool — Agent 生成小游戏/特效/互动页面
 *
 * Node 侧只做参数校验、HTML 安全检查和事件转发，实际渲染由 RN WebView 完成。
 */

import { Type, type Static } from "@sinclair/typebox";
import type { MtBotToolConfig, AgentToolResult, ToolExecutionContext } from "@lumo/agent-runtime";
import type { MobileToolExecutionContext } from "../host/mobile-tool-context.js";
import type { MobileNodeEvent } from "../bridge/schema.js";
import { checkPlaygroundHtmlSafety, wrapPlaygroundHtml } from "./playground-html.js";

/** 安全校验与包装函数已抽到 playground-html（RN 与 Node 共用）；此处再导出保持兼容。 */
export { checkPlaygroundHtmlSafety, wrapPlaygroundHtml } from "./playground-html.js";

const WebPlaygroundParams = Type.Object({
  type: Type.Union([
    Type.Literal("game"),
    Type.Literal("effect"),
    Type.Literal("interactive"),
  ], { description: "页面类型" }),
  title: Type.String({ description: "展示标题" }),
  description: Type.String({ description: "儿童可理解的内容描述；做新游戏时请写清玩法细节，后台据此生成" }),
  html: Type.Optional(
    Type.String({
      description:
        "完整自包含 HTML。做全新游戏时【不要】自己写 html——留空即可，系统会在后台生成，你不用等；" +
        "仅当【改一改】已有游戏（先 get_edit_target 拿到原码）时才在原码上小改后传入。",
    }),
  ),
});

type WebPlaygroundInput = Static<typeof WebPlaygroundParams>;

export const createWebPlaygroundToolConfig: MtBotToolConfig<typeof WebPlaygroundParams> = {
  name: "create_web_playground",
  label: "打开互动页面",
  description:
    "创建一个可在 App 内安全运行的互动小游戏、动画特效或可玩页面。" +
    "生成的 HTML 必须完全自包含（内联所有 CSS/JS，不引用外部资源），适合 3-8 岁儿童操作。",
  parameters: WebPlaygroundParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    params: WebPlaygroundInput,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<{ ok: boolean; error?: string; status?: string }>> => {
    // 工具层强制确认门控：不依赖 AI 提示词自觉调用 confirm_activity。
    // 编辑既有游戏（getEditTarget 命中）视为孩子已发起，跳过确认，避免改一次问一次。
    const mobileCtx = context as MobileToolExecutionContext;

    // 未提供 html 且宿主支持后台生成 → 派发异步生成，本轮工具立即返回（主对话不被大段 HTML 阻塞）。
    // 编辑流（isEditing）总是带上改好的 html，走下方同步路径就地替换。
    if (!params.html && mobileCtx.generatePlayground) {
      mobileCtx.generatePlayground({ type: params.type, title: params.title, description: params.description });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, status: "generating" }) }],
        details: { ok: true, status: "generating" },
      };
    }
    if (!params.html) {
      const err = "缺少 html：宿主不支持后台生成时必须提供完整 html";
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: err }) }],
        details: { ok: false, error: err },
      };
    }

    const safety = checkPlaygroundHtmlSafety(params.html);
    if (!safety.safe) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: safety.reason }) }],
        details: { ok: false, error: safety.reason },
      };
    }

    const wrappedHtml = wrapPlaygroundHtml(params.html);
    const event: MobileNodeEvent = {
      type: "playground_open",
      payload: {
        type: params.type,
        title: params.title,
        html: wrappedHtml,
      },
    };
    (context as MobileToolExecutionContext).emit(event);

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      details: { ok: true },
    };
  },
};
