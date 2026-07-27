/**
 * webview-runtime — Live2D WebView 端运行时（浏览器 iframe / RN WebView 内）
 *
 * 消费 pet-core 的 WebViewCommand（motion/random_motion/expression/mouth/
 * release_lipsync/resize），驱动 pixi-live2d-display 模型。口型覆写逻辑对齐
 * Windows Live2dPetRenderer（挂 internalModel.beforeModelUpdate，避免待机动作把
 * 嘴参数覆盖回 0）。
 *
 * 通信：父窗口 postMessage(JSON WebViewCommand) 下发；本端 postMessage 回传
 * WebViewInbound（ready/error/motion_played）。纯浏览器 API，不依赖构建期 import，
 * 故写成独立 .js（vendor UMD 已挂 window.PIXI / window.PIXI.live2d）。
 *
 * 首屏用 URL query 指定模型：?model=/models/mao_pro/runtime/mao_pro.model3.json
 */

// IIFE 隔离词法作用域：普通 <script> 共享全局环境，顶层 const PIXI 会与
// pixi UMD 在全局声明的 PIXI 冲突（"Identifier 'PIXI' has already been declared"），
// 导致整个 runtime 脚本中断。包一层函数作用域即可规避，对逻辑无影响。
(function () {
const PIXI = window.PIXI;
const { Live2DModel } = window.PIXI.live2d;

const DEFAULT_LIP_PARAMS = ["ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y", "ParamA"];
const MOUTH_OUTPUT_SCALE = 0.6;

const hint = document.getElementById("hint");
const canvas = document.getElementById("stage");

function post(msg) {
  const raw = JSON.stringify(msg);
  // 浏览器预览：父窗口；RN WebView：window.ReactNativeWebView
  if (window.parent && window.parent !== window) window.parent.postMessage(raw, "*");
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(raw);
}

const state = {
  app: null,
  model: null,
  lipParams: [...DEFAULT_LIP_PARAMS],
  mouthValue: 0,
  lipSyncActive: false,
  loaded: false,
};

const dragState = {
  activePointerId: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  longPressTimer: null,
  isDragging: false,
  hasMoved: false,
};

const LONG_PRESS_MS = 3000;
const MOVE_THRESHOLD = 10;

function applyMouth(value) {
  const core = state.model?.internalModel?.coreModel;
  if (!core?.setParameterValueById) return;
  const out = value * MOUTH_OUTPUT_SCALE;
  for (const id of state.lipParams) {
    try {
      const scaled = id === "ParamA" ? Math.min(1, out * 1.4) : out;
      core.setParameterValueById(id, scaled);
    } catch {
      /* 单参数失败不影响其余 */
    }
  }
}

function refreshLipParams() {
  const groups = state.model?.internalModel?.settings?.groups;
  const lip = Array.isArray(groups)
    ? groups.find((g) => g.Target === "Parameter" && g.Name === "LipSync")
    : null;
  state.lipParams = lip?.Ids?.length ? [...lip.Ids] : [...DEFAULT_LIP_PARAMS];
}

function bindLipHook() {
  const internal = state.model?.internalModel;
  if (!internal?.on) return;
  internal.on("beforeModelUpdate", () => {
    if (state.lipSyncActive && state.model && state.loaded) applyMouth(state.mouthValue);
  });
}

function motionDefs() {
  return state.model?.internalModel?.motionManager?.definitions ?? null;
}

function motionCount(group) {
  const arr = motionDefs()?.[group];
  return Array.isArray(arr) ? arr.length : 0;
}

async function loadModel(url) {
  if (state.model) {
    state.app.stage.removeChild(state.model);
    state.model.destroy();
    state.model = null;
    state.loaded = false;
  }
  window.PIXI.live2d.config.preserveExpressionOnMotion = true;
  const model = await Live2DModel.from(url, { autoInteract: false });
  state.model = model;
  model.anchor.set(0.5, 0.5);
  state.app.stage.addChild(model);
  fitModel(); // addChild 后再 fit：此时 model.width/height 才可靠
  state.loaded = true;
  refreshLipParams();
  bindLipHook();
  hint.textContent = url.split("/").slice(-1)[0];
  post({ type: "ready" });
}

function fitModel() {
  const model = state.model;
  const app = state.app;
  if (!model || !app) return;
  // 用 app.screen（CSS 逻辑像素）而非 app.renderer（物理像素 = 逻辑×resolution）。
  // displayObject 坐标系是逻辑像素，若用 renderer.width 会在高 DPI 设备上把模型
  // 定位到屏幕外（放大 devicePixelRatio 倍），只露出一角。
  const screenW = app.screen.width;
  const screenH = app.screen.height;
  // 先复位缩放取原始尺寸，再按屏幕目标区域等比 fit（取宽高较小比例，保证完整可见）。
  model.scale.set(1);
  const baseW = model.width;
  const baseH = model.height;
  // 宽高未就绪（0/NaN）时用安全默认缩放，避免 target/0 得到爆炸值把模型推出屏幕。
  if (!baseW || !baseH || !isFinite(baseW) || !isFinite(baseH)) {
    model.scale.set(0.25);
  } else {
    const targetW = screenW * 0.9;
    const targetH = screenH * 0.72;
    const scale = Math.min(targetW / baseW, targetH / baseH);
    model.scale.set(scale > 0 && isFinite(scale) ? scale : 0.25);
  }
  model.position.set(screenW / 2, screenH / 2);
  publishModelRect();
}

/**
 * 把模型当前屏幕包围盒（CSS 逻辑像素）挂到 window，供注入的点击检测按模型实际
 * 大小/位置判定命中；缩放/移动后由 fitModel 等路径重新发布。
 */
function publishModelRect() {
  try {
    const b = state.model?.getBounds();
    if (b) window.__petModelRect = { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    /* 包围盒未就绪时保留旧值；点击检测在无有效 rect 时直接忽略 */
  }
}

function playMotion(group, index) {
  if (!state.model || !state.loaded) return;
  const count = motionCount(group);
  if (count === 0) return;
  const idx =
    typeof index === "number" ? index : count > 1 ? Math.floor(Math.random() * count) : 0;
  const result = state.model.motion(group, idx);
  const entry = motionDefs()?.[group]?.[idx];
  const notify = () =>
    post({ type: "motion_played", group, index: idx, fileName: entry?.File });
  if (result?.then) result.then((ok) => ok && notify()).catch(() => {});
  else notify();
}

function handleCommand(cmd) {
  switch (cmd?.type) {
    case "motion":
      playMotion(cmd.group, cmd.index);
      break;
    case "random_motion": {
      const count = motionCount(cmd.group);
      playMotion(cmd.group, count > 1 ? Math.floor(Math.random() * count) : 0);
      break;
    }
    case "expression":
      if (state.model?.internalModel?.motionManager?.expressionManager) {
        try {
          const r = state.model.expression(cmd.index);
          if (r?.catch) r.catch(() => {});
        } catch {
          /* ignore */
        }
      }
      break;
    case "mouth":
      state.mouthValue = Math.max(0, Math.min(1, cmd.value ?? 0));
      state.lipSyncActive = true;
      if (state.loaded) applyMouth(state.mouthValue);
      break;
    case "release_lipsync":
      state.lipSyncActive = false;
      state.mouthValue = 0;
      if (state.loaded) applyMouth(0);
      break;
    case "resize":
      state.app?.renderer.resize(cmd.width, cmd.height);
      fitModel();
      break;
    default:
      break;
  }
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function startLongPress(x, y) {
  dragState.longPressTimer = window.setTimeout(() => {
    dragState.isDragging = true;
    dragState.lastX = x;
    dragState.lastY = y;
    canvas.style.cursor = "grabbing";
    post({ type: "drag_start", x, y });
  }, LONG_PRESS_MS);
}

function clearLongPress() {
  if (dragState.longPressTimer) {
    window.clearTimeout(dragState.longPressTimer);
    dragState.longPressTimer = null;
  }
}

function onPointerDown(e) {
  if (dragState.activePointerId != null) return;
  dragState.activePointerId = e.pointerId;
  dragState.startX = e.clientX;
  dragState.startY = e.clientY;
  dragState.lastX = e.clientX;
  dragState.lastY = e.clientY;
  dragState.hasMoved = false;
  dragState.isDragging = false;
  startLongPress(e.clientX, e.clientY);
}

function onPointerMove(e) {
  if (dragState.activePointerId !== e.pointerId) return;
  if (!dragState.hasMoved && distance(dragState.startX, dragState.startY, e.clientX, e.clientY) > MOVE_THRESHOLD) {
    dragState.hasMoved = true;
    clearLongPress();
  }
  if (dragState.isDragging) {
    const dx = e.clientX - dragState.lastX;
    const dy = e.clientY - dragState.lastY;
    dragState.lastX = e.clientX;
    dragState.lastY = e.clientY;
    post({ type: "drag_move", dx, dy });
  }
}

function onPointerUp(e) {
  if (dragState.activePointerId !== e.pointerId) return;
  clearLongPress();
  dragState.activePointerId = null;
  if (dragState.isDragging) {
    dragState.isDragging = false;
    canvas.style.cursor = "";
    post({ type: "drag_end" });
  }
}

function onPointerCancel(e) {
  if (dragState.activePointerId !== e.pointerId) return;
  clearLongPress();
  if (dragState.isDragging) {
    dragState.isDragging = false;
    canvas.style.cursor = "";
    post({ type: "drag_end" });
  }
  dragState.activePointerId = null;
}

function bindDragEvents() {
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
}

window.addEventListener("message", (ev) => {
  if (typeof ev.data !== "string") return;
  let cmd;
  try {
    cmd = JSON.parse(ev.data);
  } catch {
    return;
  }
  handleCommand(cmd);
});

async function boot() {
  if (typeof window.Live2DCubismCore === "undefined") {
    hint.textContent = "缺少 live2dcubismcore.min.js";
    post({ type: "error", message: "Cubism Core 未加载" });
    return;
  }
  state.app = new PIXI.Application({
    view: canvas,
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  window.addEventListener("resize", fitModel);
  // RN WebView 旋转时 window.resize 不一定触发；暴露给 RN 主动注入调用重新 fit+居中。
  window.__fitModel = fitModel;
  bindDragEvents();

  const params = new URLSearchParams(location.search);
  const model = params.get("model") ?? "/models/mao_pro/runtime/mao_pro.model3.json";
  try {
    await loadModel(model);
  } catch (err) {
    hint.textContent = "模型加载失败：" + (err?.message ?? err);
    post({ type: "error", message: String(err?.message ?? err) });
  }
}

boot();
})();
