#!/usr/bin/env node
/**
 * emulator-dev.mjs — 模拟器一键联调脚本
 *
 * 整合 kids-mobile 在 Android 模拟器上的完整启动流程：
 *   1. 检查/启动 Android 模拟器（默认 Pixel_6_API_35）
 *   2. 配置网络转发（adb reverse tcp:3000 / tcp:19001）
 *   3. 同步 Live2D 资源
 *   4. 打包 node-runtime 宿主（指向本机 Gateway）
 *   5. gradlew app:installDebug 构建并安装 APK
 *   6. 启动/复用 Metro
 *   7. 重启 App 并抓取日志
 *
 * 环境要求：
 *   - 本机已启动 API 服务器（localhost:3000）
 *   - 本机已启动 Gateway（localhost:19001）
 *   - ANDROID_HOME 已配置
 *
 * 用法：
 *   node scripts/emulator-dev.mjs              # 全流程
 *   node scripts/emulator-dev.mjs --no-build   # 跳过 gradle，只改网络/重启
 *   node scripts/emulator-dev.mjs --logs       # 只抓日志+截图
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
const LOG_DIR = path.join(APP_DIR, "logs");
const LOG_FILE = path.join(LOG_DIR, "emulator-dev.log");
const SHOT_PATH = path.join(APP_DIR, "dev-shot.png");
const DEFAULT_AVD = "Pixel_6_API_35";

const ANDROID_HOME =
  process.env.ANDROID_HOME ||
  path.join(process.env.LOCALAPPDATA || "C:/Users/Administrator/AppData/Local", "Android/Sdk");
const ADB = path.join(ANDROID_HOME, "platform-tools", "adb.exe");
const EMULATOR = path.join(ANDROID_HOME, "emulator", "emulator.exe");
const GRADLEW = path.join(ANDROID_DIR, process.platform === "win32" ? "gradlew.bat" : "gradlew");

const args = new Set(process.argv.slice(2));
const flags = {
  noBuild: args.has("--no-build"),
  logsOnly: args.has("--logs"),
};

function log(msg) {
  process.stdout.write(`\x1b[36m[emulator-dev]\x1b[0m ${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`\x1b[33m[emulator-dev]\x1b[0m ${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`\x1b[31m[emulator-dev]\x1b[0m ${msg}\n`);
  process.exit(1);
}

function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
  if (res.status !== 0) fail(`命令失败：${cmd} ${cmdArgs.join(" ")}（退出码 ${res.status}）`);
  return res;
}

function capture(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts });
  return (res.stdout || "").trim();
}

function adb(cmdArgs, opts = {}) {
  return capture(ADB, cmdArgs, opts);
}

function listAvds() {
  const out = capture(EMULATOR, ["-list-avds"]);
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function isEmulatorOnline() {
  const out = adb(["devices"]);
  return out.split("\n").some((l) => /emulator-\d+\s+device\b/.test(l.trim()));
}

function waitForEmulator(deadlineMs = 120000) {
  log("等待模拟器上线…");
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (isEmulatorOnline()) {
      log("模拟器已上线。");
      return;
    }
    spawnSync(process.platform === "win32" ? "ping" : "sleep", [
      process.platform === "win32" ? "-n" : "1",
      process.platform === "win32" ? "2" : "1",
    ], { stdio: "ignore" });
  }
  fail("模拟器未在指定时间内上线。");
}

function ensureEmulator() {
  if (isEmulatorOnline()) {
    log("模拟器已在线。");
    return;
  }
  const avds = listAvds();
  const avd = avds.includes(DEFAULT_AVD) ? DEFAULT_AVD : avds[0];
  if (!avd) fail(`找不到可用 AVD。请先用 Android Studio 创建一个模拟器。`);
  log(`启动模拟器 ${avd}…`);
  const child = spawn(EMULATOR, ["-avd", avd, "-no-snapshot-load"], {
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();
  waitForEmulator();
}

function setupNetwork() {
  log("配置模拟器网络转发…");
  adb(["reverse", "tcp:3000", "tcp:3000"]);
  adb(["reverse", "tcp:19001", "tcp:19001"]);
  const list = adb(["reverse", "--list"]);
  log("当前转发规则：\n" + list.split("\n").map((l) => "  " + l).join("\n"));
}

function syncAssets() {
  log("同步 Live2D 资源到 android assets…");
  run(process.execPath, [path.join(APP_DIR, "scripts", "sync-live2d-assets.mjs")], { cwd: APP_DIR });
}

function buildNodeBundle() {
  log("打包 node-runtime 宿主（指向本机 Gateway）…");
  const buildEnv = { ...process.env };
  buildEnv.LUMO_GATEWAY_URL = process.env.LUMO_GATEWAY_URL || "http://127.0.0.1:19001";
  buildEnv.KIDS_MOBILE_PLATFORM = process.env.KIDS_MOBILE_PLATFORM || "android";
  buildEnv.KIDS_MOBILE_APP_VERSION = process.env.KIDS_MOBILE_APP_VERSION || "0.0.0-dev";
  log(`Gateway URL → ${buildEnv.LUMO_GATEWAY_URL}`);
  run(process.execPath, [path.join(APP_DIR, "scripts", "build-node.mjs")], {
    cwd: APP_DIR,
    env: buildEnv,
  });
}

function isMetroRunning() {
  const out = capture("netstat", ["-ano"]);
  return out.split("\n").some((l) => l.includes(`:${METRO_PORT}`) && /LISTENING/i.test(l));
}

function ensureMetro() {
  if (isMetroRunning()) {
    log(`metro 已在 ${METRO_PORT} 运行，复用。`);
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
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (isMetroRunning()) {
      log("metro 已就绪。");
      return;
    }
    spawnSync(process.platform === "win32" ? "ping" : "sleep", [
      process.platform === "win32" ? "-n" : "2",
      process.platform === "win32" ? "2" : "1",
    ], { stdio: "ignore" });
  }
  warn("等待 metro 超时，继续（可能仍在启动）。");
}

function buildInstall() {
  log("gradlew app:installDebug…");
  run(GRADLEW, ["app:installDebug", `-PreactNativeDevServerPort=${METRO_PORT}`], {
    cwd: ANDROID_DIR,
    shell: true,
  });
  log("APK 已安装。");
}

function restartApp() {
  log("重启 App…");
  adb(["logcat", "-c"]);
  adb(["shell", "am", "force-stop", APP_ID]);
  adb(["shell", "am", "start", "-n", MAIN_ACTIVITY]);
}

function sleep(ms) {
  if (process.platform === "win32") {
    spawnSync("ping", ["-n", String(Math.ceil(ms / 1000) + 1), "127.0.0.1"], { stdio: "ignore" });
  } else {
    spawnSync("sleep", [String(ms / 1000)], { stdio: "ignore" });
  }
}

function grabLogs() {
  log("等待 App 加载（30s）…");
  sleep(30000);
  const raw = adb(["logcat", "-d", "-v", "brief"]);
  const keep =
    /CONSOLE|ReactNativeJS|NODEJS-MOBILE|Live2D|Cubism|PIXI|Unable to resolve|SyntaxError|net::ERR|Failed to load|Running application|error code: 500|FATAL|AndroidRuntime|turn_timing/i;
  const drop = /GmsCore|BestClock|variations|MetricsProcessor|ExtensionManager|PlayCore|Downloader|ThermalHalWrapper|s_glBindAttribLocation/i;
  const lines = raw
    .split("\n")
    .filter((l) => keep.test(l) && !drop.test(l))
    .slice(-120);

  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(LOG_FILE, lines.join("\n") + "\n", { encoding: "utf8" });
    log(`设备日志已写入 ${LOG_FILE}`);
  } catch (err) {
    warn(`写入日志失败: ${err instanceof Error ? err.message : String(err)}`);
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
    writeFileSync(SHOT_PATH, res.stdout);
    log(`截图已保存（${res.stdout.length} 字节）。`);
  } else {
    warn("截图失败。");
  }
}

// ---- 主流程 ----
if (!existsSync(ADB)) fail(`找不到 adb：${ADB}（检查 ANDROID_HOME）`);
if (!existsSync(GRADLEW)) fail(`找不到 gradlew：${GRADLEW}`);

if (flags.logsOnly) {
  grabLogs();
  screenshot();
  process.exit(0);
}

ensureEmulator();
setupNetwork();

if (!flags.noBuild) {
  syncAssets();
  buildNodeBundle();
  ensureMetro();
  buildInstall();
} else {
  ensureMetro();
}

restartApp();
grabLogs();
screenshot();
log("完成。");
