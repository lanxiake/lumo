/**
 * petNamePersistence — 每角色自定义名字持久化
 *
 * 用户可给每个 Live2D 角色单独取名（小猫姐姐 / 小美各存各的），键 kids.petName.<petId>。
 * 未自定义时回退到 model-registry 内置 name。名字随 init 注入提示词（petName）。
 */

import type { SecureStorage } from "../auth/secureStorage";
import { getPetModelConfig } from "../../node-runtime/src/config/model-registry";

const KEY_PREFIX = "kids.petName.";

/** 读取某角色的有效名字：自定义优先，否则内置默认名 */
export async function loadPetName(storage: SecureStorage, petId: string): Promise<string> {
  const fallback = getPetModelConfig(petId).name;
  const custom = await storage.getItem(`${KEY_PREFIX}${petId}`);
  const trimmed = custom?.trim();
  return trimmed ? trimmed : fallback;
}

/** 保存某角色的自定义名字；空字符串视为恢复默认（删除自定义） */
export async function savePetName(
  storage: SecureStorage,
  petId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (trimmed) {
    await storage.setItem(`${KEY_PREFIX}${petId}`, trimmed);
  } else {
    await storage.removeItem(`${KEY_PREFIX}${petId}`);
  }
}
