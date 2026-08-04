/**
 * playground-html — 互动页面 HTML 安全校验与沙箱包装（纯函数，零依赖）
 *
 * 从 web-playground-tool 抽出，供 Node 工具与 RN 侧（内置游戏、编辑）共用同一套
 * 安全规则与 CSP 包装，避免两端逻辑分叉。无 agent-runtime / typebox 依赖，
 * 可安全被 Metro 打包进 RN。
 */

/** Agent 生成的裸 HTML 最大长度（50KB），防止 token 过大 */
export const MAX_HTML_BYTES = 50 * 1024;

/** 危险模式：外部资源、网络请求、动态代码执行、导航等 */
const DANGEROUS_PATTERNS = [
  { name: "external-http", regex: /https?:\/\/[^\s"'`]+/g },
  { name: "protocol-relative-url", regex: /\/\/[a-zA-Z0-9]/g },
  { name: "fetch-call", regex: /fetch\s*\(/g },
  { name: "xhr-constructor", regex: /XMLHttpRequest/g },
  { name: "websocket-constructor", regex: /WebSocket\s*\(/g },
  { name: "import-scripts", regex: /importScripts\s*\(/g },
  { name: "eval-call", regex: /eval\s*\(/g },
  { name: "new-function", regex: /new\s+Function/g },
  { name: "top-navigation", regex: /window\.top\.location/g },
  { name: "external-form-action", regex: /action\s*=\s*["']https?:/g },
  { name: "string-settimeout", regex: /setTimeout\s*\(\s*["']/g },
  { name: "string-setinterval", regex: /setInterval\s*\(\s*["']/g },
];

function byteLengthOf(str: string): number {
  return new Blob([str]).size;
}

export function checkPlaygroundHtmlSafety(html: string): { safe: boolean; reason?: string } {
  if (byteLengthOf(html) > MAX_HTML_BYTES) {
    return { safe: false, reason: `HTML 超过最大限制 ${MAX_HTML_BYTES} 字节` };
  }
  for (const pattern of DANGEROUS_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(html)) {
      return { safe: false, reason: `HTML 包含不安全的模式: ${pattern.name}` };
    }
  }
  return { safe: true };
}

/**
 * 从模型产物里切出 HTML 区段。正常路径是纯 HTML；但 deepseek-flash 偶发把 HTML 写进
 * thinking 块、外面裹着设计散文，此时需从中段捞出 HTML：优先 ```html``` 代码块，
 * 否则从首个结构标签切到最后一个闭合标签（截掉 HTML 后残留的散文）。
 */
export function extractHtmlBlock(s: string): string {
  const fenced = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1]!.trim();
  const start = s.search(/<(?:!doctype|html|style|div|canvas|body|section|main)\b/i);
  if (start < 0) return s.trim();
  const tail = s.slice(start);
  const lastClose = tail.match(/[\s\S]*<\/(?:html|script|body|div|section|main)>/i);
  return (lastClose ? lastClose[0] : tail).trim();
}

/**
 * 归一化模型产物为「可嵌入 body 的片段」。
 * 模型常被要求「直接以 <!doctype html> 开头」返回完整文档，但 wrapPlaygroundHtml 会把
 * 它再塞进另一个完整文档的 <body> 里——嵌套的 <!doctype>/<html>/<head> 会被 WebView
 * 丢弃，导致游戏空白。故：是完整文档就抽出 <body> 内容（含内联 <style>/<script>），
 * 否则原样当片段用。
 */
export function extractBodyFragment(html: string): string {
  const s = html.trim();
  // 含 <html>/<!doctype>/<head>/<body> 任一即视为完整文档
  if (!/<(!doctype|html|head|body)\b/i.test(s)) return s;
  const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let inner = bodyMatch ? bodyMatch[1]! : s;
  // 补回 <head> 里的内联样式（游戏样式常写在 head），去掉外链/元信息标签
  const headMatch = s.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const styles = headMatch[1]!.match(/<style[\s\S]*?<\/style>/gi);
    if (styles) inner = styles.join("\n") + "\n" + inner;
  }
  // 剥掉可能残留的顶层文档标签
  return inner
    .replace(/<\/?(?:!doctype|html|head|body)\b[^>]*>/gi, "")
    .trim();
}

/**
 * 轻量内容校验：生成物是否「像一个能渲染的游戏」，而非空/解释文字/半成品。
 * safety 只挡危险，这里挡「空壳」——两者互补。
 */
export function validatePlaygroundContent(html: string): { valid: boolean; reason?: string } {
  const fragment = extractBodyFragment(html);
  if (fragment.length < 40) return { valid: false, reason: "内容过短，疑似空壳" };
  // 至少要有一个可见结构标签，纯文字说明不算游戏
  if (!/<[a-z][\s\S]*?>/i.test(fragment)) return { valid: false, reason: "无 HTML 标签，疑似纯文字" };
  // 交互游戏基本都要有脚本或事件绑定，否则点了没反应
  const hasScript = /<script[\s\S]*?>[\s\S]*?<\/script>/i.test(fragment);
  const hasInlineHandler = /on(click|touchstart|pointerdown|load)\s*=/i.test(fragment);
  if (!hasScript && !hasInlineHandler) return { valid: false, reason: "无脚本/交互，疑似静态半成品" };
  return { valid: true };
}

export function wrapPlaygroundHtml(childHtml: string): string {
  const fragment = extractBodyFragment(childHtml);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'unsafe-inline';
    style-src 'unsafe-inline';
    img-src data: blob:;
    media-src data: blob:;
    connect-src 'none';
    font-src 'none';
  ">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; touch-action: manipulation; }
    body { width: 100vw; height: 100vh; overflow: hidden; }
  </style>
</head>
<body>
  ${fragment}
  <script>
    window.fetch = undefined;
    window.XMLHttpRequest = undefined;
    window.WebSocket = undefined;
    window.importScripts = undefined;
    window.sendToPet = function(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
      }
    };
  </script>
</body>
</html>`;
}
