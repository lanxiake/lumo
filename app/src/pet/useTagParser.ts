/**
 * useTagParser — 流式解析 Agent 回复中的 [emotion] / [motion:tag] 标签
 *
 * 维护一个缓冲区处理跨 delta 被切分的标签，返回剥离标签后的干净文本，并通过回调
 * 触发表情/动作。每个 turn 开始时调用 reset() 清空状态。
 */

import { useCallback, useMemo, useRef } from "react";

const EMOTION_TAG_REGEX = /\[([a-zA-Z0-9_一-龥]+)\]/g;
const MOTION_TAG_REGEX = /\[motion:([a-zA-Z0-9_一-龥]+)\]/g;
const PARTIAL_TAG_REGEX = /\[[a-zA-Z0-9_一-龥:]*$/;

export interface UseTagParserOptions {
  readonly emotionMap: Record<string, number>;
  readonly onExpression: (index: number, name: string) => void;
  readonly onMotion: (tag: string) => void;
}

interface TagMatch {
  readonly index: number;
  readonly length: number;
  readonly type: "emotion" | "motion";
  readonly name: string;
}

export function useTagParser(options: UseTagParserOptions) {
  const optsRef = useRef(options);
  optsRef.current = options;

  const bufferRef = useRef("");
  const emittedEmotionsRef = useRef<Set<string>>(new Set());
  const emittedMotionsRef = useRef<Set<string>>(new Set());

  const reset = useCallback(() => {
    bufferRef.current = "";
    emittedEmotionsRef.current = new Set();
    emittedMotionsRef.current = new Set();
  }, []);

  const feed = useCallback((delta: string): string => {
    const combined = bufferRef.current + delta;

    const matches: TagMatch[] = [];
    let m: RegExpExecArray | null;

    EMOTION_TAG_REGEX.lastIndex = 0;
    while ((m = EMOTION_TAG_REGEX.exec(combined)) !== null) {
      matches.push({ index: m.index, length: m[0].length, type: "emotion", name: m[1]! });
    }

    MOTION_TAG_REGEX.lastIndex = 0;
    while ((m = MOTION_TAG_REGEX.exec(combined)) !== null) {
      matches.push({ index: m.index, length: m[0].length, type: "motion", name: m[1]! });
    }

    matches.sort((a, b) => a.index - b.index);

    let clean = "";
    let lastIndex = 0;

    for (const match of matches) {
      clean += combined.slice(lastIndex, match.index);
      lastIndex = match.index + match.length;

      if (match.type === "emotion") {
        if (!emittedEmotionsRef.current.has(match.name)) {
          emittedEmotionsRef.current.add(match.name);
          const idx = optsRef.current.emotionMap[match.name];
          if (typeof idx === "number") {
            optsRef.current.onExpression(idx, match.name);
          }
        }
      } else {
        if (!emittedMotionsRef.current.has(match.name)) {
          emittedMotionsRef.current.add(match.name);
          optsRef.current.onMotion(match.name);
        }
      }
    }

    const trailing = combined.slice(lastIndex);
    const partial = trailing.match(PARTIAL_TAG_REGEX);
    if (partial) {
      bufferRef.current = partial[0];
      clean += trailing.slice(0, partial.index);
    } else {
      bufferRef.current = "";
      clean += trailing;
    }

    return clean;
  }, []);

  return useMemo(() => ({ feed, reset }), [feed, reset]);
}
