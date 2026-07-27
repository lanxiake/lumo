/**
 * mediaStore — 保存图片到系统相册的 RN 封装
 *
 * GalleryScreen 里的图片是 data:image/...;base64 URI，浏览器无法打开，
 * 必须解出 base64 交给原生 MediaStoreModule 写入相册。
 *
 * parseDataUri 为纯函数便于单测；saveImageToGallery 负责权限申请 + 原生调用。
 */

import { NativeModules, PermissionsAndroid, Platform } from "react-native";

interface MediaStoreNativeModule {
  saveImageBase64(base64: string, mimeType: string): Promise<void>;
}

const MEDIA_STORE = (NativeModules as Record<string, unknown>).MediaStore as
  | MediaStoreNativeModule
  | undefined;

export interface ParsedDataUri {
  readonly base64: string;
  readonly mimeType: string;
}

/**
 * 解析 data URI，提取 mimeType 与纯 base64。
 * 仅接受 base64 编码的图片 data URI；非法输入返回 null。
 */
export function parseDataUri(uri: string): ParsedDataUri | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(uri.trim());
  if (!match) return null;
  const mimeType = match[1];
  const base64 = match[2].trim();
  if (!base64) return null;
  return { mimeType, base64 };
}

/** API < 29 需运行时 WRITE_EXTERNAL_STORAGE；≥29 无需权限。返回是否可写。 */
async function ensureWritePermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  if (typeof Platform.Version === "number" && Platform.Version >= 29) return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: "保存图片",
        message: "需要存储权限才能把画保存到相册哦",
        buttonPositive: "好的",
        buttonNegative: "取消",
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * 把 data URI 图片保存到系统相册。
 * @throws Error 当 URI 非法 / 无权限 / 原生模块缺失 / 写入失败
 */
export async function saveImageToGallery(dataUri: string): Promise<void> {
  const parsed = parseDataUri(dataUri);
  if (!parsed) {
    throw new Error("图片格式不支持保存");
  }
  if (!MEDIA_STORE) {
    throw new Error("当前设备不支持保存到相册");
  }
  const allowed = await ensureWritePermission();
  if (!allowed) {
    throw new Error("没有存储权限，无法保存");
  }
  await MEDIA_STORE.saveImageBase64(parsed.base64, parsed.mimeType);
}
