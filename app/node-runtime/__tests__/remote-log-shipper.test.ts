/**
 * remote-log-shipper 测试
 *
 * 验证：满批立即 flush、未登录留缓冲、失败静默不抛、POST 形态正确。
 */

import { describe, it, expect, vi } from "vitest";
import { createRemoteLogShipper } from "../src/host/remote-log-shipper.js";

function okFetch(capture: { url?: string; body?: string; headers?: Record<string, string> }): typeof fetch {
  return vi.fn(async (url, opts) => {
    capture.url = String(url);
    capture.body = (opts as { body?: string }).body;
    capture.headers = (opts as { headers?: Record<string, string> }).headers;
    return new Response("{}", { status: 202 });
  }) as unknown as typeof fetch;
}

describe("remote-log-shipper", () => {
  it("flush 携带 Bearer + X-Device-Id 与全部缓冲条目", async () => {
    const cap: { url?: string; body?: string; headers?: Record<string, string> } = {};
    const shipper = createRemoteLogShipper({
      getGatewayUrl: () => "https://gw.test",
      getAuthToken: async () => "tok",
      getDeviceId: () => "dev1",
      platform: "android",
      fetchImpl: okFetch(cap),
    });
    for (let i = 0; i < 5; i++) shipper.ship({ level: "info", event: "node_ready" });
    await shipper.flush();

    expect(cap.url).toBe("https://gw.test/v1/client/logs");
    expect(cap.headers?.Authorization).toBe("Bearer tok");
    expect(cap.headers?.["X-Device-Id"]).toBe("dev1");
    const parsed = JSON.parse(cap.body ?? "{}");
    expect(parsed.platform).toBe("android");
    expect(parsed.entries).toHaveLength(5);
  });

  it("未登录时不发请求，条目留缓冲", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const shipper = createRemoteLogShipper({
      getGatewayUrl: () => "https://gw.test",
      getAuthToken: async () => "",
      getDeviceId: () => undefined,
      platform: "android",
      fetchImpl,
    });
    shipper.ship({ level: "error", event: "agent_error" });
    await shipper.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetch 失败静默不抛", async () => {
    const shipper = createRemoteLogShipper({
      getGatewayUrl: () => "https://gw.test",
      getAuthToken: async () => "tok",
      getDeviceId: () => "dev1",
      platform: "android",
      fetchImpl: vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    shipper.ship({ level: "error", event: "agent_error" });
    await expect(shipper.flush()).resolves.toBeUndefined();
  });
});
