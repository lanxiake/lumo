/**
 * pet-agent-loader — 宠物 Agent 定义加载
 *
 * 加载内置或云端同步的 AgentDefinition（计划 §4.4 步骤 1）。
 * MVP：从内置 Agent 兜底镜像解析；未来可接云端同步。
 *
 * 移动端强制收窄 Agent 定义以对齐儿童安全边界：
 *  - permissionMode 收窄为 "default"（危险操作需确认，配合权限闸门）。
 *  - canSpawnSubAgents 强制 false（移动端不允许多 Agent，规范不在 MVP）。
 *  - disallowedTools 并入移动端禁止工具（双保险，配合 whitelist 双层过滤）。
 */

import {
  findBuiltInAgent,
  BUILT_IN_AGENTS,
  type AgentDefinition,
} from "@lumo/agent-runtime";
import { MOBILE_FORBIDDEN_TOOL_NAMES } from "../tools/mobile-tool-policy.js";

/** 解析并收窄一个移动端安全的 AgentDefinition */
export function loadPetAgentDefinition(agentId: string): AgentDefinition {
  const base =
    findBuiltInAgent(agentId) ?? findBuiltInAgent("assistant") ?? BUILT_IN_AGENTS[0];
  if (!base) {
    throw new Error(`[loadPetAgentDefinition] 找不到 Agent 定义: ${agentId}`);
  }
  return hardenForMobile(base);
}

/** 把任意 AgentDefinition 收窄到移动端安全约束 */
export function hardenForMobile(def: AgentDefinition): AgentDefinition {
  const existingDisallowed = def.disallowedTools ?? [];
  const merged = [
    ...existingDisallowed,
    ...MOBILE_FORBIDDEN_TOOL_NAMES.filter((t) => !existingDisallowed.includes(t)),
  ];
  return {
    ...def,
    permissionMode: "default",
    canSpawnSubAgents: false,
    disallowedTools: merged,
    // 内建 assistant 的 personality（=== Role ===，讲 spawn_agent/explore-plan-verify）
    // 在移动端全是死指令，会挤占并冲淡儿童提示词。
    personality: undefined,
  };
}
