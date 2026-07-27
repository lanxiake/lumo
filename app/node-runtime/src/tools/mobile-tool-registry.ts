/**
 * mobile-tool-registry — 移动端安全工具注册表
 *
 * 从 agent-runtime 的 ALL_BUILT_IN_TOOL_CONFIGS 中，按 mobile-safe whitelist
 * 挑出可注册的工具配置，绑定 ToolExecutionContext 成可执行 MtBotTool。
 *
 * 这是双层过滤的第一层（构造安全候选集）；第二层由 host-kit
 * filterToolsByDefinition() 按 AgentDefinition 再过滤（规范 §4.1）。
 *
 * 注意：本注册表只产出「白名单内且平台可执行」的工具。运行时权限语义
 * （allow / deny）由 mobile-permission-provider 结合 mobile-tool-policy 二次裁决。
 * MVP 所有白名单内工具直接 allow，无家长确认往返。
 */

import {
  ALL_BUILT_IN_TOOL_CONFIGS,
  createMtBotTool,
  type MtBotTool,
  type MtBotToolConfig,
  type ToolExecutionContext,
} from "@lumo/agent-runtime";
import { isMobileSafeTool } from "./mobile-tool-policy.js";
import {
  appNavigateToolConfig,
  appPlaySoundToolConfig,
  appShowToastToolConfig,
} from "./app-actions-tool.js";
import { createWebPlaygroundToolConfig } from "./web-playground-tool.js";
import { mobileImageGenerateToolConfig } from "./mobile-image-tool.js";
import { listMyCreationsToolConfig, getEditTargetToolConfig } from "./creations-tool.js";
import { updateChildProfileToolConfig } from "./update-child-profile-tool.js";
import type { MobileToolExecutionContext } from "../host/mobile-tool-context.js";

/**
 * 构建移动端安全候选工具集。
 *
 * @param toolContext 平台能力上下文（移动端受限：无 shell/file，见 mobile-tool-context）
 * @returns 已绑定上下文、仅含 mobile-safe 白名单的 MtBotTool[]
 */
export function buildMobileToolRegistry(toolContext: ToolExecutionContext): MtBotTool[] {
  const mobileContext = toolContext as MobileToolExecutionContext;
  const byName = new Map<string, MtBotToolConfig>(
    ALL_BUILT_IN_TOOL_CONFIGS.map((c) => [c.name, c as MtBotToolConfig]),
  );

  const tools: MtBotTool[] = [];
  for (const [name, cfg] of byName) {
    if (!isMobileSafeTool(name)) continue;
    // image_generate 由 mobileImageGenerateToolConfig 替代（经 Gateway 生图 + emit image_ready）
    if (name === "image_generate") continue;
    tools.push(createMtBotTool(cfg, toolContext));
  }

  // App Action、互动页面与图片生成是 kids-mobile 特有，不在 ALL_BUILT_IN_TOOL_CONFIGS 中
  const mobileTools: MtBotTool[] = [
    createMtBotTool(mobileImageGenerateToolConfig, toolContext) as unknown as MtBotTool,
    createMtBotTool(appNavigateToolConfig, toolContext) as unknown as MtBotTool,
    createMtBotTool(appPlaySoundToolConfig, toolContext) as unknown as MtBotTool,
    createMtBotTool(appShowToastToolConfig, toolContext) as unknown as MtBotTool,
    createMtBotTool(createWebPlaygroundToolConfig, toolContext) as unknown as MtBotTool,
    createMtBotTool(listMyCreationsToolConfig, toolContext) as unknown as MtBotTool,
    createMtBotTool(getEditTargetToolConfig, toolContext) as unknown as MtBotTool,
    createMtBotTool(updateChildProfileToolConfig, toolContext) as unknown as MtBotTool,
  ];
  tools.push(...mobileTools);

  return tools;
}
