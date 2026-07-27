import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: [
      "__tests__/**/*.test.ts",
      "src/**/*.test.ts",
      // RN 侧纯逻辑（状态机 / 事件映射 / live2d 协议）源码按方案落在
      // apps/kids-mobile/src/，复用本包已装好的 vitest 做纯逻辑 TDD（不引 RN 运行时）。
      "../src/**/*.test.ts",
    ],
  },
});
