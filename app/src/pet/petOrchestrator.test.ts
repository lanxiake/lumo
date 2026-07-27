// petOrchestrator 契约测试：组合 pet-core 状态机 + 表情策略 + 口型波形，
// 经注入的 PetCoreRenderer 驱动渲染。用一个记录调用的假 renderer 断言指令序列。
import { describe, it, expect, beforeEach } from "vitest";
import { PetOrchestrator } from "./petOrchestrator.js";
import type { PetCoreRenderer, PetState } from "@lumo/core";

interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

/** 记录所有渲染调用的假 renderer */
class RecordingRenderer implements PetCoreRenderer {
  readonly calls: RecordedCall[] = [];
  setExpression(i: number): void {
    this.calls.push({ method: "setExpression", args: [i] });
  }
  playMotion(g: string, i?: number): void {
    this.calls.push({ method: "playMotion", args: [g, i] });
  }
  playRandomMotion(g: string): void {
    this.calls.push({ method: "playRandomMotion", args: [g] });
  }
  getMotionCount(): number {
    return 0;
  }
  setMouthOpen(v: number): void {
    this.calls.push({ method: "setMouthOpen", args: [v] });
  }
  releaseLipSync(): void {
    this.calls.push({ method: "releaseLipSync", args: [] });
  }
  resize(w: number, h: number): void {
    this.calls.push({ method: "resize", args: [w, h] });
  }
  methodsCalled(name: string): RecordedCall[] {
    return this.calls.filter((c) => c.method === name);
  }
}

// mao_pro 风格的 emotionMap（joy/sadness/neutral/calm 有映射）
const emotionMap = { neutral: 0, joy: 3, sadness: 5, calm: 2 };

describe("PetOrchestrator — 状态驱动与表情", () => {
  let renderer: RecordingRenderer;
  let orch: PetOrchestrator;

  beforeEach(() => {
    renderer = new RecordingRenderer();
    orch = new PetOrchestrator(renderer, { emotionMap });
  });

  it("初始为 idle", () => {
    expect(orch.getState()).toBe("idle");
  });

  it("切态时下发表情索引（经 emotionMap 解析）", () => {
    orch.dispatch({ type: "USER_SEND" }); // idle → thinking(emotion=calm→2)
    expect(orch.getState()).toBe("thinking");
    const exp = renderer.methodsCalled("setExpression");
    expect(exp[exp.length - 1].args[0]).toBe(2);
  });

  it("带动作组的状态下发 playMotion", () => {
    orch.dispatch({ type: "USER_SEND" });
    orch.dispatch({ type: "AGENT_FINAL" }); // thinking → tts_converting
    orch.dispatch({ type: "TTS_READY" }); // → speaking(emotion=joy, motionGroup=Talk)
    expect(orch.getState()).toBe("speaking");
    const motions = renderer.methodsCalled("playMotion");
    expect(motions.some((m) => m.args[0] === "Talk")).toBe(true);
  });

  it("相同状态重复事件不重复下发表情（去抖）", () => {
    orch.dispatch({ type: "USER_SEND" }); // → thinking
    const before = renderer.methodsCalled("setExpression").length;
    orch.dispatch({ type: "AGENT_DELTA" }); // thinking → thinking（无变化）
    const after = renderer.methodsCalled("setExpression").length;
    expect(after).toBe(before);
  });
});

describe("PetOrchestrator — 口型驱动", () => {
  let renderer: RecordingRenderer;
  let orch: PetOrchestrator;

  beforeEach(() => {
    renderer = new RecordingRenderer();
    orch = new PetOrchestrator(renderer, { emotionMap });
  });

  function enterSpeaking(): void {
    orch.dispatch({ type: "USER_SEND" });
    orch.dispatch({ type: "AGENT_FINAL" });
    orch.dispatch({ type: "TTS_READY" });
  }

  it("speaking 态 tickMouth 下发 setMouthOpen（0~1）", () => {
    enterSpeaking();
    orch.tickMouth(0.1);
    orch.tickMouth(0.2);
    const mouth = renderer.methodsCalled("setMouthOpen");
    expect(mouth.length).toBeGreaterThanOrEqual(2);
    for (const c of mouth) {
      const v = c.args[0] as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("非 speaking 态 tickMouth 不下发口型", () => {
    orch.dispatch({ type: "USER_SEND" }); // thinking
    orch.tickMouth(0.1);
    expect(renderer.methodsCalled("setMouthOpen").length).toBe(0);
  });

  it("离开 speaking 释放口型（releaseLipSync）", () => {
    enterSpeaking();
    orch.tickMouth(0.1);
    orch.dispatch({ type: "AUDIO_END" }); // speaking → idle
    expect(orch.getState()).toBe("idle");
    expect(renderer.methodsCalled("releaseLipSync").length).toBeGreaterThanOrEqual(1);
  });
});

describe("PetOrchestrator — 信号映射与回调", () => {
  it("sendSignal 经 pet-core 映射驱动状态机", () => {
    const renderer = new RecordingRenderer();
    const orch = new PetOrchestrator(renderer, { emotionMap });
    orch.dispatch({ type: "USER_SEND" }); // thinking
    orch.sendSignal({ kind: "final" }); // thinking → tts_converting
    expect(orch.getState()).toBe("tts_converting");
    orch.sendSignal({ kind: "safety_blocked" }); // tts_converting 无此转移，保持
    expect(orch.getState()).toBe("tts_converting");
  });

  it("网络错误信号 → network_error", () => {
    const renderer = new RecordingRenderer();
    const orch = new PetOrchestrator(renderer, { emotionMap });
    orch.dispatch({ type: "USER_SEND" });
    orch.sendSignal({ kind: "error", code: "ECONN" });
    expect(orch.getState()).toBe("network_error");
  });

  it("onStateChange 在切态时回调新旧状态", () => {
    const renderer = new RecordingRenderer();
    const changes: Array<[PetState, PetState]> = [];
    const orch = new PetOrchestrator(renderer, {
      emotionMap,
      onStateChange: (next, prev) => changes.push([next, prev]),
    });
    orch.dispatch({ type: "USER_SEND" });
    expect(changes).toEqual([["thinking", "idle"]]);
  });

  it("noop 信号不改变状态", () => {
    const renderer = new RecordingRenderer();
    const orch = new PetOrchestrator(renderer, { emotionMap });
    orch.dispatch({ type: "USER_SEND" });
    orch.sendSignal({ kind: "noop" });
    expect(orch.getState()).toBe("thinking");
  });
});
