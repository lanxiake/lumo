/**
 * sync-live2d-assets — 把 Live2D WebView 运行时资源同步到 RN Android assets
 *
 * 单一数据源原则：core preview 的 webview 运行时来自 packages/core/preview，
 * cubism core 与 pet 模型 vendor 在 app/assets/ 下（随仓库提交）。本脚本在
 * 开发/构建前把它们拷进 android/app/src/main/assets/live2d/（该目录已 gitignore），
 * 供 WebView 用 file:///android_asset/live2d/ 加载。
 *
 * 用法：node scripts/sync-live2d-assets.mjs
 *
 * iOS 后续用类似方式同步到 ios 的 bundle 资源目录（本 MVP 先覆盖 Android）。
 */

import { existsSync, mkdirSync, copyFileSync, cpSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..");
const PNPM = resolve(repoRoot, "node_modules/.pnpm");

/** 目标：Android assets 下的 live2d 运行时目录 */
const ASSETS = resolve(appRoot, "android/app/src/main/assets/live2d");
const VENDOR = resolve(ASSETS, "vendor");
const MODELS = resolve(ASSETS, "models");

/** core preview 运行时（HTML + runtime.js） */
const PREVIEW = resolve(repoRoot, "packages/core/preview");

/** 随仓库提交的 vendor 资产（cubism core JS + pet 模型） */
const LIVE2D_VENDOR = resolve(appRoot, "assets/live2d-vendor");
const PET_MODELS = resolve(appRoot, "assets/pet-models");

/**
 * 定位 pixi-live2d-display 的 UMD（路径含 pnpm hash，用前缀匹配避免硬编码）。
 * 使用 index.min.js（Cubism2+4 合体包），以便同时加载 .model.json 与 .model3.json。
 * @param {string} fileName dist 下文件名
 */
function resolvePixiLive2d(fileName = "index.min.js") {
  const dirs = readdirSync(PNPM).filter((d) => d.startsWith("pixi-live2d-display@"));
  if (dirs.length === 0) throw new Error("未找到 pixi-live2d-display，请先 pnpm install");
  return resolve(PNPM, dirs[0], "node_modules/pixi-live2d-display/dist", fileName);
}

const SOURCES = {
  vendor: [
    {
      src: resolve(PNPM, "pixi.js@6.5.10/node_modules/pixi.js/dist/browser/pixi.min.js"),
      dst: resolve(VENDOR, "pixi.min.js"),
    },
    // Cubism 2.1 运行时核心（xiaomai 等 .moc / .model.json 必需）
    {
      src: resolve(LIVE2D_VENDOR, "live2d.min.js"),
      dst: resolve(VENDOR, "live2d.min.js"),
    },
    // Cubism 4 运行时核心（mao_pro / ug_official 等 .moc3 / .model3.json）
    {
      src: resolve(LIVE2D_VENDOR, "live2dcubismcore.min.js"),
      dst: resolve(VENDOR, "live2dcubismcore.min.js"),
    },
    // pixi-live2d-display 合体包（勿同时加载 cubism2+cubism4）
    { src: resolvePixiLive2d("index.min.js"), dst: resolve(VENDOR, "live2d-display.min.js") },
  ],
  // 只拷 runtime.js；webview.html 用相对路径版单独生成（见下），因为 RN
  // file:///android_asset 下绝对路径 /vendor 无法解析。
  runtime: [
    { src: resolve(PREVIEW, "webview-runtime.js"), dst: resolve(ASSETS, "webview-runtime.js") },
  ],
  modelsRoot: PET_MODELS,
};

/**
 * RN 版 webview.html：vendor 用相对路径（./vendor/*），去掉 type="module"
 * （runtime.js 用 window.PIXI，无 ESM import）。默认模型经 ?model= 相对路径指定。
 */
const RN_WEBVIEW_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>pet-core Live2D WebView runtime (RN)</title>
    <style>
      html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
      #stage { display: block; width: 100vw; height: 100vh; }
      #hint { position: fixed; left: 8px; bottom: 8px; font: 12px/1.4 system-ui, sans-serif; color: #888; white-space: pre; }
    </style>
    <!-- UMD 顺序：Cubism2 core → Cubism4 core → pixi → pixi-live2d-display(index) -->
    <script src="./vendor/live2d.min.js"></script>
    <script src="./vendor/live2dcubismcore.min.js"></script>
    <script src="./vendor/pixi.min.js"></script>
    <script src="./vendor/live2d-display.min.js"></script>
  </head>
  <body>
    <canvas id="stage"></canvas>
    <div id="hint">加载中…</div>
    <script src="./webview-runtime.js"></script>
  </body>
</html>
`;

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function copyOne(src, dst) {
  if (!existsSync(src)) throw new Error(`资源缺失: ${src}`);
  ensureDir(dirname(dst));
  copyFileSync(src, dst);
  console.log(`  ✓ ${dst.replace(appRoot, ".")}`);
}

function main() {
  console.log("[sync-live2d-assets] 同步 Live2D WebView 资源到 android assets…");
  ensureDir(VENDOR);
  ensureDir(MODELS);

  console.log("vendor（pixi / live2d / cubism core）:");
  for (const { src, dst } of SOURCES.vendor) copyOne(src, dst);

  console.log("runtime（webview-runtime.js + RN 版 webview.html）:");
  for (const { src, dst } of SOURCES.runtime) copyOne(src, dst);
  const htmlDst = resolve(ASSETS, "webview.html");
  writeFileSync(htmlDst, RN_WEBVIEW_HTML, "utf8");
  console.log(`  ✓ ${htmlDst.replace(appRoot, ".")}（RN 相对路径版）`);

  console.log("models（复制整个 pet-models 目录）:");
  ensureDir(MODELS);
  cpSync(SOURCES.modelsRoot, MODELS, { recursive: true });
  console.log(`  ✓ ${MODELS.replace(appRoot, ".")}`);

  console.log("[sync-live2d-assets] 完成。WebView 用 file:///android_asset/live2d/webview.html 加载。");
}

main();
