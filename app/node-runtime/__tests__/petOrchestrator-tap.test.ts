/**
 * petOrchestrator handleTapHit 覆盖 —— 头/身走不同表情+动作，候选键按模型 map 回退。
 *
 * 放在 node-runtime __tests__（node 环境、直连 pet-core 源码）而非 src/pet：
 * 后者的 vitest 配置当前未被任何 runner 的 include 命中（孤儿），此处可稳定跑。
 */

import { describe, it, expect } from "vitest";
import type { PetCoreRenderer } from "@lumo/core";
import { PetOrchestrator } from "../../src/pet/petOrchestrator.js";
import { getPetModelConfig } from "../src/config/model-registry.js";

function makeRenderer() {
  const calls = { expr: [] as number[], motions: [] as string[] };
  const renderer: PetCoreRenderer = {
    setExpression: (i) => calls.expr.push(i),
    playMotion: (g, idx) => calls.motions.push(idx == null ? g : `${g}/${idx}`),
    playRandomMotion: () => {},
    getMotionCount: () => 0,
    setMouthOpen: () => {},
    resize: () => {},
  };
  return { renderer, calls };
}

describe("PetOrchestrator.handleTapHit —— mao_pro", () => {
  const mao = getPetModelConfig("mao_pro");

  it("头部点击 → 随机挑一个变体，恰好下发一个表情 + 一个动作", () => {
    // Problem 1 后点击反应随机化：不再断言具体索引，只保证每次点击都产出反应。
    const { renderer, calls } = makeRenderer();
    const orch = new PetOrchestrator(renderer, {
      emotionMap: mao.emotionMap,
      actionMotions: mao.actionMotions,
      tapMotions: mao.tapMotions,
      defaultExpression: mao.defaultExpression,
    });
    calls.expr.length = 0;
    calls.motions.length = 0;
    orch.handleTapHit("Head");
    expect(calls.expr).toHaveLength(1);
    expect(typeof calls.expr[0]).toBe("number");
    expect(calls.motions).toHaveLength(1);
  });

  it("身体点击 → 恰好下发一个表情 + 一个动作", () => {
    const { renderer, calls } = makeRenderer();
    const orch = new PetOrchestrator(renderer, {
      emotionMap: mao.emotionMap,
      actionMotions: mao.actionMotions,
      tapMotions: mao.tapMotions,
      defaultExpression: mao.defaultExpression,
    });
    calls.expr.length = 0;
    calls.motions.length = 0;
    orch.handleTapHit("Body");
    expect(calls.expr).toHaveLength(1);
    expect(typeof calls.expr[0]).toBe("number");
    expect(calls.motions).toHaveLength(1);
  });

  it("area 为 none / 空时忽略，不下发任何表情或动作", () => {
    const { renderer, calls } = makeRenderer();
    const orch = new PetOrchestrator(renderer, { emotionMap: mao.emotionMap });
    calls.expr.length = 0;
    calls.motions.length = 0;
    orch.handleTapHit("none");
    orch.handleTapHit("");
    expect(calls.expr).toEqual([]);
    expect(calls.motions).toEqual([]);
  });

  it("提供 tapMotions 时，头部点击候选包含 registry 指定的空组动作（歪头/index 2）", () => {
    const { renderer, calls } = makeRenderer();
    const orch = new PetOrchestrator(renderer, {
      emotionMap: mao.emotionMap,
      actionMotions: mao.actionMotions,
      tapMotions: mao.tapMotions,
      defaultExpression: mao.defaultExpression,
    });
    // 多次点击，至少有一次命中空组 index 2（renderer 记为 "/2"）
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      calls.motions.length = 0;
      orch.handleTapHit("Head");
      calls.motions.forEach((m) => seen.add(m));
    }
    expect(seen.has("/2")).toBe(true);
  });

  it("speaking 态点击只下发表情，不下发动作", () => {
    const { renderer, calls } = makeRenderer();
    const orch = new PetOrchestrator(renderer, {
      emotionMap: mao.emotionMap,
      actionMotions: mao.actionMotions,
      tapMotions: mao.tapMotions,
      defaultExpression: mao.defaultExpression,
    });
    // 进入 speaking 态：idle → thinking → tts_converting → speaking
    orch.dispatch({ type: "USER_SEND" });
    orch.dispatch({ type: "AGENT_FINAL" });
    orch.dispatch({ type: "TTS_READY" });
    calls.expr.length = 0;
    calls.motions.length = 0;
    orch.handleTapHit("Body");
    expect(calls.expr).toHaveLength(1);
    expect(calls.motions).toEqual([]);
  });
});

describe("PetOrchestrator.handleTapHit —— 候选键回退", () => {
  it("emotionMap 缺全部候选键时回退 defaultExpression；无 actionMotions 回退 Idle", () => {
    const { renderer, calls } = makeRenderer();
    // 只放一个无关键，候选链全落空 → 用 defaultExpression=7
    const orch = new PetOrchestrator(renderer, {
      emotionMap: { 无关: 99 },
      defaultExpression: 7,
    });
    calls.expr.length = 0;
    calls.motions.length = 0;
    orch.handleTapHit("Head");
    expect(calls.expr).toEqual([7]);
    expect(calls.motions).toEqual(["Idle"]);
  });

  it("英文区域名(HitAreaFace)也能命中并产出表情", () => {
    // Problem 1 后 face 归为独立区域（非头部），此处只验证英文区域名能正常触发反应。
    const { renderer, calls } = makeRenderer();
    const mao = getPetModelConfig("mao_pro");
    const orch = new PetOrchestrator(renderer, {
      emotionMap: mao.emotionMap,
      actionMotions: mao.actionMotions,
    });
    calls.expr.length = 0;
    orch.handleTapHit("HitAreaFace");
    expect(calls.expr).toHaveLength(1);
    expect(typeof calls.expr[0]).toBe("number");
  });
});

