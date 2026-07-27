// 契约回归：验证 pet-core 的 9 态状态机满足 kids-mobile 原 8 态语义（recognizing 为新增超集态）。
// 自研 petStateMachine.ts 已删除，改由 @lumo/core 提供 petTransition。
import { describe, it, expect } from "vitest";
import {
  initialPetState,
  petTransition,
  type PetState,
  type PetEvent,
} from "@lumo/core";

function walk(events: PetEvent[], from: PetState = initialPetState): PetState {
  return events.reduce((s, e) => petTransition(s, e), from);
}

describe("petStateMachine — 黄金路径（规范 §7.2）", () => {
  it("初始状态为 idle", () => {
    expect(initialPetState).toBe("idle");
  });

  it("文本输入：idle → thinking → tts_converting → speaking → idle", () => {
    expect(petTransition("idle", { type: "USER_SEND" })).toBe("thinking");
    expect(petTransition("thinking", { type: "AGENT_FINAL" })).toBe("tts_converting");
    expect(petTransition("tts_converting", { type: "TTS_READY" })).toBe("speaking");
    expect(petTransition("speaking", { type: "AUDIO_END" })).toBe("idle");
  });

  it("完整黄金链路一次跑通", () => {
    const end = walk([
      { type: "USER_SEND" },
      { type: "AGENT_DELTA" },
      { type: "AGENT_FINAL" },
      { type: "TTS_READY" },
      { type: "AUDIO_END" },
    ]);
    expect(end).toBe("idle");
  });

  it("thinking 期间 AGENT_DELTA 停留在 thinking", () => {
    expect(petTransition("thinking", { type: "AGENT_DELTA" })).toBe("thinking");
  });
});

describe("petStateMachine — 语音输入路径", () => {
  it("idle → listening → thinking", () => {
    expect(petTransition("idle", { type: "MIC_START" })).toBe("listening");
    expect(petTransition("listening", { type: "MIC_STOP" })).toBe("thinking");
  });

  it("listening 取消回 idle", () => {
    expect(petTransition("listening", { type: "MIC_CANCEL" })).toBe("idle");
  });
});

describe("petStateMachine — 安全与异常路径", () => {
  it("thinking 命中安全拦截 → safety_blocked，ACK 后回 idle", () => {
    expect(petTransition("thinking", { type: "SAFETY_BLOCKED" })).toBe("safety_blocked");
    expect(petTransition("safety_blocked", { type: "ACK" })).toBe("idle");
  });

  it("网络错误从任意活跃态进入 network_error", () => {
    expect(petTransition("thinking", { type: "NETWORK_ERROR" })).toBe("network_error");
    expect(petTransition("tts_converting", { type: "NETWORK_ERROR" })).toBe("network_error");
    expect(petTransition("network_error", { type: "RETRY" })).toBe("idle");
  });

  it("TTS 失败不阻塞：tts_converting → idle（文本已展示，错误另行提示）", () => {
    expect(petTransition("tts_converting", { type: "TTS_FAILED" })).toBe("idle");
  });

  it("离线降级：OFFLINE → offline_fallback，ONLINE → idle", () => {
    expect(petTransition("idle", { type: "OFFLINE" })).toBe("offline_fallback");
    expect(petTransition("offline_fallback", { type: "ONLINE" })).toBe("idle");
  });
});

describe("petStateMachine — 全局与健壮性", () => {
  it("RESET 从任意状态回 idle", () => {
    const states: PetState[] = [
      "idle",
      "listening",
      "thinking",
      "tts_converting",
      "speaking",
      "safety_blocked",
      "offline_fallback",
      "network_error",
    ];
    for (const s of states) {
      expect(petTransition(s, { type: "RESET" })).toBe("idle");
    }
  });

  it("ABORT 从活跃态回 idle", () => {
    expect(petTransition("thinking", { type: "ABORT" })).toBe("idle");
    expect(petTransition("tts_converting", { type: "ABORT" })).toBe("idle");
    expect(petTransition("speaking", { type: "ABORT" })).toBe("idle");
  });

  it("非法事件被忽略，状态不变（纯函数无副作用）", () => {
    expect(petTransition("idle", { type: "AUDIO_END" })).toBe("idle");
    expect(petTransition("speaking", { type: "USER_SEND" })).toBe("speaking");
    expect(petTransition("idle", { type: "TTS_READY" })).toBe("idle");
  });
});
