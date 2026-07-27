/**
 * usePaginatedHistory — 聊天记录持久化分页（默认 20 条，下拉加载更早）
 *
 * 单一真值源：持久化的 messages（listMessages 读全量，升序）。可选叠加内存实时
 * 尾巴（live）——正在流式的回复、未落库的事件卡片——以 createdAt 去重（比持久化
 * 最新更晚的才算尾巴，避免同一条消息重复）。
 *
 * 控制坞传 live=内存消息（含流式）；设置全屏页不传 live（纯持久化回顾）。
 *
 * ponytail: 每次 reload 读整个 messages.jsonl；儿童 App 规模足够。若历史增至上万条
 * 再换游标/索引存储。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { stripVirtualHumanTags } from "@lumo/core";
import type { MessageRow } from "./types";
import { getLocalStore } from "./database";

export interface UsePaginatedHistoryResult {
  /** 当前可见消息（升序，最近 revealed 条） */
  readonly visible: readonly MessageRow[];
  /** 是否还有更早的记录可加载 */
  readonly hasMore: boolean;
  /** 再加载一页更早记录 */
  readonly loadOlder: () => void;
  /** 重新读取持久化快照（如设置页打开时） */
  readonly reload: () => void;
}

export function usePaginatedHistory(params: {
  readonly sessionKey: string;
  readonly pageSize?: number;
  readonly live?: readonly MessageRow[];
}): UsePaginatedHistoryResult {
  const { sessionKey, pageSize = 20, live } = params;
  const [persisted, setPersisted] = useState<readonly MessageRow[]>([]);
  const [revealed, setRevealed] = useState(pageSize);

  const reload = useCallback(() => {
    getLocalStore()
      .then((store) => store.listMessages(sessionKey))
      // 旧记录可能含表情/动作标签，展示前统一剥离（与 App 启动回填一致）。
      .then((rows) => setPersisted(rows.map((r) => ({ ...r, content: stripVirtualHumanTags(r.content) }))))
      .catch(() => {});
  }, [sessionKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  const timeline = useMemo(() => {
    if (!live || live.length === 0) return persisted;
    const maxPersistedTs = persisted.length ? persisted[persisted.length - 1].createdAt : 0;
    const tail = live.filter((m) => m.createdAt > maxPersistedTs);
    return tail.length > 0 ? [...persisted, ...tail] : persisted;
  }, [persisted, live]);

  const visible = useMemo(
    () => (timeline.length > revealed ? timeline.slice(timeline.length - revealed) : timeline),
    [timeline, revealed],
  );
  const hasMore = timeline.length > revealed;
  const loadOlder = useCallback(() => setRevealed((r) => r + pageSize), [pageSize]);

  return { visible, hasMore, loadOlder, reload };
}
