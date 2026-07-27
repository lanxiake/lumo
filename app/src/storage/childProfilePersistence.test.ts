import { mergeProfile, profileHasContent } from "./childProfilePersistence";

describe("profileHasContent", () => {
  it("empty profile is false", () => {
    expect(profileHasContent({})).toBe(false);
  });

  it("name / age / likes count as content", () => {
    expect(profileHasContent({ name: "小佳" })).toBe(true);
    expect(profileHasContent({ age: 7 })).toBe(true);
    expect(profileHasContent({ likes: ["恐龙"] })).toBe(true);
  });

  it("blank name does not count", () => {
    expect(profileHasContent({ name: "  " })).toBe(false);
  });
});

describe("mergeProfile", () => {
  it("overwrites scalar fields with patch values", () => {
    const merged = mergeProfile({ name: "小明", age: 5 }, { age: 6 });
    expect(merged).toEqual({ name: "小明", age: 6 });
  });

  it("unions likes/dislikes with dedup, keeping existing + new", () => {
    const merged = mergeProfile(
      { likes: ["恐龙", "红色"] },
      { likes: ["红色", "汽车"] },
    );
    expect([...(merged.likes ?? [])].sort()).toEqual(["汽车", "恐龙", "红色"].sort());
  });

  it("trims and drops blank array entries", () => {
    const merged = mergeProfile({}, { likes: ["  猫  ", "  "] });
    expect(merged.likes).toEqual(["猫"]);
  });

  it("drops empty arrays (undefined value, so JSON omits them)", () => {
    const merged = mergeProfile({ likes: [] }, { dislikes: [] });
    expect(merged.likes).toBeUndefined();
    expect(merged.dislikes).toBeUndefined();
    expect(JSON.parse(JSON.stringify(merged))).toEqual({});
  });

  it("ignores undefined patch fields (does not clobber existing)", () => {
    const merged = mergeProfile({ name: "小红", personality: "活泼" }, { personality: undefined });
    expect(merged.name).toBe("小红");
    expect(merged.personality).toBe("活泼");
  });
});
