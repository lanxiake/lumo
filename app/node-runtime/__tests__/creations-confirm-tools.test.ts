/**
 * creations / confirm / edit 工具测试
 *
 * 验证：
 *  - list_my_creations 返回已有创作 + 内置游戏清单
 *  - get_edit_target 在编辑态返回原始 html，非编辑态返回 editing:false
 *  - confirm_activity 经 requestConfirm 往返返回 approved
 */

import { describe, it, expect } from "vitest";
import { listMyCreationsToolConfig, getEditTargetToolConfig } from "../src/tools/creations-tool.js";
import { createWebPlaygroundToolConfig } from "../src/tools/web-playground-tool.js";
import { mobileImageGenerateToolConfig } from "../src/tools/mobile-image-tool.js";
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

describe("工具层强制确认门控", () => {
  const HTML = "<html><body>hi</body></html>";

  it("create_web_playground 拒绝时不 emit playground_open", async () => {
    let emitted = false;
    const res = await createWebPlaygroundToolConfig.execute(
      "t1",
      { type: "game", title: "戳泡泡", description: "戳泡泡", html: HTML },
      fakeCtx({ requestConfirm: async () => false, emit: () => { emitted = true; } }),
    );
    expect((res.details as { ok: boolean }).ok).toBe(false);
    expect(emitted).toBe(false);
  });

  it("create_web_playground 同意时 emit playground_open", async () => {
    let emitted = false;
    const res = await createWebPlaygroundToolConfig.execute(
      "t1",
      { type: "game", title: "戳泡泡", description: "戳泡泡", html: HTML },
      fakeCtx({ requestConfirm: async () => true, emit: () => { emitted = true; } }),
    );
    expect((res.details as { ok: boolean }).ok).toBe(true);
    expect(emitted).toBe(true);
  });

  it("编辑既有游戏时跳过确认（getEditTarget 命中）", async () => {
    let confirmCalled = false;
    let emitted = false;
    const res = await createWebPlaygroundToolConfig.execute(
      "t1",
      { type: "game", title: "泡泡", description: "泡泡", html: HTML },
      fakeCtx({
        getEditTarget: () => ({ gameId: "g1", title: "泡泡", html: HTML }),
        requestConfirm: async () => { confirmCalled = true; return true; },
        emit: () => { emitted = true; },
      }),
    );
    expect(confirmCalled).toBe(false);
    expect((res.details as { ok: boolean }).ok).toBe(true);
    expect(emitted).toBe(true);
  });

  it("image_generate 拒绝时不请求网关、返回 ok:false", async () => {
    let fetched = false;
    const res = await mobileImageGenerateToolConfig.execute(
      "t1",
      { prompt: "小猫" },
      fakeCtx({
        requestConfirm: async () => false,
        fetchImpl: (async () => { fetched = true; return new Response("{}"); }) as unknown as typeof fetch,
      }),
    );
    expect(res.details).toBeNull();
    expect(fetched).toBe(false);
  });
});
