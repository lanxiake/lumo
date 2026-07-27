/**
 * gen-app-icon.mjs — 生成「萌宠伴」国风暖纸笺 App 图标（sharp 光栅化 SVG）
 *
 * 主题：暖米纸底 + 墨线小猫剪影 + 朱砂小印，偏正式品牌标（非简笔卡通）。
 * 一份 SVG 铺满 5 档密度的 ic_launcher.png / ic_launcher_round.png。
 *
 * 用法：node scripts/gen-app-icon.mjs
 */

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RES = resolve(__dirname, "../android/app/src/main/res");

/** 各密度 launcher 图标边长（px） */
const DENSITIES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

/**
 * 生成国风暖纸笺 SVG。
 * @param {boolean} round 圆形裁切（ic_launcher_round）
 * @returns {string} SVG 文本
 */
function iconSvg(round) {
  const clip = round
    ? `<clipPath id="c"><circle cx="256" cy="256" r="256"/></clipPath>`
    : `<clipPath id="c"><rect x="0" y="0" width="512" height="512" rx="96"/></clipPath>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    ${clip}
    <linearGradient id="paper" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="#FBF6EE"/>
      <stop offset="0.55" stop-color="#F3E6D6"/>
      <stop offset="1" stop-color="#E8D2C4"/>
    </linearGradient>
    <radialGradient id="wash" cx="0.35" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#F7C9B8" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#F7C9B8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="inkFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3D342F"/>
      <stop offset="1" stop-color="#1F1815"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#c)">
    <!-- 暖纸笺底 -->
    <rect x="0" y="0" width="512" height="512" fill="url(#paper)"/>
    <rect x="0" y="0" width="512" height="512" fill="url(#wash)"/>
    <!-- 细软金边框（品牌感，不抢主体） -->
    <rect x="28" y="28" width="456" height="456" rx="72" fill="none"
      stroke="#C4A574" stroke-width="3" opacity="0.55"/>
    <rect x="40" y="40" width="432" height="432" rx="64" fill="none"
      stroke="#C4A574" stroke-width="1.5" opacity="0.35"/>

    <!-- 墨线小猫：正脸简洁剪影（耳+头+颈肩暗示） -->
    <g transform="translate(256 248)">
      <!-- 左耳 -->
      <path d="M-78 -28 L-118 -118 L-28 -72 Z" fill="url(#inkFill)"/>
      <!-- 右耳 -->
      <path d="M78 -28 L118 -118 L28 -72 Z" fill="url(#inkFill)"/>
      <!-- 耳内（米纸透色，显层次） -->
      <path d="M-72 -38 L-98 -98 L-40 -70 Z" fill="#F6EDE2" opacity="0.88"/>
      <path d="M72 -38 L98 -98 L40 -70 Z" fill="#F6EDE2" opacity="0.88"/>
      <!-- 头 -->
      <ellipse cx="0" cy="8" rx="118" ry="108" fill="url(#inkFill)"/>
      <!-- 脸部留白（剪纸透窗） -->
      <ellipse cx="0" cy="18" rx="86" ry="78" fill="#F8F1E6"/>
      <!-- 眼：细长墨点，偏正式 -->
      <ellipse cx="-34" cy="8" rx="10" ry="14" fill="#1F1815"/>
      <ellipse cx="34" cy="8" rx="10" ry="14" fill="#1F1815"/>
      <circle cx="-30" cy="2" r="3.2" fill="#F8F1E6" opacity="0.9"/>
      <circle cx="38" cy="2" r="3.2" fill="#F8F1E6" opacity="0.9"/>
      <!-- 鼻 -->
      <path d="M0 28 l-9 10 h18 Z" fill="#B85C4A"/>
      <!-- 嘴：克制短线 -->
      <path d="M0 38 v12 M0 50 q-16 10 -28 2 M0 50 q16 10 28 2"
        fill="none" stroke="#1F1815" stroke-width="5" stroke-linecap="round"/>
      <!-- 下颌/肩暗示（剪影收束） -->
      <path d="M-70 95 Q0 128 70 95 Q40 150 0 158 Q-40 150 -70 95 Z"
        fill="url(#inkFill)" opacity="0.92"/>
    </g>

    <!-- 朱砂小印：爪印，右下角印章感 -->
    <g transform="translate(378 378)">
      <rect x="-36" y="-36" width="72" height="72" rx="10"
        fill="#C45C48" opacity="0.92"/>
      <!-- 掌垫 -->
      <ellipse cx="0" cy="8" rx="14" ry="12" fill="#F8F1E6" opacity="0.95"/>
      <!-- 趾垫 -->
      <circle cx="-14" cy="-8" r="6.5" fill="#F8F1E6" opacity="0.95"/>
      <circle cx="0" cy="-14" r="6.5" fill="#F8F1E6" opacity="0.95"/>
      <circle cx="14" cy="-8" r="6.5" fill="#F8F1E6" opacity="0.95"/>
    </g>
  </g>
</svg>`;
}

/** 生成全部密度的 launcher 图标 */
async function run() {
  for (const [dir, size] of Object.entries(DENSITIES)) {
    const outDir = resolve(RES, dir);
    mkdirSync(outDir, { recursive: true });
    await sharp(Buffer.from(iconSvg(false)))
      .resize(size, size)
      .png()
      .toFile(resolve(outDir, "ic_launcher.png"));
    await sharp(Buffer.from(iconSvg(true)))
      .resize(size, size)
      .png()
      .toFile(resolve(outDir, "ic_launcher_round.png"));
    console.log(`[icon] ${dir} ${size}x${size} ✓`);
  }
  console.log("[icon] 全部密度生成完成");
}

run().catch((e) => {
  console.error("[icon] 生成失败:", e);
  process.exit(1);
});
