/**
 * deviceIdentity — 稳定 deviceId 的取用/生成（纯逻辑，注入持久化）
 *
 * deviceId 必须跨重启稳定（Gateway 按 deviceId 归属校验）。首次生成后落持久化，
 * 之后恒读回同一个。生成/读写逻辑纯化（注入 get/set），便于单测。
 *
 * publicKey：MVP 用一个占位串（api-server 只校验非空，未做真实密钥协商）。
 * 后续接真实非对称密钥时替换 makePlaceholderPublicKey。
 */

/** 生成一个足够随机的 deviceId（RN 无 crypto.randomUUID 时的兜底也覆盖） */
export function generateDeviceId(rand: () => number = Math.random): string {
  // 形如 kids-<time36>-<rand36>，可读且碰撞概率极低（本地单设备场景足够）。
  const t = Date.now().toString(36);
  const r = Math.floor(rand() * 0xffffffff).toString(36);
  return `kids-${t}-${r}`;
}

/** MVP 占位公钥（api-server 仅校验非空）；接真实密钥后替换 */
export function makePlaceholderPublicKey(deviceId: string): string {
  return `placeholder-pk:${deviceId}`;
}

export interface DeviceIdStore {
  get(): Promise<string | null>;
  set(id: string): Promise<void>;
}

/**
 * 取用稳定 deviceId：存储里有就返回，没有则生成并写入后返回。
 * @param store 注入的持久化（op-sqlite local_memories / MMKV / 内存）
 */
export async function resolveDeviceId(
  store: DeviceIdStore,
  rand: () => number = Math.random,
): Promise<string> {
  const existing = await store.get();
  if (existing) return existing;
  const id = generateDeviceId(rand);
  await store.set(id);
  return id;
}
