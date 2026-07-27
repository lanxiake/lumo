#!/usr/bin/env node
/**
 * build-node.mjs — 把 node-runtime 宿主打成 nodejs-mobile 可执行的单文件 main.js
 *
 * node-runtime 是 TS + NodeNext ESM，依赖 workspace 包 @lumo/agent-runtime(host-kit
 * 全家桶)。设备端 nodejs-mobile 跑的是 Node 18，不认 TS，也没有 pnpm symlink 的
 * node_modules。故用 esbuild 把入口 + 所有 @lumo 依赖打成一个自包含 CJS bundle，
 * 输出到 nodejs-assets/nodejs-project/main.js(该文件被 gitignore，属构建产物)。
 *
 * external 约定：
 *  - rn-bridge：nodejs-mobile 原生注入的内置模块(设备端 require 提供)，不可打包。
 *  - node:* 内置模块：Node 18 自带(fs/path/net/crypto...)，交运行时。
 *    注意 node:sqlite 是 Node 22.5+ 才有，Node 18 无——但 mock streamFn 链路不触发
 *    storage 层，故标 external 让它按需惰性 require(不进启动路径就不会崩)。
 *
 * 用法：
 *   node scripts/build-node.mjs            # 打真实宿主 bundle(接 Gateway)
 *   node scripts/build-node.mjs --watch    # 监听重建(改 node-runtime 时)
 *
 * 搜索引擎（web_search）：在 Windows「用户/系统环境变量」配置其一即可，打包时自动注入：
 *   SEARXNG_BASE_URL   或   LANGSEARCH_API_KEY
 * （可选 SEARXNG_SECRET_KEY）。当前 shell 未继承时会回退读取 User/Machine 注册表级环境变量。
 */

import { build, context } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "..");
const ENTRY = path.join(APP_DIR, "node-runtime", "src", "index.ts");
const OUT = path.join(APP_DIR, "nodejs-assets", "nodejs-project", "main.js");
const QUICKJS_STUB = path.join(__dirname, "stubs", "quickjs-stub.mjs");
const PROXY_STUB = path.join(__dirname, "stubs", "proxy-agent-stub.mjs");
const AXIOS_STUB = path.join(__dirname, "stubs", "axios-stub.mjs");

const cliArgs = process.argv.slice(2);
const watch = cliArgs.includes("--watch");

function log(msg) {
  process.stdout.write(`\x1b[35m[build-node]\x1b[0m ${msg}\n`);
}

/**
 * 从项目内 .env 文件读取键值（committed，供无 Windows env 的机器/CI 也能注入非密钥配置）。
 * 仅读 apps/kids-mobile/.env.build（若存在）。返回首个匹配键的值。
 * @param {string} key
 * @returns {string | undefined}
 */
let _envFileCache = null;
function readEnvFile(key) {
  if (_envFileCache === null) {
    _envFileCache = {};
    const envPath = path.join(APP_DIR, ".env.build");
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
        if (!m || line.trimStart().startsWith("#")) continue;
        // 去掉可选包裹引号
        _envFileCache[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  }
  const v = _envFileCache[key];
  return v ? v : undefined;
}

/**
 * 从 Windows 用户/系统环境变量读取（不依赖当前 shell 是否已重启）。
 * @param {string} key
 * @returns {string | undefined}
 */
function readWindowsPersistentEnv(key) {
  if (process.platform !== "win32") return undefined;
  // 仅允许安全标识符，避免注入
  if (!/^[A-Z0-9_]+$/i.test(key)) return undefined;
  try {
    const ps = [
      `$u=[Environment]::GetEnvironmentVariable('${key}','User');`,
      `$m=[Environment]::GetEnvironmentVariable('${key}','Machine');`,
      `if(-not [string]::IsNullOrEmpty($u)){Write-Output $u}elseif(-not [string]::IsNullOrEmpty($m)){Write-Output $m}`,
    ].join("");
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 8000,
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 解析构建期环境变量：优先当前 process.env，Windows 下回退 User/Machine。
 * @param {string} key
 * @returns {{ value: string | undefined, source: "process" | "windows" | "none" }}
 */
function resolveBuildEnv(key) {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return { value: fromProcess, source: "process" };
  const fromFile = readEnvFile(key);
  if (fromFile) return { value: fromFile, source: "envfile" };
  const fromWin = readWindowsPersistentEnv(key)?.trim();
  if (fromWin) return { value: fromWin, source: "windows" };
  return { value: undefined, source: "none" };
}

// 设备端 nodejs-mobile 运行时读不到宿主机环境变量，故 gateway / 搜索配置须在打包期
// 从构建环境读取并 define 进 bundle（真机运行时读不到宿主 env）。
const INJECT_ENV_KEYS = [
  "LUMO_GATEWAY_URL",
  "KIDS_MOBILE_PLATFORM",
  "KIDS_MOBILE_APP_VERSION",
  // web_search / web_fetch：可配 Windows 环境变量 SEARXNG_BASE_URL 或 LANGSEARCH_API_KEY
  "LANGSEARCH_API_KEY",
  "SEARXNG_BASE_URL",
  "SEARXNG_SECRET_KEY",
];

const gatewayEnvDefines = {};
/** @type {Record<string, "process" | "windows" | "none">} */
const injectSources = {};
for (const key of INJECT_ENV_KEYS) {
  const { value, source } = resolveBuildEnv(key);
  injectSources[key] = source;
  if (value) {
    // 同步回 process.env，便于同进程后续脚本与工具读到同一值
    process.env[key] = value;
    gatewayEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }
}

{
  const searx = injectSources.SEARXNG_BASE_URL;
  const lang = injectSources.LANGSEARCH_API_KEY;
  const searchOk = searx !== "none" || lang !== "none";
  log(
    `web_search 注入: SEARXNG=${searx === "none" ? "未配置" : `已注入(${searx})`} LANGSEARCH=${lang === "none" ? "未配置" : `已注入(${lang})`}`,
  );
  if (!searchOk) {
    log(
      "提示: 请在 Windows 用户/系统环境变量设置 SEARXNG_BASE_URL 或 LANGSEARCH_API_KEY 后重新打包，否则真机无法联网搜索",
    );
  }
}

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  // rn-bridge 由设备原生提供；node:sqlite 在 Node18 不存在，标 external 惰性加载。
  external: ["rn-bridge", "node:sqlite"],
  // 把 QuickJS(PAC 代理执行引擎)+ 整条 proxy-agent 链桩掉：其 WASM/vm 在
  // nodejs-mobile 加载即 SIGSEGV，移动端用 RN 网络栈不需要任何系统代理。
  alias: {
    "@tootallnate/quickjs-emscripten": QUICKJS_STUB,
    "quickjs-emscripten": QUICKJS_STUB,
    "proxy-agent": PROXY_STUB,
    "pac-proxy-agent": PROXY_STUB,
    "pac-resolver": PROXY_STUB,
    // msedge-tts 仅 getVoices 用 axios（本端不调），其 fetch adapter 含 Node20+
    // ReadableStream 死代码，stub 掉彻底挡在 bundle 外（合成走 ws，零功能损失）。
    axios: AXIOS_STUB,
  },
  // node-runtime 是 ESM(.js 后缀 import 指向 .ts)，esbuild 按扩展解析即可，
  // 但 NodeNext 的 .js→.ts 需要 resolveExtensions 兜底。
  resolveExtensions: [".ts", ".tsx", ".mjs", ".js", ".json"],
  logLevel: "info",
  metafile: false,
  // 不用 inline sourcemap：设备内存紧张(nodejs-mobile + WebView + Node 三者叠加)，
  // inline 会让 main.js 翻倍到 ~24MB 加剧 OOM。改 external(.map 旁挂，不进主文件加载路径)。
  sourcemap: "external",
  // 压缩：减小 bundle 体积，降低设备加载内存峰值。
  minify: true,
  // 打包期注入环境：gateway URL 等从构建环境注入（真机运行时读不到宿主 env）。
  define: {
    ...gatewayEnvDefines,
  },
  // 将 .md 提示词模板作为文本字符串打包进 bundle，设备端无需额外文件 IO。
  loader: {
    ".md": "text",
  },
  banner: {
    // File polyfill：nodejs-mobile 是 Node 18，缺 Node20+ 才有的全局 File，
    // undici 7.x 顶层用到 File，加载即抛 "File is not defined" → pi-ai 未捕获的
    // import("undici") rejection 进而导致 native SIGSEGV。node:buffer 有 File 类，
    // 在 bundle 最顶部补到 globalThis 即可（零功能损失，见 §SIGSEGV 根因备忘）。
    //
    // crypto polyfill：同理 nodejs-mobile 的 Node18 未默认暴露全局 WebCrypto
    // （Node19+ 才默认开），msedge-tts 的 ws 握手用 globalThis.crypto 生成
    // connectionId → 合成时抛 "crypto is not defined" → tts_error。把
    // node:crypto.webcrypto 挂到 globalThis.crypto 即可（零功能损失）。
    js:
      `// [kids-mobile] node-runtime bundle — 由 scripts/build-node.mjs 生成，勿手改。\n` +
      `try{if(typeof globalThis.File==="undefined"){globalThis.File=require("node:buffer").File;}}catch(_){}` +
      `try{if(typeof globalThis.crypto==="undefined"){globalThis.crypto=require("node:crypto").webcrypto;}}catch(_){}`,
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  log(`监听重建中 → ${path.relative(APP_DIR, OUT)}`);
} else {
  const start = Date.now();
  await build(options);
  log(`打包完成(${Date.now() - start}ms) → ${path.relative(APP_DIR, OUT)}`);
}
