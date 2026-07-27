/**
 * setup-sherpa — 下载并安装 sherpa-onnx 原生库与流式中文模型到 Android
 *
 * 单一数据源原则：sherpa-onnx 的 native .so（~30MB/arm64）与 bilingual zh-en 流式
 * 模型（~300MB）体积大，不入 git（见 .gitignore）。本脚本在开发/构建前下载并铺放到：
 *   - android/app/src/main/jniLibs/arm64-v8a/    ← libsherpa-onnx-jni.so + libonnxruntime.so
 *   - android/app/src/main/assets/               ← 模型目录 + silero_vad.onnx
 *
 * 用法：node scripts/setup-sherpa.mjs [--mirror <前缀>]
 *   默认走 gh-proxy 镜像加速；国内直连 GitHub 过慢。可 --mirror "" 走原始 GitHub。
 *
 * 幂等：已存在且大小匹配则跳过下载/解压。
 */

import { existsSync, mkdirSync, statSync, rmSync, cpSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Windows' System32 tar (bsdtar) doesn't support bzip2 (-j). Use GNU tar from Git if available.
const GNU_TAR_CANDIDATES = ["D:/develop/Git/usr/bin/tar.exe", "C:/Program Files/Git/usr/bin/tar.exe"];
const TAR = (() => {
  if (process.platform !== "win32") return "tar";
  for (const p of GNU_TAR_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return "tar"; // fallback; may fail for bz2
})();

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

const args = process.argv.slice(2);
const mirrorIdx = args.indexOf("--mirror");
// 默认 ghproxy.net：实测对大文件（模型 ~500MB）比 gh-proxy.com 快数倍且更稳。
const MIRROR = mirrorIdx >= 0 ? (args[mirrorIdx + 1] ?? "") : "https://ghproxy.net/";

const ABI = "arm64-v8a";
const NATIVE_VERSION = "v1.13.0";
const MODEL_DIR = "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20";

const GH = "https://github.com/k2-fsa/sherpa-onnx/releases/download";
const NATIVE_URL = `${GH}/${NATIVE_VERSION}/sherpa-onnx-${NATIVE_VERSION}-android.tar.bz2`;
const MODEL_URL = `${GH}/asr-models/${MODEL_DIR}.tar.bz2`;
const VAD_URL = `${GH}/asr-models/silero_vad.onnx`;

const JNI_DST = resolve(appRoot, `android/app/src/main/jniLibs/${ABI}`);
const ASSETS = resolve(appRoot, "android/app/src/main/assets");
const CACHE = resolve(appRoot, ".sherpa-cache");

function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

/** 校验 tar.bz2 是否完整可解（大文件经镜像常下载不全） */
function isTarValid(file) {
  return spawnSync(TAR, ["tjf", file], { stdio: "ignore" }).status === 0;
}

/**
 * curl 下载：镜像前缀 + 断点续传 + 重试 + 可选完整性校验。
 * 大文件（模型 ~500MB）经公共镜像常中途断连，故按 tar 完整性循环续传直到有效。
 */
function download(url, out, { minBytes = 0, verifyTar = false, maxAttempts = 8 } = {}) {
  const done = () => {
    if (!existsSync(out)) return false;
    if (verifyTar) return isTarValid(out);
    return minBytes > 0 && statSync(out).size >= minBytes;
  };
  if (done()) {
    console.log(`  ✓ 已存在且完整，跳过：${out.replace(appRoot, ".")}`);
    return;
  }
  const finalUrl = MIRROR ? `${MIRROR}${url}` : url;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`  ↓ 下载（尝试 ${attempt}/${maxAttempts}）${finalUrl}`);
    // 续传（-C -）；镜像不支持 Range 时会从头覆盖，属预期。
    spawnSync(
      "curl",
      ["-L", "--retry", "5", "--retry-delay", "3", "-C", "-", "--connect-timeout", "20", "-m", "3000", "-o", out, finalUrl],
      { stdio: "inherit" },
    );
    if (done()) {
      console.log("  ✓ 下载完成且校验通过");
      return;
    }
    if (verifyTar && existsSync(out) && !isTarValid(out)) {
      console.log("  ! tar 不完整，删除后重下");
      rmSync(out, { force: true });
    }
  }
  throw new Error(`下载失败或校验不通过（已重试 ${maxAttempts} 次）：${finalUrl}`);
}

/** 解压 tar.bz2 到目标目录 */
function extract(tar, dst) {
  ensureDir(dst);
  const r = spawnSync(TAR, ["xjf", tar, "-C", dst], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`解压失败：${tar}`);
}

function main() {
  console.log("[setup-sherpa] 安装 sherpa-onnx 原生库与中文流式模型…");
  console.log(`  镜像：${MIRROR || "(原始 GitHub)"}`);
  ensureDir(CACHE);
  ensureDir(JNI_DST);
  ensureDir(ASSETS);

  // 1) native .so（tar 含全部 ABI，只取 arm64-v8a 的 jni + onnxruntime）
  console.log("原生库（jniLibs）:");
  const nativeTar = resolve(CACHE, "sherpa-native.tar.bz2");
  download(NATIVE_URL, nativeTar, { minBytes: 40_000_000, verifyTar: true });
  const nativeExtract = resolve(CACHE, "native");
  rmSync(nativeExtract, { recursive: true, force: true });
  extract(nativeTar, nativeExtract);
  for (const so of ["libsherpa-onnx-jni.so", "libonnxruntime.so"]) {
    const src = resolve(nativeExtract, `jniLibs/${ABI}/${so}`);
    if (!existsSync(src)) throw new Error(`native 库缺失: ${src}`);
    copyFileSync(src, resolve(JNI_DST, so));
    console.log(`  ✓ jniLibs/${ABI}/${so}`);
  }

  // 2) silero_vad.onnx
  console.log("VAD 模型:");
  download(VAD_URL, resolve(ASSETS, "silero_vad.onnx"), { minBytes: 500_000 });
  console.log("  ✓ assets/silero_vad.onnx");

  // 3) bilingual zh-en 流式模型
  console.log("ASR 模型（bilingual zh-en 流式）:");
  const modelTar = resolve(CACHE, "model.tar.bz2");
  download(MODEL_URL, modelTar, { minBytes: 500_000_000, verifyTar: true });
  const modelDst = resolve(ASSETS, MODEL_DIR);
  if (!existsSync(modelDst)) {
    extract(modelTar, ASSETS);
    console.log(`  ✓ assets/${MODEL_DIR}/`);
  } else {
    console.log(`  ✓ 已存在，跳过解压：assets/${MODEL_DIR}/`);
  }

  // 瘦身：客户端运行时用 int8 量化模型（SherpaAsrModule.USE_INT8_MODEL=true），
  // 全精度 .onnx（encoder ~315MB 等）不入 APK。解压后删除全精度文件，省 ~342MB。
  const fullPrecision = [
    `${MODEL_DIR}/encoder-epoch-99-avg-1.onnx`,
    `${MODEL_DIR}/decoder-epoch-99-avg-1.onnx`,
    `${MODEL_DIR}/joiner-epoch-99-avg-1.onnx`,
  ];
  for (const f of fullPrecision) {
    const p = resolve(ASSETS, f);
    if (existsSync(p)) {
      rmSync(p, { force: true });
      console.log(`  ✂ 删除全精度模型（用 int8 替代）：assets/${f}`);
    }
  }

  // 校验 int8 模型关键文件（运行时实际加载的）
  const need = [
    `${MODEL_DIR}/encoder-epoch-99-avg-1.int8.onnx`,
    `${MODEL_DIR}/decoder-epoch-99-avg-1.int8.onnx`,
    `${MODEL_DIR}/joiner-epoch-99-avg-1.int8.onnx`,
    `${MODEL_DIR}/tokens.txt`,
  ];
  for (const f of need) {
    if (!existsSync(resolve(ASSETS, f))) throw new Error(`模型文件缺失: assets/${f}`);
  }

  console.log("[setup-sherpa] 完成。可执行 pnpm android 构建（仅 arm64-v8a 真机）。");
}

main();
