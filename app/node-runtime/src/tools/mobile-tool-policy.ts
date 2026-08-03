/**
 * mobile-tool-policy — 移动端安全工具白名单策略
 *
 * 儿童手机宠物 App 的工具安全边界（规范 §4）。最终工具由两层过滤得到：
 *   AgentDefinition 工具配置 ∩ mobile-safe whitelist
 * 本文件定义 mobile-safe whitelist 与各工具的默认权限语义。
 *
 * 安全不变量：
 *  - 禁止 shell / bash / 文件读写 / glob / grep / cron / skill_invoke 等高危工具（§4.3）
 *  - MVP 所有白名单内儿童安全工具直接放行，不引入家长确认往返
 *  - 图片生成与小游戏由 Prompt / Gateway 额度做二次约束，不在权限层拦截
 */

/** 移动端允许注册的工具名（mobile-safe whitelist，规范 §4.2 / MVP 设计 §3） */
export const MOBILE_SAFE_TOOL_NAMES: readonly string[] = [
  "message",
  "task_complete",
  "image_generate",
  "create_web_playground",
  "app_navigate",
  "app_play_sound",
  "app_show_toast",
  "list_my_creations",
  "open_creation",
  "get_edit_target",
  "update_child_profile",
  "web_search",
  "web_fetch",
];

/**
 * 移动端明确禁止的工具名（规范 §4.3）。
 * 即便 AgentDefinition 白名单包含，也不得注册/执行。
 * 作为白名单之外的显式黑名单双保险（防未来 whitelist 误扩）。
 */
export const MOBILE_FORBIDDEN_TOOL_NAMES: readonly string[] = [
  "bash",
  "file_read",
  "file_write",
  "file_edit",
  "glob",
  "grep",
  "cron_create",
  "cron_list",
  "cron_delete",
  "skill_invoke",
  "spawn_agent",
  "send_message",
  "nodes",
  "settings_backend",
  "settings_think",
  "system_prompt",
  "session_create",
  "session_clear",
  "session_compact",
  "session_resume",
  "agent_remove",
  "agent_team_generate",
  "agent_team_optimize",
  "memory_manage",
  "profile_memory",
];

/** 工具权限语义 */
export type MobileToolPermission =
  /** 直接放行（只读、儿童安全） */
  | "allow"
  /** 直接拒绝（不在白名单或在黑名单） */
  | "deny";

/**
 * 各工具的默认权限语义（规范 §3.2 / MVP 设计 §3）。
 * MVP 所有儿童安全工具直接放行；未列出的工具默认 deny。
 */
const MOBILE_TOOL_PERMISSIONS: Readonly<Record<string, MobileToolPermission>> = {
  message: "allow",
  task_complete: "allow",
  image_generate: "allow",
  create_web_playground: "allow",
  app_navigate: "allow",
  app_play_sound: "allow",
  app_show_toast: "allow",
  list_my_creations: "allow",
  open_creation: "allow",
  get_edit_target: "allow",
  update_child_profile: "allow",
  web_search: "allow",
  web_fetch: "allow",
};

/** 某工具名是否属于移动端安全白名单 */
export function isMobileSafeTool(toolName: string): boolean {
  return MOBILE_SAFE_TOOL_NAMES.includes(toolName) && !MOBILE_FORBIDDEN_TOOL_NAMES.includes(toolName);
}

/** 解析某工具的默认权限语义（未知工具一律 deny） */
export function resolveMobileToolPermission(toolName: string): MobileToolPermission {
  if (MOBILE_FORBIDDEN_TOOL_NAMES.includes(toolName)) return "deny";
  if (!MOBILE_SAFE_TOOL_NAMES.includes(toolName)) return "deny";
  return MOBILE_TOOL_PERMISSIONS[toolName] ?? "deny";
}
