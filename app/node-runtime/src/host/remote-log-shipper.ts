/**
 * remote-log-shipper — 客户端日志远程归集（错误 + 关键事件）
 *
 * 把设备端的错误与关键生命周期事件批量 POST 到网关 /v1/client/logs（设备
 * 鉴权），网关侧经统一 logger 落 system_logs，便于远程监控运行状态。
 *
 * 语义（fire-and-forget）：
 *  - 只收「错误 + 关键事件」，不收全部日志（避免刷屏 / 隐私）。
 *  - 5s 或满 20 条自动 flush；失败静默丢弃（本地缓冲上限 100 条防内存涨）。
 *  - 上报失败绝不抛、绝不再触发日志（避免上报回环）。
 */

export type ClientLogLevel = "info" | "warn" | "error"

export interface ClientLogEntry {
  level: ClientLogLevel
  event: string
  message?: string
  meta?: Record<string, unknown>
}

export interface RemoteLogShipperDeps {
  readonly getGatewayUrl: () => string
  readonly getAuthToken: () => Promise<string>
  readonly getDeviceId: () => string | undefined
  readonly platform: string
  readonly fetchImpl?: typeof fetch
  /** 本地兜底日志（stderr），仅用于诊断 shipper 自身，绝不回环 */
  readonly log?: (msg: string) => void
}

const FLUSH_INTERVAL_MS = 5_000
const BATCH_SIZE = 20
const MAX_QUEUE = 100
const FETCH_TIMEOUT_MS = 8_000

function buildUrl(gatewayUrl: string): string {
  return `${gatewayUrl.replace(/\/+$/, "")}/v1/client/logs`
}

export interface RemoteLogShipper {
  ship(entry: ClientLogEntry): void
  flush(): Promise<void>
}

export function createRemoteLogShipper(deps: RemoteLogShipperDeps): RemoteLogShipper {
  const queue: ClientLogEntry[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let flushing = false

  const doFetch = deps.fetchImpl ?? fetch

  async function flush(): Promise<void> {
    if (flushing || queue.length === 0) return
    const gatewayUrl = deps.getGatewayUrl()
    const token = await deps.getAuthToken()
    if (!gatewayUrl || !token.trim()) return // 未配对/未登录：留在缓冲区待下次

    flushing = true
    const batch = queue.splice(0, BATCH_SIZE)
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }
      const deviceId = deps.getDeviceId()
      if (deviceId) headers["X-Device-Id"] = deviceId
      await doFetch(buildUrl(gatewayUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ platform: deps.platform, entries: batch }),
        signal: controller.signal,
      })
    } catch {
      // 静默：日志丢失优于崩溃 / 上报回环
    } finally {
      clearTimeout(t)
      flushing = false
      if (queue.length > 0) schedule()
    }
  }

  function schedule(): void {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, FLUSH_INTERVAL_MS)
  }

  return {
    ship(entry: ClientLogEntry): void {
      queue.push(entry)
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
      if (queue.length >= BATCH_SIZE) void flush()
      else schedule()
    },
    flush,
  }
}
