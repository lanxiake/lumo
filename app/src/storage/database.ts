/**
 * database.ts — RN 侧本地存储入口
 *
 * 原先用 @op-engineering/op-sqlite + 适配器；现改用 react-native-fs + JSONL。
 * getLocalStore() 保持进程级单例，失败时抛出由 useSessionPersistence 降级。
 */

import type { LocalSessionStore } from "./types";
import { createJsonlStore } from "./jsonlStore";

let storeInstance: LocalSessionStore | null = null;
let openingPromise: Promise<LocalSessionStore> | null = null;

/**
 * 打开（或复用）本地文件存储并返回 DAO 单例。
 * 首次调用会初始化目录与文件；后续调用直接返回缓存实例。
 * @throws 文件系统不可用/初始化失败时抛出，调用方负责降级。
 */
export function getLocalStore(): Promise<LocalSessionStore> {
  if (storeInstance) return Promise.resolve(storeInstance);

  if (!openingPromise) {
    openingPromise = createJsonlStore().then((store) => {
      storeInstance = store;
      return store;
    });
  }

  return openingPromise;
}

/** 关闭并清空单例（测试隔离用；正常运行期无需调用） */
export function closeLocalStore(): void {
  storeInstance = null;
  openingPromise = null;
}
