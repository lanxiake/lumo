/**
 * quickjs-stub — 打包期替换 @tootallnate/quickjs-emscripten 的空桩
 *
 * 根因：pi-ai 加载时拉起 undici/proxy-agent，其 PAC 解析分支
 * (pac-proxy-agent → pac-resolver → degenerator → @tootallnate/quickjs-emscripten)
 * 会加载 QuickJS WASM。该 WASM 在 nodejs-mobile 的 Node 18 上加载即 SIGSEGV。
 *
 * 移动端走蜂窝/WiFi，永不需要 PAC 代理自动配置脚本，故把 QuickJS 引擎整体桩为
 * 抛错的空实现。pac-resolver 只在真正解析 PAC 时才调它——移动端不触发，零功能损失。
 * 若意外触发，抛出明确错误而非 WASM 崩溃，便于定位。
 */

function unsupported() {
  throw new Error(
    "[kids-mobile] QuickJS/PAC 代理在移动端不支持（已 stub）。移动端不应使用 PAC 代理自动配置。",
  );
}

// @tootallnate/quickjs-emscripten 的主要导出：getQuickJS / newQuickJSWASMModule 等。
// 全部桩为抛错，避免任何 WASM 加载路径被触发。
export function getQuickJS() {
  return unsupported();
}
export function getQuickJSSync() {
  return unsupported();
}
export function newQuickJSWASMModule() {
  return unsupported();
}
export function newQuickJSAsyncWASMModule() {
  return unsupported();
}
export const QuickJSWASMModule = undefined;
export const RELEASE_SYNC = undefined;
export const DEBUG_SYNC = undefined;

export default {
  getQuickJS,
  getQuickJSSync,
  newQuickJSWASMModule,
  newQuickJSAsyncWASMModule,
};
