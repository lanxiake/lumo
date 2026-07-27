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

export function wrapPlaygroundHtml(childHtml: string): string {
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
  ${childHtml}
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
