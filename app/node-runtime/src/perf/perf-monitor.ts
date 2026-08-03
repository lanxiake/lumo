/**
 * perf-monitor — 进程性能采样（CPU / 内存），周期性写入 SystemLogBuffer
 *
 * nodejs-mobile 内嵌 Node18，可直接用 process.cpuUsage()/memoryUsage()，零依赖零 native。
 * GPU / 电量 / 磁盘需 Android 原生模块（BatteryManager/StatFs），成本远高，本期不做。
 *
 * 纯逻辑（采样差值 → 文本）与副作用（setInterval）分离，便于单测。
 */

/** process.cpuUsage 的最小形状 */
export interface CpuUsage {
  readonly user: number; // 微秒（累计）
  readonly system: number; // 微秒（累计）
}

/** 一次采样的原始输入 */
export interface PerfSampleInput {
  readonly prevCpu: CpuUsage;
  readonly curCpu: CpuUsage;
  /** 两次采样间隔的墙钟毫秒 */
  readonly elapsedMs: number;
  /** 常驻内存字节（memoryUsage().rss） */
  readonly rssBytes: number;
  /** 堆已用字节（memoryUsage().heapUsed） */
  readonly heapUsedBytes: number;
}

/** CPU% = (Δuser + Δsystem) 微秒 / (elapsed 毫秒 × 1000) × 100，钳到 [0, ∞) */
export function computeCpuPercent(prev: CpuUsage, cur: CpuUsage, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const deltaMicros = cur.user - prev.user + (cur.system - prev.system);
  const pct = deltaMicros / (elapsedMs * 1000) * 100;
  return pct > 0 ? Math.round(pct * 10) / 10 : 0;
}

/** 格式化一条性能日志（纯逻辑）。示例：`perf cpu=12.3% rss=180MB heap=45MB` */
export function formatPerfSample(input: PerfSampleInput): string {
  const cpu = computeCpuPercent(input.prevCpu, input.curCpu, input.elapsedMs);
  const rssMb = Math.round(input.rssBytes / 1024 / 1024);
  const heapMb = Math.round(input.heapUsedBytes / 1024 / 1024);
  return `perf cpu=${cpu}% rss=${rssMb}MB heap=${heapMb}MB`;
}

/** 采样默认间隔（30s：够看趋势，又不刷屏日志） */
const DEFAULT_INTERVAL_MS = 30_000;

export interface PerfMonitorDeps {
  readonly log: (msg: string) => void;
  readonly intervalMs?: number;
  /** 注入采样源（缺省用真实 process），便于单测 */
  readonly cpuUsage?: (prev?: CpuUsage) => CpuUsage;
  readonly memoryUsage?: () => { rss: number; heapUsed: number };
  readonly now?: () => number;
}

/** 启动周期性性能采样，返回 stop() 停止定时器 */
export function startPerfMonitor(deps: PerfMonitorDeps): () => void {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const cpuUsage = deps.cpuUsage ?? ((prev?: CpuUsage) => process.cpuUsage(prev));
  const memoryUsage = deps.memoryUsage ?? (() => process.memoryUsage());
  const now = deps.now ?? Date.now;

  let prevCpu = cpuUsage();
  let prevAt = now();

  const timer = setInterval(() => {
    const curCpu = cpuUsage();
    const at = now();
    const mem = memoryUsage();
    deps.log(
      formatPerfSample({
        prevCpu,
        curCpu,
        elapsedMs: at - prevAt,
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
      }),
    );
    prevCpu = curCpu;
    prevAt = at;
  }, intervalMs);

  // nodejs-mobile 常驻，unref 让定时器不阻止进程退出
  if (typeof timer.unref === "function") timer.unref();

  return () => clearInterval(timer);
}
