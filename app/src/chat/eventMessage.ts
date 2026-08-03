/**
 * eventMessage — 聊天记录中的"系统事件"消息编解码
 *
 * image_ready / playground_open / 工具调用 等 App Action 触发时，在聊天记录里
 * 插入一条事件卡片，方便小朋友事后回顾"画了什么/生成了什么游戏/宠物在忙什么"
 * 并点击跳转查看。
 *
 * 缩略图策略：
 *  - image_ready 存 data URI（图片已在内存，自包含），聊天里直接渲染缩略图。
 *  - playground_open 只存 gameId（引用 GameEntry.id），缩略图由 ChatHistory
 *    按 id 查 gameHistory 取 html 渲染，避免在消息里重复存大字段 html。
 */

export interface ImageReadyEventPayload {
  readonly kind: "image_ready";
  readonly prompt?: string;
  /** 图片 data URI，用于聊天缩略图；缺省则退化为纯文字卡片 */
  readonly url?: string;
}

export interface PlaygroundOpenEventPayload {
  readonly kind: "playground_open";
  readonly title: string;
  /** 引用 GameEntry.id，用于查 html 渲染缩略图与点击重玩 */
  readonly gameId?: string;
}

/** 工具调用过程（对齐 Windows：工具名 + 开始/结束状态） */
export interface ToolActivityEventPayload {
  readonly kind: "tool_activity";
  /** 原始工具名（如 web_search / create_web_playground） */
  readonly toolName: string;
  /** 中文可读标签（见 toolLabelFor） */
  readonly toolLabel: string;
  readonly status: "start" | "done";
  /** status=done 时是否成功 */
  readonly ok?: boolean;
  /** 用于把 start/end 合并为同一张卡片 */
  readonly toolCallId?: string;
  /** 入参摘要（脱敏截断），status=start 时展示 */
  readonly paramsSummary?: string;
  /** 结果摘要（脱敏截断），status=done 时展示 */
  readonly resultSummary?: string;
}

export type ChatEventPayload =
  | ImageReadyEventPayload
  | PlaygroundOpenEventPayload
  | ToolActivityEventPayload;

/** 事件消息在 MessageRow 中的角色标识 */
export const EVENT_MESSAGE_ROLE = "event";

const EVENT_KINDS = ["image_ready", "playground_open", "tool_activity"] as const;

/**
 * 工具名 → 儿童可读中文标签；未知工具回退为原始工具名（避免一律「忙活」）。
 */
export function toolLabelFor(toolName: string): string {
  switch (toolName) {
    case "image_generate":
      return "画画";
    case "create_web_playground":
      return "做小游戏";
    case "web_fetch":
    case "web_search":
      return "查资料";
    case "list_my_creations":
      return "找作品";
    case "open_creation":
      return "打开游戏";
    case "get_edit_target":
      return "改游戏";
    case "app_navigate":
      return "切页面";
    case "app_play_sound":
      return "播音效";
    case "app_show_toast":
      return "大字提示";
    case "update_child_profile":
      return "记小主人";
    case "message":
      return "发消息";
    case "task_complete":
      return "完成任务";
    default:
      return toolName;
  }
}

/** 工具名 → emoji 图标；未知工具回退扳手。 */
export function toolIconFor(toolName: string): string {
  switch (toolName) {
    case "image_generate":
      return "🎨";
    case "create_web_playground":
      return "🎮";
    case "web_fetch":
    case "web_search":
      return "🔍";
    case "list_my_creations":
      return "📁";
    case "open_creation":
      return "🎮";
    case "get_edit_target":
      return "✏️";
    case "app_navigate":
      return "🧭";
    case "app_play_sound":
      return "🔊";
    case "app_show_toast":
      return "💬";
    case "update_child_profile":
      return "👶";
    case "message":
      return "✉️";
    case "task_complete":
      return "🎉";
    default:
      return "🔧";
  }
}

export interface ToolCardView {
  /** emoji 图标 */
  readonly icon: string;
  /** 儿童可读工具标签 */
  readonly label: string;
  /** 状态短语（进行中/完成/没成功） */
  readonly statusText: string;
  /** 语义色调，供 UI 选择卡片配色 */
  readonly tone: "running" | "done" | "error";
  /** 明细行（入参或结果摘要），供卡片展开展示；无摘要则缺省 */
  readonly detail?: string;
}

/**
 * 把 tool_activity 事件拆成结构化卡片视图（图标 + 标签 + 状态徽章）。
 * 供 HUD ChatHistory 与设置页 ChatHistoryScreen 共用，保证两端卡片一致。
 */
export function toolCardView(payload: ToolActivityEventPayload): ToolCardView {
  const label = payload.toolLabel || toolLabelFor(payload.toolName);
  const icon = toolIconFor(payload.toolName);
  if (payload.status === "start") {
    return {
      icon, label, statusText: "进行中…", tone: "running",
      ...(payload.paramsSummary ? { detail: `“${payload.paramsSummary}”` } : {}),
    };
  }
  // 完成时优先展示结果摘要；缺省回退到入参摘要（合并卡片时 start 的入参仍有参考价值）
  const raw = payload.resultSummary || payload.paramsSummary;
  const detail = raw ? `“${raw}”` : undefined;
  if (payload.ok === false) {
    return { icon, label, statusText: "没成功", tone: "error", ...(detail ? { detail } : {}) };
  }
  return { icon, label, statusText: "完成", tone: "done", ...(detail ? { detail } : {}) };
}

export function encodeEventMessage(payload: ChatEventPayload): string {
  return JSON.stringify(payload);
}

export function decodeEventMessage(content: string): ChatEventPayload | null {
  try {
    const obj = JSON.parse(content);
    if (obj && (EVENT_KINDS as readonly string[]).includes(obj.kind)) {
      // 兼容旧消息：缺 toolName 时用 toolLabel 兜底
      if (obj.kind === "tool_activity" && typeof obj.toolName !== "string") {
        return {
          ...obj,
          toolName: typeof obj.toolLabel === "string" ? obj.toolLabel : "tool",
        } as ChatEventPayload;
      }
      return obj as ChatEventPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** 事件卡片展示文案（图标 + 工具名 + 开始/结束状态） */
export function eventCardLabel(payload: ChatEventPayload): string {
  if (payload.kind === "image_ready") {
    return payload.prompt ? `🎨 画了一张"${payload.prompt}"，点击查看` : "🎨 画好啦，点击查看";
  }
  if (payload.kind === "playground_open") {
    return `🎮 "${payload.title}" 已生成，点击开始`;
  }
  const name = payload.toolName || payload.toolLabel;
  const label = payload.toolLabel && payload.toolLabel !== name ? `（${payload.toolLabel}）` : "";
  if (payload.status === "start") {
    return `🔧 开始 · ${name}${label}`;
  }
  return payload.ok === false ? `😅 失败 · ${name}${label}` : `✅ 完成 · ${name}${label}`;
}
