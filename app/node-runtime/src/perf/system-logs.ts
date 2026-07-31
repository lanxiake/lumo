/**
 * system-logs — 系统运行日志内存缓冲（运行日志 / 错误日志）
 *
 * 收集 node 侧 `log()` 输出的普通字符串日志（含 turn_timing/runtime/error），
 * 按级别（info/warn/error）分类，供设置页「系统日志」统一查看，帮助定位问题。
 *
 * 上限：5MB 或 1 万条，先到先删（批量删 10% 降 splice 频率）。
 */

export type SystemLogLevel = "info" | "warn" | "error"

export interface SystemLogLine {
  readonly id: string
  readonly at: number
  readonly level: SystemLogLevel
  readonly message: string
}

export interface SystemLogBuffer {
  /** 记录一条日志；level 缺省按 message 关键词启发式判定 */
  push(message: string, level?: SystemLogLevel): void
  getRecent(): SystemLogLine[]
  /** 已累计记录总条数（含被淘汰的） */
  totalCount(): number
}

/** 启发式判级：含 失败/错误/error/异常 → error；含 warn/警告 → warn；否则 info */
export function inferLevel(message: string): SystemLogLevel {
  const m = message.toLowerCase()
  if (/失败|错误|异常|error|exception|reject|崩溃/.test(m)) return "error"
  if (/warn|警告|超时|timeout|丢弃|降级/.test(m)) return "warn"
  return "info"
}

export function createSystemLogBuffer(opts: {
  maxLines?: number
  maxBytes?: number
} = {}): SystemLogBuffer {
  const maxLines = opts.maxLines ?? 10_000
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024
  const buffer: SystemLogLine[] = []
  let bytes = 0
  let total = 0
  let seq = 0

  function estimate(line: SystemLogLine): number {
    return line.message.length + 40 // message + id/at/level 固定开销粗估
  }

  return {
    push(message, level) {
      const line: SystemLogLine = {
        id: `log-${Date.now()}-${++seq}`,
        at: Date.now(),
        level: level ?? inferLevel(message),
        message: message.length > 2000 ? message.slice(0, 2000) + "…" : message,
      }
      buffer.push(line)
      bytes += estimate(line)
      total += 1
      while (bytes > maxBytes || buffer.length > maxLines) {
        const drop = Math.max(1, Math.floor(buffer.length * 0.1))
        for (let i = 0; i < drop && buffer.length > 0; i++) {
          bytes -= estimate(buffer.shift()!)
        }
      }
    },
    getRecent() {
      return [...buffer]
    },
    totalCount() {
      return total
    },
  }
}
