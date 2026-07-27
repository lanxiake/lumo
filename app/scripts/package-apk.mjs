#!/usr/bin/env node
/**
 * package-apk.mjs — 打包可安装到手机的 release APK（产出文件，无需连设备）
 *
 * 与 dev-run.mjs --release 的区别：本脚本用 gradlew assembleRelease 产出 APK 文件，
 * 不要求设备在线、不做 adb 安装/日志/截图。适合出包发给测试机安装。
 *
 * 全流程：
 *   1. 同步 Live2D 资源到 android assets
 *   2. 校验 sherpa 模型/原生库就位（缺失则提示先跑 pnpm setup:sherpa）
 *   3. esbuild 打 node-runtime 宿主 → nodejs-project/main.js
 *   4. gradlew assembleRelease → app-release.apk（debug 签名，可直接安装）
 *   5. 打印 APK 路径；若设备在线且传 --install，则 adb install -r 装机
 *
 * 用法：
 *   node scripts/package-apk.mjs             # 只出 APK 文件
 *   node scripts/package-apk.mjs --install   # 出包并装到在线设备
 *   LUMO_GATEWAY_URL=... node scripts/package-apk.mjs   # 覆盖打包期回退网关
 *
 * 注：release 用 debug keystore 签名（见 android/app/build.gradle），仅供测试。
 *     上架请自行生成正式 keystore。
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "..");
const ANDROID_DIR = path.join(APP_DIR, "android");
const ASSETS_DIR = path.join(ANDROID_DIR, "app", "src", "main", "assets");
const JNI_DIR = path.join(ANDROID_DIR, "app", "src", "main", "jniLibs", "arm64-v8a");
const MODEL_DIR = "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20";
const APK_PATH = path.join(ANDROID_DIR, "app", "build", "outputs", "apk", "release", "app-release.apk");

const ANDROID_HOME =
  process.env.ANDROID_HOME ||
  path.join(process.env.LOCALAPPDATA || "C:/Users/Administrator/AppData/Local", "Android/Sdk");
const ADB = path.join(ANDROID_HOME, "platform-tools", "adb.exe");
const GRADLEW = path.join(ANDROID_DIR, process.platform === "win32" ? "gradlew.bat" : "gradlew");

const args = new Set(process.argv.slice(2));
const doInstall = args.has("--install");

function log(msg) {
  process.stdout.write(`\x1b[36m[package-apk]\x1b[0m ${msg}\n`);
}
function warn(msg) {
  process.stdout.write(`\x1b[33m[package-apk]\x1b[0m ${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`\x1b[31m[package-apk]\x1b[0m ${msg}\n`);
  process.exit(1);
}

function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
  if (res.status !== 0) fail(`命令失败：${cmd} ${cmdArgs.join(" ")}（退出码 ${res.status}）`);
  return res;
}

/** 校验 sherpa 语音模型/原生库就位；缺失则中止并提示先下载。 */
function ensureSherpa() {
  const need = [
    path.join(JNI_DIR, "libsherpa-onnx-jni.so"),
    path.join(JNI_DIR, "libonnxruntime.so"),
    path.join(ASSETS_DIR, "silero_vad.onnx"),
    path.join(ASSETS_DIR, MODEL_DIR, "encoder-epoch-99-avg-1.int8.onnx"),
    path.join(ASSETS_DIR, MODEL_DIR, "tokens.txt"),
  ];
  const missing = need.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    fail(
      "sherpa 语音模型/原生库缺失，无法打出可用 APK（ASR 会崩）。\n" +
        "请先下载：\n  pnpm setup:sherpa\n" +
        "缺失文件：\n" +
        missing.map((p) => `  - ${p.replace(APP_DIR, ".")}`).join("\n"),
    );
  }
  log("sherpa 模型/原生库校验通过。");
}

function syncAssets() {
  log("同步 Live2D 资源到 android assets…");
  run(process.execPath, [path.join(APP_DIR, "scripts", "sync-live2d-assets.mjs")], { cwd: APP_DIR });
}

function buildNodeBundle() {
  log("打包 node-runtime 宿主（esbuild）…");
  const buildEnv = { ...process.env };
  // 独立运行默认走 direct provider（设置页配置），gateway 仅为本地开发回退。
  buildEnv.LUMO_GATEWAY_URL = process.env.LUMO_GATEWAY_URL || "http://127.0.0.1:19001";
  buildEnv.KIDS_MOBILE_PLATFORM = process.env.KIDS_MOBILE_PLATFORM || "android";
  buildEnv.KIDS_MOBILE_APP_VERSION = process.env.KIDS_MOBILE_APP_VERSION || "1.0.0";
  log(`Gateway 回退 URL → ${buildEnv.LUMO_GATEWAY_URL}`);
  run(process.execPath, [path.join(APP_DIR, "scripts", "build-node.mjs")], {
    cwd: APP_DIR,
    env: buildEnv,
  });
}

function assembleRelease() {
  log("gradlew assembleRelease（构建 release APK，内置 JS bundle）…");
  run(GRADLEW, ["app:assembleRelease"], { cwd: ANDROID_DIR, shell: true });
  if (!existsSync(APK_PATH)) fail(`构建结束但未找到 APK：${APK_PATH}`);
  log(`APK 已生成：${APK_PATH}`);
}

/** 设备在线才装（离线不报错，仅跳过）。 */
function installIfDevice() {
  if (!existsSync(ADB)) {
    warn(`找不到 adb（${ADB}），跳过安装。手动安装：adb install -r "${APK_PATH}"`);
    return;
  }
  const out = (spawnSync(ADB, ["devices"], { encoding: "utf8" }).stdout || "")
    .split("\n")
    .slice(1)
    .filter((l) => l.trim().endsWith("device"));
  if (out.length === 0) {
    warn(`无在线设备，跳过安装。手动安装：adb install -r "${APK_PATH}"`);
    return;
  }
  log("检测到在线设备，adb install -r 安装…");
  run(ADB, ["install", "-r", APK_PATH]);
  log("安装完成。");
}

// ---- 主流程 ----
ensureSherpa();
syncAssets();
buildNodeBundle();
assembleRelease();
if (doInstall) installIfDevice();
log("完成。把上面的 app-release.apk 传到手机安装即可（需允许「未知来源」）。");
