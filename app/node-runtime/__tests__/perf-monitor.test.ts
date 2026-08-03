import { describe, it, expect, vi } from "vitest";
import { computeCpuPercent, formatPerfSample, startPerfMonitor } from "../src/perf/perf-monitor.js";

describe("computeCpuPercent", () => {
  it("Δcpu 微秒 / 墙钟毫秒 → 百分比", () => {
    // 1s 墙钟内用了 0.5s CPU（user 300ms + system 200ms）→ 50%
    expect(computeCpuPercent({ user: 0, system: 0 }, { user: 300_000, system: 200_000 }, 1000)).toBe(50);
  });
  it("elapsed<=0 返回 0（防除零）", () => {
    expect(computeCpuPercent({ user: 0, system: 0 }, { user: 100, system: 0 }, 0)).toBe(0);
  });
  it("负增量钳到 0", () => {
    expect(computeCpuPercent({ user: 500, system: 0 }, { user: 100, system: 0 }, 1000)).toBe(0);
  });
});

describe("formatPerfSample", () => {
  it("含 cpu%/rss/heap，字节换算 MB", () => {
    const s = formatPerfSample({
      prevCpu: { user: 0, system: 0 },
      curCpu: { user: 100_000, system: 0 },
      elapsedMs: 1000,
      rssBytes: 180 * 1024 * 1024,
      heapUsedBytes: 45 * 1024 * 1024,
    });
    expect(s).toBe("perf cpu=10% rss=180MB heap=45MB");
  });
});

describe("startPerfMonitor", () => {
  it("按间隔采样并写日志", () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    let t = 0;
    const stop = startPerfMonitor({
      log: (m) => logs.push(m),
      intervalMs: 1000,
      now: () => (t += 1000),
      cpuUsage: () => ({ user: 100_000, system: 0 }),
      memoryUsage: () => ({ rss: 100 * 1024 * 1024, heapUsed: 20 * 1024 * 1024 }),
    });
    vi.advanceTimersByTime(2000);
    stop();
    expect(logs.length).toBe(2);
    expect(logs[0]).toContain("perf cpu=");
    vi.useRealTimers();
  });
});
