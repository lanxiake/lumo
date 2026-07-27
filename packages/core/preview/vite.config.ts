/**
 * Vite 配置 — pet-core 浏览器预览（阶段 E 关键里程碑）
 *
 * 目标：Chrome 打开即见 Live2D 宠物，用控制面板发假事件驱动
 * 状态机 → 表情/口型/动作，全程无 RN/真机。
 *
 * 三件事：
 *  1) 让 harness.ts 能直接引用 pet-core 源码（源码用 NodeNext 的 .js 说明符指向 .ts，
 *     加一个 resolveId 插件把存在同名 .ts 的 .js 说明符改指 .ts）。
 *  2) 中间件把 /vendor/*（pixi / live2d / cubism core）映射到 pnpm store 与 app/assets vendor。
 *  3) 中间件把 /models/* 映射到 app/assets/pet-models，供 live2d fetch 模型。
 */

import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, createReadStream, statSync } from "node:fs";
import { extname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const PNPM = resolve(repoRoot, "node_modules/.pnpm");
const PIXI_MIN = resolve(PNPM, "pixi.js@6.5.10/node_modules/pixi.js/dist/browser/pixi.min.js");
const LIVE2D_MIN = resolve(
  PNPM,
  "pixi-live2d-display@0.4.0_0736f5bd67d2e4de7e9fff36ad63fa2e/node_modules/pixi-live2d-display/dist/cubism4.min.js",
);
const APP_ASSETS = resolve(repoRoot, "app/assets");
const CUBISM_CORE = resolve(APP_ASSETS, "live2d-vendor/live2dcubismcore.min.js");
const MODELS_ROOT = resolve(APP_ASSETS, "pet-models");

/** 允许 .js 说明符解析到同名 .ts（pet-core 源码用 NodeNext .js 后缀） */
function jsToTsResolver(): Plugin {
  return {
    name: "js-to-ts-resolver",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!importer || !source.endsWith(".js")) return null;
      if (!source.startsWith(".") && !source.startsWith("/")) return null;
      const abs = resolve(dirname(importer), source);
      const tsPath = abs.replace(/\.js$/, ".ts");
      if (existsSync(tsPath)) return tsPath;
      return null;
    },
  };
}

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".moc3": "application/octet-stream",
  ".model3": "application/json",
  ".motion3": "application/json",
  ".exp3": "application/json",
  ".physics3": "application/json",
  ".cdi3": "application/json",
};

/** 把单个磁盘文件挂到某个 URL 前缀 */
function serveFile(prefix: string, file: string): Plugin {
  return {
    name: `serve-file:${prefix}`,
    configureServer(server) {
      server.middlewares.use(prefix, (_req, res) => {
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end(`vendor not found: ${file}`);
          return;
        }
        res.setHeader("Content-Type", "text/javascript");
        createReadStream(file).pipe(res);
      });
    },
  };
}

/** 把一个目录挂到 URL 前缀（供 live2d fetch 模型全套文件） */
function serveDir(prefix: string, root: string): Plugin {
  return {
    name: `serve-dir:${prefix}`,
    configureServer(server) {
      server.middlewares.use(prefix, (req, res) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const abs = resolve(root, "." + rel);
        if (!abs.startsWith(root) || !existsSync(abs) || !statSync(abs).isFile()) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("Content-Type", MIME[extname(abs)] ?? "application/octet-stream");
        createReadStream(abs).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: here,
  server: { port: 5180, open: "/index.html", fs: { allow: [repoRoot] } },
  plugins: [
    jsToTsResolver(),
    serveFile("/vendor/pixi.min.js", PIXI_MIN),
    serveFile("/vendor/live2d-cubism4.min.js", LIVE2D_MIN),
    serveFile("/vendor/live2dcubismcore.min.js", CUBISM_CORE),
    serveDir("/models", MODELS_ROOT),
  ],
});
