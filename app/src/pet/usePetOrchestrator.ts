/**
 * usePetOrchestrator — 把 Live2DView 的 WebView 管道接到 pet-core orchestrator
 *
 * WebView ready 后拿到 post 函数 → 构造 WebViewPetRenderer → 建 PetOrchestrator →
 * 启动 rAF 口型循环（speaking 态按波形每帧 tickMouth）。orchestrator 是纯逻辑，
 * 副作用（rAF）在此 hook 注入，符合"业务/状态收敛于 orchestrator，RN 只提供驱动"。
 *
 * 用法：
 *   const { onRendererReady, dispatch, sendSignal, state } = usePetOrchestrator({ emotionMap });
 *   <Live2DView onRendererReady={onRendererReady} />
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WebViewPetRenderer,
  type AgentSignal,
  type PetEvent,
  type PetState,
} from "@lumo/core";
import { PetOrchestrator } from "./petOrchestrator";

export interface UsePetOrchestratorOptions {
  /** 模型表情映射：emotion 标签 → expression 索引 */
  readonly emotionMap: Record<string, number>;
  /** 模型动作映射：motion 标签 → { group, index } */
  readonly actionMotions?: Record<string, { readonly group: string; readonly index: number }>;
  /** 点击部位 → 动作组 → 索引（与 Windows registry 对齐） */
  readonly tapMotions?: Record<string, Record<string, number>>;
  /** 表情标签未命中的回退索引 */
  readonly defaultExpression?: number;
}

export interface UsePetOrchestratorResult {
  /** 当前宠物状态（随状态机变化触发重渲染） */
  readonly state: PetState;
  /** 传给 Live2DView 的 onRendererReady 回调 */
  readonly onRendererReady: (post: (serialized: string) => void) => void;
  /** 派发状态机事件 */
  readonly dispatch: (event: PetEvent) => void;
  /** 发送归一 Agent 信号 */
  readonly sendSignal: (signal: AgentSignal) => void;
  /** 立即播放表情索引 */
  readonly playExpression: (index?: number) => void;
  /** 按标签播放动作 */
  readonly playMotionByTag: (tag: string) => void;
  /** Live2D hitTest 点击区域回调处理 */
  readonly handleTapHit: (area: string) => void;
}

export function usePetOrchestrator(options: UsePetOrchestratorOptions): UsePetOrchestratorResult {
  const orchRef = useRef<PetOrchestrator | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const [state, setState] = useState<PetState>("idle");

  // rAF 口型循环：每帧把经过秒数喂给 orchestrator（非 speaking 态其内部为空操作）
  const loop = useCallback(() => {
    const orch = orchRef.current;
    if (orch) {
      const elapsed = (Date.now() - startRef.current) / 1000;
      orch.tickMouth(elapsed);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const onRendererReady = useCallback(
    (post: (serialized: string) => void) => {
      const renderer = new WebViewPetRenderer(post);
      orchRef.current = new PetOrchestrator(renderer, {
        emotionMap: options.emotionMap,
        actionMotions: options.actionMotions,
        tapMotions: options.tapMotions,
        defaultExpression: options.defaultExpression,
        onStateChange: (next) => setState(next),
      });
      startRef.current = Date.now();
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop);
    },
    [options.emotionMap, options.actionMotions, options.tapMotions, options.defaultExpression, loop],
  );

  const dispatch = useCallback((event: PetEvent) => {
    orchRef.current?.dispatch(event);
  }, []);

  const sendSignal = useCallback((signal: AgentSignal) => {
    orchRef.current?.sendSignal(signal);
  }, []);

  const playExpression = useCallback((index?: number) => {
    orchRef.current?.playExpression(index);
  }, []);

  const playMotionByTag = useCallback((tag: string) => {
    orchRef.current?.playMotionByTag(tag);
  }, []);

  const handleTapHit = useCallback((area: string) => {
    orchRef.current?.handleTapHit(area);
  }, []);

  // 卸载时停 rAF
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      orchRef.current = null;
    };
  }, []);

  return { state, onRendererReady, dispatch, sendSignal, playExpression, playMotionByTag, handleTapHit };
}
