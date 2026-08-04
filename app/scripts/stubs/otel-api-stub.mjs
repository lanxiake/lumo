/**
 * otel-api-stub — 打包期替换 @opentelemetry/api 的空桩
 *
 * 根因：pi-ai 0.73.1 传递依赖 @mistralai/mistralai@2.5.0，其 observability 路径
 * (extra/observability/otel.js、telemetry.js) 顶层 import @opentelemetry/api。
 * 该包未安装 → esbuild "Could not resolve"。
 *
 * Lumo 只走 deepseek/openai-compatible，从不调用 Mistral SDK，故其 tracing 代码
 * 永不执行。默认无 TracerProvider 时也只返回 NoOp tracer。这里提供顶层命名导出的
 * 惰性 NoOp 桩，使模块可加载；即便意外触发也是空操作而非崩溃，零功能损失。
 */

const noopSpan = {
  setAttribute() { return this; },
  setAttributes() { return this; },
  setStatus() { return this; },
  updateName() { return this; },
  addEvent() { return this; },
  recordException() { return this; },
  isRecording() { return false; },
  end() {},
  startSpan() { return noopSpan; },
};

const noopTracer = { startSpan() { return noopSpan; } };
const noopTracerProvider = { getTracer() { return noopTracer; } };

export const trace = {
  getTracer() { return noopTracer; },
  getTracerProvider() { return noopTracerProvider; },
  getSpan() { return undefined; },
  setSpan(ctx) { return ctx; },
};

export const context = {
  active() { return {}; },
  with(_ctx, fn) { return fn(); },
};

export const propagation = {
  getBaggage() { return undefined; },
  inject() {},
};

export const SpanStatusCode = { UNSET: 0, OK: 1, ERROR: 2 };

export default { trace, context, propagation, SpanStatusCode };
