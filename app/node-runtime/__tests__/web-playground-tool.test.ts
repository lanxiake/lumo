/**
 * web-playground-tool 测试
 *
 * 验证 create_web_playground：
 *  - 安全 HTML 通过检查、包裹 CSP、emit playground_open
 *  - 含危险模式（fetch/外链/eval 等）的 HTML 被拒绝，不 emit
 *  - 超长 HTML 被拒绝
 */

import { describe, it, expect } from "vitest";
import {
  checkPlaygroundHtmlSafety,
  wrapPlaygroundHtml,
  createWebPlaygroundToolConfig,
} from "../src/tools/web-playground-tool.js";
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
    getPendingPlayground: () => null,
    requestConfirm: async () => true,
  } as MobileToolExecutionContext;
}

const SAFE_HTML = `<div id="app"><button onclick="pop()">点我</button></div>
<script>function pop(){ document.getElementById('app').style.background='pink'; }</script>`;

describe("checkPlaygroundHtmlSafety", () => {
  it("安全 HTML 通过", () => {
    expect(checkPlaygroundHtmlSafety(SAFE_HTML).safe).toBe(true);
  });

  it("含 fetch( 被拒绝", () => {
    expect(checkPlaygroundHtmlSafety(`<script>fetch('/x')</script>`).safe).toBe(false);
  });

  it("含外部 http 链接被拒绝", () => {
    expect(checkPlaygroundHtmlSafety(`<img src="http://evil.com/a.png">`).safe).toBe(false);
  });

  it("含 eval( 被拒绝", () => {
    expect(checkPlaygroundHtmlSafety(`<script>eval('1')</script>`).safe).toBe(false);
  });

  it("超过 50KB 被拒绝", () => {
    const huge = "a".repeat(51 * 1024);
    expect(checkPlaygroundHtmlSafety(huge).safe).toBe(false);
  });
});

describe("wrapPlaygroundHtml", () => {
  it("注入 CSP 并禁用 fetch/XHR/WebSocket", () => {
    const wrapped = wrapPlaygroundHtml("<div>hi</div>");
    expect(wrapped).toContain("Content-Security-Policy");
    expect(wrapped).toContain("window.fetch = undefined");
    expect(wrapped).toContain("<div>hi</div>");
  });
});

describe("create_web_playground execute", () => {
  it("安全 HTML → emit playground_open（包裹后）", async () => {
    const sink: MobileNodeEvent[] = [];
    const res = await createWebPlaygroundToolConfig.execute(
      "c",
      { type: "game", title: "消消乐", description: "点方块", html: SAFE_HTML },
      fakeContext(sink),
    );
    expect(res.details).toEqual({ ok: true });
    const evt = sink.find((e) => e.type === "playground_open");
    expect(evt).toBeTruthy();
    expect(evt && "payload" in evt && evt.payload.title).toBe("消消乐");
    expect(evt && "payload" in evt && evt.payload.html).toContain("Content-Security-Policy");
  });

  it("危险 HTML → 返回错误，不 emit", async () => {
    const sink: MobileNodeEvent[] = [];
    const res = await createWebPlaygroundToolConfig.execute(
      "c",
      { type: "game", title: "坏游戏", description: "x", html: `<script>fetch('/x')</script>` },
      fakeContext(sink),
    );
    expect(res.details).toMatchObject({ ok: false });
    expect(sink.some((e) => e.type === "playground_open")).toBe(false);
  });

  it("无 html + 宿主支持 → 派发后台生成并立即返回 generating（不 emit）", async () => {
    const sink: MobileNodeEvent[] = [];
    const dispatched: { title: string }[] = [];
    const ctx = fakeContext(sink);
    ctx.generatePlayground = (spec) => dispatched.push({ title: spec.title });
    const res = await createWebPlaygroundToolConfig.execute(
      "c",
      { type: "game", title: "泡泡龙", description: "点破泡泡" },
      ctx,
    );
    expect(res.details).toEqual({ ok: true, status: "generating" });
    expect(dispatched).toEqual([{ title: "泡泡龙" }]);
    // 后台生成，工具本身不 emit playground_open（由 bridge 生成完成后 emit）
    expect(sink.some((e) => e.type === "playground_open")).toBe(false);
  });

  it("无 html + 宿主不支持后台生成 → 返回错误", async () => {
    const sink: MobileNodeEvent[] = [];
    const res = await createWebPlaygroundToolConfig.execute(
      "c",
      { type: "game", title: "泡泡龙", description: "点破泡泡" },
      fakeContext(sink),
    );
    expect(res.details).toMatchObject({ ok: false });
  });
});
