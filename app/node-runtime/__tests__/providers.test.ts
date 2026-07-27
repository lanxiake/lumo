import { describe, it, expect, vi } from "vitest";
import { createMobileToolContext } from "../src/host/mobile-tool-context.js";
import { createMobileConfigProvider } from "../src/host/mobile-config-provider.js";
import { createMobilePermissionProvider } from "../src/host/mobile-permission-provider.js";
import type { PermissionRequest } from "@lumo/agent-runtime";

function permReq(toolName: string): PermissionRequest {
  return {
    requestId: "r1",
    runId: "run1",
    sessionKey: "s1",
    rootSessionKey: "s1",
    instanceId: "i1",
    toolName,
    toolArgs: {},
    description: "test",
  };
}

describe("mobile-tool-context", () => {
  const ctx = createMobileToolContext({
    sessionId: "s1",
    petId: "p1",
    deviceId: "d1",
    platform: "ios",
    appVersion: "1.0.0",
    gatewayUrl: "https://gateway.test.local",
    getAuthToken: async () => "test-token",
    emit: () => {},
  });

  it("shell/file/glob/grep 一律抛错（儿童安全边界）", async () => {
    await expect(ctx.executeCommand("ls")).rejects.toThrow(/禁止/);
    await expect(ctx.readFile("/etc/passwd")).rejects.toThrow(/禁止/);
    await expect(ctx.writeFile("/tmp/x", "y")).rejects.toThrow(/禁止/);
    await expect(ctx.glob("**/*")).rejects.toThrow(/禁止/);
    await expect(ctx.grep("secret")).rejects.toThrow(/禁止/);
  });

  it("getCwd 返回受限虚拟路径", () => {
    expect(ctx.getCwd()).toContain("kids-mobile");
  });

  it("fetch 可用（web 工具依赖）", async () => {
    const fakeFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const c = createMobileToolContext({
      sessionId: "s", petId: "p", deviceId: "d", platform: "ios", appVersion: "1",
      gatewayUrl: "https://gateway.test.local",
      getAuthToken: async () => "test-token",
      emit: () => {},
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const r = await c.fetch("https://example.com");
    expect(r.status).toBe(200);
    expect(r.body).toBe("ok");
  });
});

describe("mobile-config-provider", () => {
  const config = createMobileConfigProvider();

  it("getProviderCredentials 永不返回真实凭据（安全不变量）", () => {
    expect(config.getProviderCredentials("cloud")).toEqual({});
    expect(config.getProviderCredentials("local")).toEqual({});
    expect(config.getProviderCredentials("custom")).toEqual({});
  });

  it("resolveModel 恒 cloud/gateway", () => {
    const r = config.resolveModel("chat");
    expect(r.providerSource).toBe("cloud");
    expect(r.streamFnKind).toBe("gateway");
    expect(r.model).toBeDefined();
  });

  it("getFeatureFlags 合并 override", () => {
    const base = config.getFeatureFlags();
    expect(base).toBeDefined();
    const overridden = config.getFeatureFlags({ ENABLE_TOOL_TELEMETRY: true } as never);
    expect((overridden as unknown as Record<string, unknown>).ENABLE_TOOL_TELEMETRY).toBe(true);
  });
});

describe("mobile-permission-provider", () => {
  it("MVP 所有白名单内工具直接 allow-once", async () => {
    const p = createMobilePermissionProvider();
    expect(await p.requestPermission(permReq("image_generate"))).toBe("allow-once");
    expect(await p.requestPermission(permReq("app_navigate"))).toBe("allow-once");
    expect(await p.requestPermission(permReq("message"))).toBe("allow-once");
  });

  it("未知/黑名单工具拒绝", async () => {
    const p = createMobilePermissionProvider();
    expect(await p.requestPermission(permReq("bash"))).toBe("deny");
    expect(await p.requestPermission(permReq("web_fetch"))).toBe("deny");
    expect(await p.requestPermission(permReq("unknown_tool"))).toBe("deny");
  });
});
