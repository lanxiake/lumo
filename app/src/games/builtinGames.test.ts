import { describe, it, expect } from "vitest";
import { BUILTIN_GAMES } from "./builtinGames";
import { checkPlaygroundHtmlSafety } from "../../node-runtime/src/tools/playground-html";
import { BUILTIN_GAME_META } from "../../node-runtime/src/config/builtin-games";

describe("BUILTIN_GAMES", () => {
  it("至少 4 个精品内置游戏", () => {
    expect(BUILTIN_GAMES.length).toBeGreaterThanOrEqual(4);
  });

  it("RN 与 node 侧元信息 id/title 一致（防两份清单漂移）", () => {
    const rn = BUILTIN_GAMES.map((g) => `${g.id}:${g.title}`).sort();
    const node = BUILTIN_GAME_META.map((g) => `${g.id}:${g.title}`).sort();
    expect(rn).toEqual(node);
  });

  it("id 唯一", () => {
    const ids = BUILTIN_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个游戏 HTML 都通过安全校验（可直接进沙箱）", () => {
    for (const g of BUILTIN_GAMES) {
      const r = checkPlaygroundHtmlSafety(g.html);
      expect(r.safe, `${g.id} 不安全: ${r.reason ?? ""}`).toBe(true);
    }
  });

  it("元信息完整（标题/图标/适龄区间合理）", () => {
    for (const g of BUILTIN_GAMES) {
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.icon.length).toBeGreaterThan(0);
      expect(g.ageRange[0]).toBeLessThanOrEqual(g.ageRange[1]);
      expect(g.ageRange[0]).toBeGreaterThanOrEqual(2);
    }
  });
});
