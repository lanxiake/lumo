/**
 * mobile-permission-provider — 移动端权限交互（PermissionProvider 实现）
 *
 * MVP 所有儿童安全工具直接放行（allow-once），不引入家长确认往返。
 * P1 如需家长控制，可重新注入 ParentApproval。
 */

import type {
  PermissionProvider,
  PermissionRequest,
  PermissionDecisionOutcome,
} from "@lumo/agent-runtime";
import { resolveMobileToolPermission } from "../tools/mobile-tool-policy.js";

/**
 * 创建移动端 PermissionProvider。
 */
export function createMobilePermissionProvider(): PermissionProvider {
  return {
    async requestPermission(input: PermissionRequest): Promise<PermissionDecisionOutcome> {
      const policy = resolveMobileToolPermission(input.toolName);

      if (policy === "deny") {
        return "deny";
      }

      // MVP：所有白名单内工具直接 allow-once
      return "allow-once";
    },
  };
}
