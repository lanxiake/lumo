/**
 * creations / confirm / edit 工具测试
 *
 * 验证：
 *  - list_my_creations 返回已有创作 + 内置游戏清单
 *  - get_edit_target 在编辑态返回原始 html，非编辑态返回 editing:false
 *  - confirm_activity 经 requestConfirm 往返返回 approved
 */

import { describe, it, expect } from "vitest";
import { listMyCreationsToolConfig, openCreationToolConfig, getEditTargetToolConfig } from "../src/tools/creations-tool.js";
import { createWebPlaygroundToolConfig } from "../src/tools/web-playground-tool.js";
import { BUILTIN_GAME_META } from "../src/config/builtin-games.js";
import type { MobileToolExecutionContext, EditTarget } from "../src/host/mobile-tool-context.js";
import type { CreationMeta } from "../src/bridge/schema.js";

function fakeCtx(over: Partial<MobileToolExecutionContext> = {}): MobileToolExecutionContext {
  return {
    getCwd: () => "/kids-mobile/test",
    executeCommand: async () => { throw new Error("forbidden"); },
    readFile: async () => { throw new Error("forbidden"); },
    writeFile: async () => { throw new Error("forbidden"); },
    glob: async () => { throw new Error("forbidden"); },
    grep: async () => { throw new Error("forbidden"); },
    fetch: async () => ({ status: 200, body: "" }),
    emit: () => {},
    gatewayUrl: "https://test.local",
    getAuthToken: async () => "jwt",
    getDeviceId: () => "dev1",
    listCreations: () => [],
    getEditTarget: () => null,
    requestConfirm: async () => true,
    ...over,
  } as MobileToolExecutionContext;
}

describe("list_my_creations", () => {
  it("返回已有画/游戏 + 内置游戏清单", async () => {
    const creations: CreationMeta[] = [
      { kind: "image", id: "i1", title: "猫", prompt: "橘猫" },
      { kind: "game", id: "g1", title: "我的泡泡" },
    ];
    const res = await listMyCreationsToolConfig.execute(
      "t1",
      {},
      fakeCtx({ listCreations: () => creations }),
    );
    const d = res.details as {
      images: unknown[];
      games: unknown[];
      builtinGames: unknown[];
    };
    expect(d.images).toHaveLength(1);
    expect(d.games).toHaveLength(1);
    expect(d.builtinGames).toHaveLength(BUILTIN_GAME_META.length);
  });
});

describe("open_creation", () => {
  it("内置游戏 id → emit open_creation", async () => {
    let ev: { type: string; payload: { id: string; title: string } } | null = null;
    const res = await openCreationToolConfig.execute(
      "t1",
      { id: "builtin-fireworks" },
      fakeCtx({ emit: (e) => { ev = e as typeof ev; } }),
    );
    expect((res.details as { ok: boolean }).ok).toBe(true);
    expect(ev!.type).toBe("open_creation");
    expect(ev!.payload.id).toBe("builtin-fireworks");
    expect(ev!.payload.title).toBe("梦幻烟花秀");
  });

  it("历史作品 id → emit（title 取自 listCreations）", async () => {
    let ev: { payload: { title: string } } | null = null;
    const res = await openCreationToolConfig.execute(
      "t1",
      { id: "g1" },
      fakeCtx({
        listCreations: () => [{ kind: "game", id: "g1", title: "我的泡泡" }],
        emit: (e) => { ev = e as typeof ev; },
      }),
    );
    expect((res.details as { ok: boolean }).ok).toBe(true);
    expect(ev!.payload.title).toBe("我的泡泡");
  });

  it("未知 id → ok:false 且不 emit", async () => {
    let emitted = false;
    const res = await openCreationToolConfig.execute(
      "t1",
      { id: "nope" },
      fakeCtx({ emit: () => { emitted = true; } }),
    );
    expect((res.details as { ok: boolean }).ok).toBe(false);
    expect(emitted).toBe(false);
  });
});

describe("get_edit_target", () => {
  it("编辑态返回原始 html", async () => {
    const target: EditTarget = { gameId: "g1", title: "泡泡", html: "<html>x</html>" };
    const res = await getEditTargetToolConfig.execute("t1", {}, fakeCtx({ getEditTarget: () => target }));
    const d = res.details as { editing: boolean; html?: string };
    expect(d.editing).toBe(true);
    expect(d.html).toBe("<html>x</html>");
  });

  it("非编辑态返回 editing:false", async () => {
    const res = await getEditTargetToolConfig.execute("t1", {}, fakeCtx({ getEditTarget: () => null }));
    expect((res.details as { editing: boolean }).editing).toBe(false);
  });
});

// Task #9 移除了确认门控：工具直接执行、直接 emit，不再经 requestConfirm。
describe("工具直接执行（无确认门控）", () => {
  const HTML = "<html><body>hi</body></html>";

  it("create_web_playground 直接 emit playground_open", async () => {
    let emitted = false;
    const res = await createWebPlaygroundToolConfig.execute(
      "t1",
      { type: "game", title: "戳泡泡", description: "戳泡泡", html: HTML },
      fakeCtx({ emit: () => { emitted = true; } }),
    );
    expect((res.details as { ok: boolean }).ok).toBe(true);
    expect(emitted).toBe(true);
  });
});
