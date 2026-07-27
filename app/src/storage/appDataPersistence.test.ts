/**
 * appDataPersistence 单元测试
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { InMemorySecureStorage } from "../auth/secureStorage";
import {
  loadGalleryImages,
  saveGalleryImages,
  loadGameHistory,
  saveGameHistory,
  dedupeGalleryImages,
  dedupeGameHistory,
  normalizeKey,
} from "./appDataPersistence";

describe("appDataPersistence", () => {
  let storage: InMemorySecureStorage;

  beforeEach(() => {
    storage = new InMemorySecureStorage();
  });

  it("画廊图片可写入并在重启后读回", async () => {
    const images = [{ url: "https://example.com/a.png", prompt: "猫", createdAt: 1000 }];
    await saveGalleryImages(storage, images);
    const loaded = await loadGalleryImages(storage);
    expect(loaded).toEqual(images);
  });

  it("游戏历史可写入并在重启后读回", async () => {
    const games = [{ id: "g1", title: "认颜色", html: "<html/>", createdAt: 2000 }];
    await saveGameHistory(storage, games);
    const loaded = await loadGameHistory(storage);
    expect(loaded).toEqual(games);
  });

  it("损坏的 JSON 返回空数组", async () => {
    await storage.setItem("kids.galleryImages", "not-json");
    expect(await loadGalleryImages(storage)).toEqual([]);
  });
});

describe("normalizeKey", () => {
  it("大小写/空白/标点归一", () => {
    expect(normalizeKey("  Hello,  World! ")).toBe("helloworld");
  });

  it("去噪声后缀词", () => {
    expect(normalizeKey("认颜色小游戏")).toBe(normalizeKey("认颜色"));
    expect(normalizeKey("小猫的画")).toBe(normalizeKey("小猫"));
  });

  it("emoji 与符号被剥离", () => {
    expect(normalizeKey("🎮认数字🎮")).toBe(normalizeKey("认数字"));
  });

  it("中英混合内部空白折叠", () => {
    expect(normalizeKey("draw a Cat")).toBe("drawacat");
  });
});

describe("dedupeGalleryImages", () => {
  it("按归一化提示词去重，保留最新且顺序稳定", () => {
    const images = [
      { url: "a1.png", prompt: "画一只猫", createdAt: 1 },
      { url: "b.png", prompt: "狗", createdAt: 2 },
      { url: "a2.png", prompt: "画一只猫！", createdAt: 3 }, // 与首条归一化等价 → 保留最新
      { url: "c.png", createdAt: 4 },
    ];
    expect(dedupeGalleryImages(images)).toEqual([
      { url: "a2.png", prompt: "画一只猫！", createdAt: 3 },
      { url: "b.png", prompt: "狗", createdAt: 2 },
      { url: "c.png", createdAt: 4 },
    ]);
  });

  it("无提示词时回退 url 去重", () => {
    const images = [
      { url: "a.png", createdAt: 1 },
      { url: "a.png", createdAt: 5 },
    ];
    expect(dedupeGalleryImages(images)).toEqual([{ url: "a.png", createdAt: 5 }]);
  });

  it("无重复时返回原引用（不产生新数组）", () => {
    const images = [
      { url: "a.png", prompt: "猫", createdAt: 1 },
      { url: "b.png", prompt: "狗", createdAt: 2 },
    ];
    expect(dedupeGalleryImages(images)).toBe(images);
  });

  it("空数组返回原引用", () => {
    const empty: never[] = [];
    expect(dedupeGalleryImages(empty)).toBe(empty);
  });
});

describe("dedupeGameHistory", () => {
  it("按归一化标题去重（后缀/标点差异视为同一游戏），保留最新", () => {
    const games = [
      { id: "g1", title: "认颜色", html: "<a/>", createdAt: 1 },
      { id: "g2", title: "学数字", html: "<b/>", createdAt: 2 },
      { id: "g3", title: "认颜色小游戏", html: "<c/>", createdAt: 3 }, // 归一化等价 g1 → 保留最新
    ];
    expect(dedupeGameHistory(games)).toEqual([
      { id: "g3", title: "认颜色小游戏", html: "<c/>", createdAt: 3 },
      { id: "g2", title: "学数字", html: "<b/>", createdAt: 2 },
    ]);
  });

  it("无重复时返回原引用", () => {
    const games = [{ id: "g1", title: "t", html: "<a/>", createdAt: 1 }];
    expect(dedupeGameHistory(games)).toBe(games);
  });
});
