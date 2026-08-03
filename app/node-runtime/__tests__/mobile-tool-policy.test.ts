import { describe, it, expect } from "vitest";
import {
  isMobileSafeTool,
  resolveMobileToolPermission,
  MOBILE_SAFE_TOOL_NAMES,
  MOBILE_FORBIDDEN_TOOL_NAMES,
} from "../src/tools/mobile-tool-policy.js";

describe("mobile-tool-policy", () => {
  it("白名单工具被识别为 mobile-safe", () => {
    for (const name of MOBILE_SAFE_TOOL_NAMES) {
      expect(isMobileSafeTool(name)).toBe(true);
    }
  });

  it("高危工具（shell/file/cron/skill_invoke）不在白名单", () => {
    for (const name of ["bash", "file_write", "file_read", "glob", "grep", "cron_create", "skill_invoke", "spawn_agent"]) {
      expect(isMobileSafeTool(name)).toBe(false);
    }
  });

  it("黑名单优先：即便误入白名单也被拒", () => {
    for (const name of MOBILE_FORBIDDEN_TOOL_NAMES) {
      expect(isMobileSafeTool(name)).toBe(false);
      expect(resolveMobileToolPermission(name)).toBe("deny");
    }
  });

  it("白名单含网络搜索与档案更新（儿童安全只读+创作工具）", () => {
    expect([...MOBILE_SAFE_TOOL_NAMES].sort()).toEqual(
      [
        "app_navigate",
        "app_play_sound",
        "app_show_toast",
        "create_web_playground",
        "get_edit_target",
        "image_generate",
        "list_my_creations",
        "open_creation",
        "message",
        "task_complete",
        "update_child_profile",
        "web_fetch",
        "web_search",
      ].sort(),
    );
  });

  it("web_search / web_fetch / update_child_profile 直接放行", () => {
    expect(resolveMobileToolPermission("web_search")).toBe("allow");
    expect(resolveMobileToolPermission("web_fetch")).toBe("allow");
    expect(resolveMobileToolPermission("update_child_profile")).toBe("allow");
  });

  it("复用/编辑工具直接放行", () => {
    expect(resolveMobileToolPermission("list_my_creations")).toBe("allow");
    expect(resolveMobileToolPermission("get_edit_target")).toBe("allow");
  });

  it("confirm_activity 已移除（确认改由工具层强制门控）", () => {
    expect(resolveMobileToolPermission("confirm_activity")).toBe("deny");
  });

  it("image_generate 完全放行（靠 Prompt/Gateway 额度约束）", () => {
    expect(resolveMobileToolPermission("image_generate")).toBe("allow");
  });

  it("App Action 工具直接放行", () => {
    expect(resolveMobileToolPermission("app_navigate")).toBe("allow");
    expect(resolveMobileToolPermission("app_play_sound")).toBe("allow");
    expect(resolveMobileToolPermission("app_show_toast")).toBe("allow");
    expect(resolveMobileToolPermission("create_web_playground")).toBe("allow");
  });

  it("memory/skill 等仍不在白名单，返回 deny", () => {
    for (const name of ["memory_read", "skill_list", "info_status"]) {
      expect(isMobileSafeTool(name)).toBe(false);
      expect(resolveMobileToolPermission(name)).toBe("deny");
    }
  });

  it("未知工具默认拒绝", () => {
    expect(resolveMobileToolPermission("some_unknown_tool")).toBe("deny");
    expect(isMobileSafeTool("some_unknown_tool")).toBe(false);
  });
});
