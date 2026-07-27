#!/usr/bin/env node
/**
 * dev-run.mjs — kids-mobile 一键打包调试脚本
 *
 * 整合联调全流程，便于反复调试（避免手敲一长串 adb / gradlew 命令）：
 *   1. 校验模拟器/设备在线（不在线则提示，不自动开，避免误开多实例）
 *   2. 同步 Live2D 资源到 android assets（sync-live2d-assets.mjs）
 *   2.5 打包 node-runtime 宿主(esbuild → nodejs-project/main.js)
 *   3. 确保 metro 在跑（8081 已监听则复用，否则后台拉起）
 *   4. gradlew app:installDebug 构建并安装 APK（首次约 6min，增量约 30s）
 *   5. adb reverse tcp:8081 + 重启 App
 *   6. 抓取 WebView console / ReactNativeJS 关键日志
 *   7. 截图落地到 apps/kids-mobile/dev-shot.png
 *
 * 用法：
 *   node scripts/dev-run.mjs              # 全流程（debug，连本地 Gateway）
 *   node scripts/dev-run.mjs --no-build   # 跳过 gradle 构建（仅改 JS 时，metro 热更）
 *   node scripts/dev-run.mjs --assets-only# 仅同步资源+重装（改了 webview 资源时）
 *   node scripts/dev-run.mjs --logs       # 仅抓日志+截图（App 已在跑）
 *   node scripts/dev-run.mjs --release    # release APK（连生产 Gateway，内置 JS bundle，不依赖 metro）
 *
 * 依赖环境变量（未设则用默认 Android SDK 路径）：ANDROID_HOME
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "..");
const ANDROID_DIR = path.join(APP_DIR, "android");
const APP_ID = "com.lumo.app";
const MAIN_ACTIVITY = `${APP_ID}/.MainActivity`;
const METRO_PORT = 8081;
const SHOT_PATH = path.join(APP_DIR, "dev-shot.png");

const ANDROID_HOME =
  process.env.ANDROID_HOME ||
  path.join(process.env.LOCALAPPDATA || "C:/Users/Administrator/AppData/Local", "Android/Sdk");
const ADB = path.join(ANDROID_HOME, "platform-tools", "adb.exe");
// gradlew 用绝对路径：shell 下裸 "gradlew.bat" 因当前目录不在 PATH 而找不到。
const GRADLEW = path.join(ANDROID_DIR, process.platform === "win32" ? "gradlew.bat" : "gradlew");

const args = new Set(process.argv.slice(2));
const flags = {
  noBuild: args.has("--no-build"),
  assetsOnly: args.has("--assets-only"),
  logsOnly: args.has("--logs"),
  release: args.has("--release"),
};

function log(msg) {
  process.stdout.write(`\x1b[36m[dev-run]\x1b[0m ${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`\x1b[33m[dev-run]\x1b[0m ${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`\x1b[31m[dev-run]\x1b[0m ${msg}\n`);
  process.exit(1);
}

/** 同步执行并回显；失败即退出 */
function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
  if (res.status !== 0) fail(`命令失败：${cmd} ${cmdArgs.join(" ")}（退出码 ${res.status}）`);
  return res;
}

/** 同步执行并捕获 stdout（不回显） */
function capture(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts });
  return (res.stdout || "").trim();
}

function adb(cmdArgs, opts = {}) {
  return capture(ADB, cmdArgs, opts);
}

function ensureDevice() {
  if (!existsSync(ADB)) fail(`找不到 adb：${ADB}（检查 ANDROID_HOME）`);
  const out = adb(["devices"]);
  const lines = out
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && l.endsWith("device"));
  if (lines.length === 0) {
    fail(
      "没有在线设备/模拟器。请先启动模拟器：\n" +
        `  ${path.join(ANDROID_HOME, "emulator", "emulator.exe")} -list-avds\n` +
        `  ${path.join(ANDROID_HOME, "emulator", "emulator.exe")} @<AVD名> -no-snapshot-load`,
    );
  }
  log(`设备在线：${lines.map((l) => l.split("\t")[0]).join(", ")}`);
}

function syncAssets() {
  log("同步 Live2D 资源到 android assets…");
  run(process.execPath, [path.join(APP_DIR, "scripts", "sync-live2d-assets.mjs")], { cwd: APP_DIR });
}

/** esbuild 打 node-runtime 宿主 bundle → nodejs-project/main.js（真实 Gateway 链路） */
function buildNodeBundle() {
  log("打包 node-runtime 宿主(esbuild，真实 Gateway 链路)…");
  const buildArgs = [path.join(APP_DIR, "scripts", "build-node.mjs")];
  // 设备端 nodejs-mobile 读不到宿主机 env，gateway URL 必须在打包期注入。
  // 真机 USB 联调：adb reverse tcp:19001 tcp:19001 后，设备访问 127.0.0.1:19001 即宿主 Gateway。
  // 模拟器用 10.0.2.2:19001；可用 LUMO_GATEWAY_URL 环境变量覆盖。
  const buildEnv = { ...process.env };
  // 独立运行默认走 direct provider（设置页配置），gateway 仅为本地开发回退。
  // 打包期注入本地兜底；RN 运行时若下发 _auth.gatewayUrl 会覆盖。
  buildEnv.LUMO_GATEWAY_URL = process.env.LUMO_GATEWAY_URL || "http://127.0.0.1:19001";
  buildEnv.KIDS_MOBILE_PLATFORM = process.env.KIDS_MOBILE_PLATFORM || "android";
  buildEnv.KIDS_MOBILE_APP_VERSION = process.env.KIDS_MOBILE_APP_VERSION || "0.0.0-dev";
  log(`Gateway URL → ${buildEnv.LUMO_GATEWAY_URL}`);
  run(process.execPath, buildArgs, { cwd: APP_DIR, env: buildEnv });
}

/** 8081 是否已监听（复用现有 metro） */
function isMetroRunning() {
  const out = capture("netstat", ["-ano"]);
  return out.split("\n").some((l) => l.includes(`:${METRO_PORT}`) && /LISTENING/i.test(l));
}

function ensureMetro() {
  if (isMetroRunning()) {
    log(`metro 已在 ${METRO_PORT} 端口运行，复用。`);
    return;
  }
  log("启动 metro（后台）…");
  const child = spawn("pnpm", ["start"], {
    cwd: APP_DIR,
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();
  // 简单等待端口起来
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (isMetroRunning()) {
      log("metro 已就绪。");
      return;
    }
    spawnSync(process.platform === "win32" ? "timeout" : "sleep", [
      process.platform === "win32" ? "/t" : "1",
      process.platform === "win32" ? "1" : "",
    ]);
  }
  warn("等待 metro 超时，继续（可能仍在启动）。");
}

function buildInstall() {
  log("gradlew app:installDebug（构建+安装 APK）…");
  run(GRADLEW, ["app:installDebug", `-PreactNativeDevServerPort=${METRO_PORT}`], {
    cwd: ANDROID_DIR,
    shell: true,
  });
  log("APK 已安装。");
}

function buildInstallRelease() {
  log("gradlew app:installRelease（构建 release APK+安装，内置 JS bundle，不依赖 metro）…");
  run(GRADLEW, ["app:installRelease"], { cwd: ANDROID_DIR, shell: true });
  log("Release APK 已安装。");
}

function restartApp() {
  log("adb reverse + 重启 App…");
  adb(["reverse", `tcp:${METRO_PORT}`, `tcp:${METRO_PORT}`]);
  adb(["reverse", "tcp:19001", "tcp:19001"]);
  adb(["logcat", "-c"]);
  adb(["shell", "am", "force-stop", APP_ID]);
  adb(["shell", "am", "start", "-n", MAIN_ACTIVITY]);
}

function sleep(ms) {
  // 用 spawnSync 阻塞睡眠，避免 busy-wait 吃满 CPU。跨平台：win 用 ping 兜底。
  if (process.platform === "win32") {
    spawnSync("ping", ["-n", String(Math.ceil(ms / 1000) + 1), "127.0.0.1"], { stdio: "ignore" });
  } else {
    spawnSync("sleep", [String(ms / 1000)], { stdio: "ignore" });
  }
}

function grabLogs() {
  log("等待 App 打包/加载（40s）…");
  sleep(40000);
  const raw = adb(["logcat", "-d", "-v", "brief"]);
  const keep =
    /CONSOLE|ReactNativeJS|NODEJS-MOBILE|Live2D|Cubism|PIXI|Unable to resolve|SyntaxError|net::ERR|Failed to load|Running application|error code: 500|FATAL|AndroidRuntime/i;
  const drop = /GmsCore|BestClock|variations|MetricsProcessor|ExtensionManager|PlayCore|Downloader|ThermalHalWrapper/i;
  const lines = raw
    .split("\n")
    .filter((l) => keep.test(l) && !drop.test(l))
    .slice(-80);

  const LOG_DIR = path.join(APP_DIR, "logs");
  const LOG_FILE = path.join(LOG_DIR, "dev.log");
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    writeFileSync(LOG_FILE, lines.join("\n") + "\n", { encoding: "utf8" });
    log(`设备日志已写入 ${LOG_FILE}`);
  } catch (err) {
    warn(`写入设备日志失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  log("关键日志：");
  process.stdout.write(lines.join("\n") + "\n");
}

function screenshot() {
  log(`截图 → ${SHOT_PATH}`);
  const res = spawnSync(ADB, ["exec-out", "screencap", "-p"], {
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status === 0 && res.stdout?.length) {
    writeFileSync(SHOT_PATH, res.stdout); // exec-out 二进制安全
    log(`截图已保存（${res.stdout.length} 字节）。`);
  } else {
    warn("截图失败。");
  }
}

// ---- 主流程 ----
ensureDevice();

if (flags.logsOnly) {
  grabLogs();
  screenshot();
  process.exit(0);
}

syncAssets();
buildNodeBundle();

if (flags.release) {
  // release：内置 JS bundle，不依赖 metro，连生产 Gateway。
  buildInstallRelease();
  restartApp();
  grabLogs();
  screenshot();
  log("完成（release）。");
  process.exit(0);
}

if (flags.assetsOnly) {
  buildInstall(); // 资源打进 APK，必须重装
  restartApp();
  grabLogs();
  screenshot();
  process.exit(0);
}

ensureMetro();

if (!flags.noBuild) {
  buildInstall();
}

restartApp();
grabLogs();
screenshot();
log("完成。");
