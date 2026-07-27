import { describe, it, expect } from "vitest";
import { PET_CORE_VERSION } from "../src/index.js";

describe("pet-core 包骨架冒烟", () => {
  it("导出版本号", () => {
    expect(PET_CORE_VERSION).toBe("0.1.0");
  });
});
