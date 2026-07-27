/**
 * harness — pet-core 浏览器预览编排（阶段 E 关键里程碑）
 *
 * 直接引用 pet-core 源码（Vite 插件把 .js 说明符解析到 .ts）：
 *  - petTransition：假事件驱动 9 态状态机
 *  - expressionForState + resolveExpressionIndex：状态 → 表情语义 → expression 索引
 *  - WebViewPetRenderer：把渲染调用序列化成 WebViewCommand postMessage 进 iframe
 *  - computeMouthOpen + smoothMouthValue：假口型波形（说话演示）
 *
 * 证明 pet-core 逻辑层可脱离 Windows/RN，在浏览器完整跑通「事件→状态→渲染」闭环。
 */

import {
  petTransition,
  initialPetState,
  type PetState,
  type PetEvent,
} from "../src/state/petStateMachine.js";
import {
  expressionForState,
  resolveExpressionIndex,
} from "../src/expression/state-expression-policy.js";
import { WebViewPetRenderer } from "../src/render/webview-renderer.js";
import { computeMouthOpen, smoothMouthValue } from "../src/lipsync/mouth-waveform.js";
import type { PetModelConfig } from "../src/model/pet-model-types.js";

const iframe = document.getElementById("pet") as HTMLIFrameElement;
const stateBox = document.getElementById("stateBox")!;
const emoBox = document.getElementById("emoBox")!;
const logBox = document.getElementById("log")!;
const modelSel = document.getElementById("modelSel") as HTMLSelectElement;

/** 把序列化指令 post 进 iframe（WebViewPetRenderer 的投递回调） */
const renderer = new WebViewPetRenderer((raw) => {
  iframe.contentWindow?.postMessage(raw, "*");
});

let state: PetState = initialPetState;
let models: Record<string, PetModelConfig> = {};
let currentEmotionMap: Record<string, number> = {};
let defaultExpression = 0;

function log(msg: string): void {
  const t = new Date().toLocaleTimeString();
  logBox.textContent = `${t}  ${msg}\n` + logBox.textContent;
}

/** 把当前状态渲染到宠物：切表情 + 播动作组 */
function renderState(): void {
  const { emotion, motionGroup } = expressionForState(state);
  const idx = resolveExpressionIndex(emotion, currentEmotionMap, defaultExpression);
  stateBox.textContent = state;
  emoBox.textContent = `emotion: ${emotion} → exp #${idx}`;
  renderer.setExpression(idx);
  if (motionGroup) renderer.playRandomMotion(motionGroup);
}

function dispatch(event: PetEvent): void {
  const next = petTransition(state, event);
  log(`${event.type}: ${state} → ${next}`);
  const changed = next !== state;
  state = next;
  if (changed) renderState();
  // speaking 自动起假口型演示，其余状态停口型
  if (state === "speaking") startFakeLipSync();
  else stopFakeLipSync();
}

// ---- 假口型（说话演示）：computeMouthOpen 每帧驱动 ----
let lipRAF = 0;
let lipStart = 0;
let lipPrev = 0;

function startFakeLipSync(): void {
  if (lipRAF) return;
  lipStart = performance.now();
  lipPrev = 0;
  const tick = () => {
    const t = (performance.now() - lipStart) / 1000;
    const target = computeMouthOpen(t);
    lipPrev = smoothMouthValue(lipPrev, target);
    renderer.setMouthOpen(lipPrev);
    lipRAF = requestAnimationFrame(tick);
  };
  lipRAF = requestAnimationFrame(tick);
  log("口型开始");
}

function stopFakeLipSync(): void {
  if (!lipRAF) return;
  cancelAnimationFrame(lipRAF);
  lipRAF = 0;
  renderer.releaseLipSync();
  log("口型停止");
}

// ---- 模型加载：切换 iframe 的 ?model= 并同步 emotionMap ----
async function loadRegistry(): Promise<void> {
  const res = await fetch("/models/registry.json");
  const reg = (await res.json()) as { models: PetModelConfig[] };
  models = Object.fromEntries(reg.models.map((m) => [m.id, m]));
}

function selectModel(id: string): void {
  const cfg = models[id];
  if (!cfg) return;
  currentEmotionMap = cfg.emotionMap ?? {};
  defaultExpression = cfg.defaultExpression ?? 0;
  const url = "/models/" + cfg.modelUrl;
  iframe.src = `./webview.html?model=${encodeURIComponent(url)}`;
  log(`加载模型 ${id}`);
}

// ---- 事件绑定 ----
for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-ev]"))) {
  btn.addEventListener("click", () => dispatch({ type: btn.dataset.ev } as PetEvent));
}
document.getElementById("lipStart")!.addEventListener("click", startFakeLipSync);
document.getElementById("lipStop")!.addEventListener("click", stopFakeLipSync);
modelSel.addEventListener("change", () => selectModel(modelSel.value));

// iframe 回传（ready/error/motion_played）
window.addEventListener("message", (ev) => {
  if (typeof ev.data !== "string") return;
  try {
    const msg = JSON.parse(ev.data) as { type: string; message?: string };
    if (msg.type === "ready") {
      log("模型就绪");
      renderState();
    } else if (msg.type === "error") {
      log("WebView 错误：" + (msg.message ?? ""));
    }
  } catch {
    /* 忽略非本协议消息 */
  }
});

// ---- 启动 ----
void (async () => {
  await loadRegistry();
  selectModel(modelSel.value);
  stateBox.textContent = state;
})();
