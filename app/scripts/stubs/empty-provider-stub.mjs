/**
 * empty-provider-stub — 打包期替换 Lumo 用不到的 LLM provider SDK 的空桩
 *
 * 根因：pi-ai 0.73.1 传递依赖引入 @mistralai/mistralai(2.1MB)、@google/genai(836KB)、
 * @anthropic-ai/sdk、google-auth-library 等。pi-ai 的 provider 走惰性 import，本应不加载
 * 求值——但 esbuild 单文件 CJS 打包会内联这些模块，其顶层 SDK 求值在 nodejs-mobile 的
 * Node18 上崩溃(升级后启动即崩根因)。
 *
 * Lumo 只用 openai-completions(deepseek 直连/gateway)，永不调 google/mistral/anthropic。
 * 全部桩为抛错的空导出：pi-ai 的 loadXxxProviderModule 若被误触发会得到明确错误而非
 * native 崩溃；正常链路不触发，零功能损失，且省 3MB+ bundle 体积。
 */

function unsupported() {
  throw new Error(
    "[kids-mobile] 该 LLM provider 在移动端未打包（已 stub）。Lumo 仅支持 OpenAI 兼容端点（deepseek）。",
  );
}

// 各 SDK 主要具名导出桩为 Proxy：require/解构不崩，实际调用才抛错。
const handler = {
  get() {
    return new Proxy(unsupported, handler);
  },
  construct() {
    return unsupported();
  },
  apply() {
    return unsupported();
  },
};

const stub = new Proxy(function () {}, handler);

// @anthropic-ai/sdk 默认导出 Anthropic 类；@mistralai 具名 Mistral；@google/genai 具名 GoogleGenAI 等
export default stub;
export const Anthropic = stub;
export const Mistral = stub;
export const GoogleGenAI = stub;
export const ResourceScope = stub;
export const ThinkingLevel = stub;
export const FinishReason = stub;
export const FunctionCallingConfigMode = stub;
