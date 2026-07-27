import { describe, it, expect } from "vitest";
import {
  generateDeviceId,
  makePlaceholderPublicKey,
  resolveDeviceId,
  type DeviceIdStore,
} from "./deviceIdentity";

/** 内存 store（模拟 op-sqlite/MMKV 持久化） */
function memStore(initial: string | null = null): DeviceIdStore {
  let v = initial;
  return {
    get: () => Promise.resolve(v),
    set: (id) => {
      v = id;
      return Promise.resolve();
    },
  };
}

describe("generateDeviceId", () => {
  it("带 kids- 前缀", () => {
    expect(generateDeviceId(() => 0.5)).toMatch(/^kids-/);
  });
  it("不同随机源产出不同 id", () => {
    expect(generateDeviceId(() => 0.1)).not.toBe(generateDeviceId(() => 0.9));
  });
});

describe("makePlaceholderPublicKey", () => {
  it("含 deviceId，非空", () => {
    const pk = makePlaceholderPublicKey("dev-1");
    expect(pk).toContain("dev-1");
    expect(pk.length).toBeGreaterThan(0);
  });
});

describe("resolveDeviceId — 稳定取用", () => {
  it("存储已有则直接返回（不重新生成）", async () => {
    const store = memStore("kids-existing");
    expect(await resolveDeviceId(store)).toBe("kids-existing");
  });

  it("存储为空则生成并写入", async () => {
    const store = memStore(null);
    const id = await resolveDeviceId(store, () => 0.42);
    expect(id).toMatch(/^kids-/);
    expect(await store.get()).toBe(id); // 已落存储
  });

  it("二次调用返回同一个（跨重启稳定语义）", async () => {
    const store = memStore(null);
    const first = await resolveDeviceId(store);
    const second = await resolveDeviceId(store);
    expect(second).toBe(first);
  });
});
