/**
 * provider-url — 自定义模型 baseUrl 归一化
 *
 * OpenAI 兼容端点：官方 SDK 只在 baseUrl 后拼 /chat/completions（或 /images/generations），
 * 所以 baseUrl 必须自带 /v1。用户常漏填 → 这里在「纯 host（无路径段）」时补 /v1。
 * 已有路径段（/v1、/api/xxx 等）一律不动，避免破坏自定义/代理端点。
 *
 * Anthropic：SDK 自动拼 /v1/messages，baseUrl 不应带 /v1，故不在此归一化。
 */

/** OpenAI 兼容 baseUrl：纯 host 时补 /v1；已有路径或非法 URL 原样返回。 */
export function ensureOpenAiV1(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed; // 非法 URL 交给下游校验，不在此处报错
  }
  if (url.pathname && url.pathname !== "/") return trimmed;
  return `${trimmed}/v1`;
}
