/**
 * app-actions-tool 测试
 *
 * 验证 app_navigate / app_play_sound / app_show_toast 三个工具：
 *  - 执行后经 context.emit 发出对应事件
 *  - payload 字段正确（含默认值填充）
 */

import { describe, it, expect } from "vitest";
import {
  appNavigateToolConfig,
  appPlaySoundToolConfig,
  appShowToastToolConfig,
} from "../src/tools/app-actions-tool.js";
import type { MobileNodeEvent } from "../src/bridge/schema.js";
import type { MobileToolExecutionContext } from "../src/host/mobile-tool-context.js";

function fakeContext(sink: MobileNodeEvent[]): MobileToolExecutionContext {
  return {
    getCwd: () => "/kids-mobile/test",
    executeCommand: async () => {
      throw new Error("forbidden");
    },
    readFile: async () => {
      throw new Error("forbidden");
    },
    writeFile: async () => {
      throw new Error("forbidden");
    },
    glob: async () => {
      throw new Error("forbidden");
    },
    grep: async () => {
      throw new Error("forbidden");
    },
    fetch: async () => ({ status: 200, body: "" }),
    emit: (e) => sink.push(e),
    gatewayUrl: "https://gateway.test.local",
    getAuthToken: async () => "test-token",
    getDeviceId: () => "dev1",
    listCreations: () => [],
    getEditTarget: () => null,
    requestConfirm: async () => true,
  } as MobileToolExecutionContext;
}

describe("app_navigate", () => {
  it("发出 navigate 事件，target 透传，reason 缺省为空串", async () => {
    const sink: MobileNodeEvent[] = [];
    const res = await appNavigateToolConfig.execute("call-1", { target: "gallery" }, fakeContext(sink));
    expect(sink).toContainEqual({ type: "navigate", payload: { target: "gallery", reason: "" } });
    expect(res.details).toEqual({ ok: true });
  });

  it("携带 reason 时透传", async () => {
    const sink: MobileNodeEvent[] = [];
    await appNavigateToolConfig.execute("c", { target: "pet_stage", reason: "回舞台" }, fakeContext(sink));
    expect(sink[0]).toEqual({ type: "navigate", payload: { target: "pet_stage", reason: "回舞台" } });
  });
});

describe("app_play_sound", () => {
  it("发出 play_sound 事件，volume 缺省为 0.8", async () => {
    const sink: MobileNodeEvent[] = [];
    await appPlaySoundToolConfig.execute("c", { sound: "success" }, fakeContext(sink));
    expect(sink).toContainEqual({ type: "play_sound", payload: { sound: "success", volume: 0.8 } });
  });
});

describe("app_show_toast", () => {
  it("发出 show_toast 事件，style 缺省为 info", async () => {
    const sink: MobileNodeEvent[] = [];
    await appShowToastToolConfig.execute("c", { text: "真棒" }, fakeContext(sink));
    expect(sink).toContainEqual({ type: "show_toast", payload: { text: "真棒", style: "info" } });
  });
});
