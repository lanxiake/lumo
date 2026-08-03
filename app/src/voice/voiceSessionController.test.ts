/**
 * voiceSessionController 单测 — Phase 1/2/3 行为契约
 */

import {
  createVoiceSessionController,
  DEFAULT_ECHO_GUARD_MS,
  MAX_LEVEL_ECHO_EXTEND_MS,
  SHORTENED_POST_SPEECH_COOLDOWN_MS,
} from "./voiceSessionController";

describe("voiceSessionController", () => {
  it("shouldPlayTts：仅当前 generation 可播放", () => {
    const c = createVoiceSessionController();
    expect(c.shouldPlayTts(0)).toBe(true);
    c.bumpGeneration();
    expect(c.shouldPlayTts(0)).toBe(false);
    expect(c.shouldPlayTts(1)).toBe(true);
  });

  it("interrupt(button) 在 phone_call 下恢复聆听", () => {
    const c = createVoiceSessionController({ mode: "phone_call", petVisible: true });
    const effects = c.interrupt("button");
    expect(effects.some((e) => e.type === "stop_tts")).toBe(true);
    expect(effects.some((e) => e.type === "abort_agent")).toBe(true);
    expect(effects.some((e) => e.type === "start_listen")).toBe(true);
    expect(c.getSnapshot().phase).toBe("listening");
  });

  it("interrupt(new_utterance, resumeListen:false) 不恢复聆听", () => {
    const c = createVoiceSessionController({ mode: "phone_call", petVisible: true });
    const effects = c.interrupt("new_utterance", { resumeListen: false });
    expect(effects.some((e) => e.type === "start_listen")).toBe(false);
    expect(c.getSnapshot().phase).toBe("idle");
  });

  it("onTtsPlayStart：normal 关麦", () => {
    const c = createVoiceSessionController({ mode: "normal" });
    const effects = c.onTtsPlayStart();
    expect(effects.some((e) => e.type === "pet_tts_ready")).toBe(true);
    expect(effects.some((e) => e.type === "stop_listen")).toBe(true);
    expect(c.getSnapshot().phase).toBe("speaking");
  });

  it("onTtsPlayStart：phone_call 也关麦（半双工，防自循环）", () => {
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
    });
    const effects = c.onTtsPlayStart();
    expect(effects.some((e) => e.type === "pet_tts_ready")).toBe(true);
    expect(effects.some((e) => e.type === "stop_listen")).toBe(true);
    expect(effects.some((e) => e.type === "start_listen")).toBe(false);
    expect(c.getSnapshot().phase).toBe("speaking");
  });

  it("onTtsPlayEnd 在 phone_call 自动再听并带 MIC_START", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
    });
    c.onTtsPlayStart();
    t = 1100;
    const effects = c.onTtsPlayEnd();
    expect(effects.some((e) => e.type === "pet_audio_end")).toBe(true);
    expect(
      effects.some((e) => e.type === "start_listen" && e.dispatchMicStart === true),
    ).toBe(true);
    expect(effects.some((e) => e.type === "stop_listen")).toBe(true);
    expect(c.getSnapshot().phase).toBe("listening");
    expect(c.isInPostSpeechCooldown()).toBe(true);
  });

  it("onTtsPlayError 在 phone_call 下恢复聆听", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
    });
    c.onTtsPlayStart();
    t = 1100;
    const effects = c.onTtsPlayError();
    expect(effects.some((e) => e.type === "pet_audio_end")).toBe(true);
    expect(
      effects.some((e) => e.type === "start_listen" && e.dispatchMicStart === true),
    ).toBe(true);
    expect(effects.some((e) => e.type === "stop_listen")).toBe(true);
    expect(c.getSnapshot().phase).toBe("listening");
  });

  it("silenceForModeChange 挂断时 abort", () => {
    const c = createVoiceSessionController({ mode: "phone_call" });
    const hangup = c.silenceForModeChange({ abortAgent: true });
    expect(hangup.some((e) => e.type === "abort_agent")).toBe(true);
    expect(hangup.some((e) => e.type === "stop_listen")).toBe(true);
  });

  it("phone_call TTS 播放期间识别结果直接丢弃（半双工）", () => {
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
    });
    c.onTtsPlayStart();
    const result = c.onSpeechFinal("回声误识别", {
      sessionReady: true,
      aiReplying: true,
    });
    expect(result.userText).toBeUndefined();
    expect(result.effects).toEqual([]);
  });

  it("phone_call TTS 播放期间无法 final barge-in（半双工）", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
      echoGuardMs: 300,
    });
    c.onTtsPlayStart();
    t = 1000 + 400;
    const result = c.onSpeechFinal("等等我想说", {
      sessionReady: true,
      aiReplying: true,
    });
    expect(result.userText).toBeUndefined();
    expect(result.effects.some((e) => e.type === "stop_tts")).toBe(false);
    expect(result.effects.some((e) => e.type === "send_message")).toBe(false);
  });

  it("onPlaybackLevel 半双工下不再延长回声冷却", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
      echoGuardMs: 300,
    });
    c.onTtsPlayStart();
    // onTtsPlayStart 已将 echoGuardUntil 清为 0
    expect(c.getSnapshot().echoGuardUntil).toBe(0);
    t = 1250;
    c.onPlaybackLevel(0.5);
    expect(c.getSnapshot().echoGuardUntil).toBe(0);
  });

  it("TTS 播放期间即使文本相似也直接丢弃（半双工）", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
      echoGuardMs: 50,
    });
    c.setLastTtsText("今天天气真好呀小朋友");
    c.onTtsPlayStart();
    t = 1100;
    const result = c.onSpeechFinal("今天天气真好", {
      sessionReady: true,
      aiReplying: true,
    });
    expect(result.userText).toBeUndefined();
    expect(result.effects).toEqual([]);
  });

  it("onTextSend bump generation 并返回 send_message", () => {
    const c = createVoiceSessionController();
    const before = c.getSnapshot().generationId;
    const result = c.onTextSend("你好");
    expect(result.userText).toBe("你好");
    const send = result.effects.find((e) => e.type === "send_message");
    expect(send && send.type === "send_message" && send.generationId).toBe(before + 1);
  });

  it("phone_call TTS 播放期间 partial 结果直接丢弃（半双工）", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
      echoGuardMs: 300,
    });
    c.setLastTtsText("今天天气真好呀小朋友");
    c.onTtsPlayStart();
    t = 1000 + 400;
    const result = c.onSpeechPartial("等等我想说", { sessionReady: true, aiReplying: true });
    expect(result.effects).toEqual([]);
  });


  it("onPlaybackFinished 缩短 phone_call 播后冷却", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
    });
    c.onTtsPlayEnd();
    const until = c.getSnapshot().postSpeechCooldownUntil;
    t = 1100; // 剩余冷却 > SHORTENED，可缩短
    c.onPlaybackFinished();
    expect(c.getSnapshot().postSpeechCooldownUntil).toBe(t + SHORTENED_POST_SPEECH_COOLDOWN_MS);
    // 再次调用不再缩短
    const before = c.getSnapshot().postSpeechCooldownUntil;
    c.onPlaybackFinished();
    expect(c.getSnapshot().postSpeechCooldownUntil).toBe(before);
  });

  it("phone_call 播后冷却内丢弃并续听", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
    });
    c.onTtsPlayEnd();
    t = 1100; // 仍在 1200ms 冷却内
    const result = c.onSpeechFinal("尾声回声", { sessionReady: true, aiReplying: false });
    expect(result.ignoredAsEcho).toBe(true);
    expect(result.userText).toBeUndefined();
    expect(result.effects).toEqual([{ type: "start_listen", dispatchMicStart: false }]);
  });

  it("phone_call barge-in 在打断冷却内被忽略", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
      echoGuardMs: 50,
    });
    c.onSpeechFinal("第一次打断", { sessionReady: true, aiReplying: true });
    t = 1100; // 在 INTERRUPT_COOLDOWN_MS 内
    const result = c.onSpeechFinal("第二次打断", { sessionReady: true, aiReplying: true });
    expect(result.ignoredAsEcho).toBe(true);
    expect(result.userText).toBeUndefined();
  });

  it("phone_call barge-in 语音段过短被忽略", () => {
    let t = 1000;
    const c = createVoiceSessionController({
      mode: "phone_call",
      petVisible: true,
      now: () => t,
      echoGuardMs: 50,
    });
    c.onSpeechStarted();
    t = 1100; // 语音段 100ms，短于 300ms 阈值
    const result = c.onSpeechFinal("短噪声", { sessionReady: true, aiReplying: true });
    expect(result.ignoredAsEcho).toBe(true);
    expect(result.userText).toBeUndefined();
  });

  describe("手动麦克风开关（phone_call）", () => {
    it("muteMic 停麦并标记静音", () => {
      const c = createVoiceSessionController({ mode: "phone_call", petVisible: true });
      c.beginPhoneCallListening();
      const effects = c.muteMic();
      expect(effects.some((e) => e.type === "stop_listen")).toBe(true);
      expect(effects.some((e) => e.type === "pet_mic_stop")).toBe(true);
      expect(c.isMicMuted()).toBe(true);
      expect(c.getSnapshot().phase).toBe("idle");
    });

    it("unmuteMic 恢复聆听", () => {
      const c = createVoiceSessionController({ mode: "phone_call", petVisible: true });
      c.beginPhoneCallListening();
      c.muteMic();
      const effects = c.unmuteMic();
      expect(effects.some((e) => e.type === "start_listen" && e.dispatchMicStart === true)).toBe(true);
      expect(c.isMicMuted()).toBe(false);
      expect(c.getSnapshot().phase).toBe("listening");
    });

    it("静音时 TTS 结束不自动续听", () => {
      let t = 1000;
      const c = createVoiceSessionController({ mode: "phone_call", petVisible: true, now: () => t });
      c.beginPhoneCallListening();
      c.muteMic();
      c.onTtsPlayStart();
      t = 1100;
      const effects = c.onTtsPlayEnd();
      expect(effects.some((e) => e.type === "start_listen")).toBe(false);
      expect(c.getSnapshot().phase).toBe("idle");
    });

    it("beginPhoneCallListening 重置静音状态", () => {
      const c = createVoiceSessionController({ mode: "phone_call", petVisible: true });
      c.beginPhoneCallListening();
      c.muteMic();
      expect(c.isMicMuted()).toBe(true);
      c.beginPhoneCallListening();
      expect(c.isMicMuted()).toBe(false);
    });
  });

  describe("全双工（duplexEnabled，阶段二 AEC 可用时）", () => {
    it("onTtsPlayStart 不关麦", () => {
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
      });
      const effects = c.onTtsPlayStart();
      expect(effects.some((e) => e.type === "pet_tts_ready")).toBe(true);
      expect(effects.some((e) => e.type === "stop_listen")).toBe(false);
      expect(c.getSnapshot().phase).toBe("speaking");
    });

    it("speaking 期 final 视为 barge-in（不再半双工丢弃）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000; // 越过 echoGuard/冷却窗口
      const result = c.onSpeechFinal("等等我想说", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(result.userText).toBe("等等我想说");
      expect(result.effects.some((e) => e.type === "stop_tts")).toBe(true);
      expect(result.effects.some((e) => e.type === "send_message")).toBe(true);
    });

    it("speaking 期 partial 二次确认后 barge-in，且立即恢复聆听", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      const arm = c.onSpeechPartial("我想插话进来说点什么", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(arm.effects).toEqual([]);
      expect(c.getSnapshot().phase).toBe("speaking");

      t += 250;
      const result = c.onSpeechPartial("我想插话进来说点什么呀", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(result.effects.some((e) => e.type === "stop_tts")).toBe(true);
      expect(
        result.effects.some((e) => e.type === "start_listen" && e.dispatchMicStart === true),
      ).toBe(true);
      expect(c.getSnapshot().phase).toBe("listening");
    });

    it("speaking 期 partial 不足 3 汉字不打断（含 2 字）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      expect(c.onSpeechPartial("好", { sessionReady: true, aiReplying: true }).effects).toEqual([]);
      expect(c.onSpeechPartial("等等", { sessionReady: true, aiReplying: true }).effects).toEqual([]);
      expect(c.getSnapshot().phase).toBe("speaking");
    });

    it("speaking 期 partial 首次合格只武装、未满确认窗不打断", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      const arm = c.onSpeechPartial("我想说话", { sessionReady: true, aiReplying: true });
      expect(arm.effects).toEqual([]);
      t += 100; // < 250ms
      const hold = c.onSpeechPartial("我想说话呀", { sessionReady: true, aiReplying: true });
      expect(hold.effects).toEqual([]);
      expect(c.getSnapshot().phase).toBe("speaking");
    });

    it("speaking 期 mic 低于地板不打断（能量地板门）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      c.onMicLevel(0.02); // 低于 BARGE_IN_MIN_MIC_LEVEL(0.025)，视为静默
      c.onPlaybackLevel(0.4);
      const result = c.onSpeechPartial("我想插话进来说点什么", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(result.effects).toEqual([]);
      expect(c.getSnapshot().phase).toBe("speaking");
    });

    it("speaking 期能量足够 + 非回声 + 确认后可打断（方案 B）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.setLastTtsText("今天天气真好呀小朋友我们一起玩吧");
      c.onTtsPlayStart();
      t = 1000 + 2000;
      c.onMicLevel(0.55);
      c.onPlaybackLevel(0.2);
      c.onSpeechPartial("打断你现在立刻停下", { sessionReady: true, aiReplying: true });
      t += 250;
      const result = c.onSpeechPartial("打断你现在立刻停下来听我说", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(result.effects.some((e) => e.type === "stop_tts")).toBe(true);
    });

    it("多条 TTS 快连：回声匹配较早那条（被新句覆盖）仍应拒为回声", () => {
      // 复现 bug：agent_final 连发覆盖 lastTtsText，但音频排队顺序播放，
      // 扬声器此刻仍在播较早那条，回声 partial 匹配旧文本却被漏判触发自打断。
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.setLastTtsText("我找到啦咱们还没有警察抓小偷的游戏我现在就帮你做一个");
      c.setLastTtsText("做好啦警察抓小偷的游戏正在路上马上就来找你玩啦"); // 覆盖 lastTtsText
      c.onTtsPlayStart();
      t = 1000 + 2000; // 过 echoGuard
      c.onMicLevel(0.09); // 过地板
      // 回声 partial 高度相似「较早那条」，应被逐条比对拒为回声（不武装、不打断）
      const arm = c.onSpeechPartial("我找到了咱们还没有警察抓小偷的游戏我现在就帮你做", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(arm.effects).toEqual([]);
      t += 300;
      const next = c.onSpeechPartial("我找到了咱们还没有警察抓小偷的游戏我现在就帮你做一", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(next.effects.some((e) => e.type === "stop_tts")).toBe(false);
    });

    it("mic 过地板 + 干净有效文本：首帧武装（回声区分交给文本门，不再比播放峰值）", () => {
      // 设计变更（2026-07-24）：带 AEC 设备上 mic 被压到与 play 不同量级，能量比失效，
      // 已改为能量地板门。干净有效文本在过地板后应「武装」（返回 []，等二次确认），
      // 而非被能量比挡死——这是「人声大了却打不断」的根因修复。
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      c.onMicLevel(0.19); // 过地板(0.025)
      c.onPlaybackLevel(0.71); // 播放很响也不再影响门控
      const arm = c.onSpeechPartial("我想插一句话进来说说看", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(arm.effects).toEqual([]); // 仅武装，未满确认窗
      // 满确认窗后同一有效文本应真正打断
      t += 300;
      const trigger = c.onSpeechPartial("我想插一句话进来说说看啊", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(trigger.effects.some((e) => e.type === "stop_tts")).toBe(true);
    });

    it("跨语种回声（重复串）靠 hasHeavyRepetition 挡住，无需比对 TTS 文本", () => {
      // 粤语 TTS，普通话 ASR 转出重复串；不设置 lastTtsText 也应被挡
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      // 能量放行（模拟 play=0 时刻），但文本是重度重复回声
      c.onMicLevel(0.19);
      c.onPlaybackLevel(0.0);
      const result = c.onSpeechPartial("嘿嘿嘿嘿姐姐姐姐姐姐在这里讲该改改改", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(result.effects).toEqual([]);
      expect(c.getSnapshot().phase).toBe("speaking");
    });

    it("speaking 期 partial 真机回声串不打断（哇你好… / 嗯小佳佳…）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.setLastTtsText("你好呀小佳佳小猫姐姐听到你啦你的声音好清楚呢今天想跟我聊什么呢");
      c.onTtsPlayStart();
      t = 1000 + 2000;
      // mic 虽过地板，但文本是明显叠字回声：文本门控挡
      c.onMicLevel(0.08);
      c.onPlaybackLevel(0.35);
      expect(
        c.onSpeechPartial("哇你好你好呀你好你好呀你是小", {
          sessionReady: true,
          aiReplying: true,
        }).effects,
      ).toEqual([]);
      // 能量更大但文本仍是明显叠字回声：文本门控挡
      c.onMicLevel(0.6);
      c.onPlaybackLevel(0.2);
      expect(
        c.onSpeechPartial("哇你好你好呀你好你好呀", {
          sessionReady: true,
          aiReplying: true,
        }).effects,
      ).toEqual([]);
      expect(c.getSnapshot().phase).toBe("speaking");
    });

    it("speaking 期 partial 叠字回声不打断（你好你好呀）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.setLastTtsText("你好呀小佳佳小猫姐姐听到你啦你的声音好清楚呢");
      c.onTtsPlayStart();
      t = 1000 + 2000;
      expect(c.onSpeechPartial("你好", { sessionReady: true, aiReplying: true }).effects).toEqual([]);
      const stacked = c.onSpeechPartial("你好你好呀", { sessionReady: true, aiReplying: true });
      expect(stacked.effects).toEqual([]);
      expect(c.getSnapshot().phase).toBe("speaking");
    });

    it("final 叠字/整句回声不发消息（即使已误触发过 barge-in）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.setLastTtsText("你好呀可以听到我的声音吗今天想聊什么呢");
      c.onTtsPlayStart();
      t = 1000 + 2000;
      // 人为模拟：若旧逻辑误打断，lastTtsText 在 barge_in 后仍保留
      c.interrupt("barge_in", { resumeListen: true });
      t += 100;
      const final = c.onSpeechFinal("你好呀可以听到我的声音吗", {
        sessionReady: true,
        aiReplying: false,
      });
      expect(final.userText).toBeUndefined();
      expect(final.ignoredAsEcho).toBe(true);
      expect(final.effects.some((e) => e.type === "send_message")).toBe(false);
    });

    it("AI 回复中 final 单字短答不打断也不发消息（少误打断优先）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      c.onSpeechStarted();
      t += 500; // 超过时长门控
      const result = c.onSpeechFinal("好", { sessionReady: true, aiReplying: true });
      expect(result.userText).toBeUndefined();
      expect(result.effects.some((e) => e.type === "stop_tts")).toBe(false);
      expect(result.effects.some((e) => e.type === "send_message")).toBe(false);
      expect(result.ignoredAsEcho).toBe(true);
    });

    it("聆听态 final 单字短答仍可发消息（非打断路径）", () => {
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
      });
      c.beginPhoneCallListening();
      const result = c.onSpeechFinal("好", { sessionReady: true, aiReplying: false });
      expect(result.userText).toBe("好");
      expect(result.effects.some((e) => e.type === "send_message")).toBe(true);
    });

    it("setDuplexEnabled 可在运行期切换（AEC 探测异步返回后生效）", () => {
      const c = createVoiceSessionController({ mode: "phone_call", petVisible: true });
      // 默认半双工
      let effects = c.onTtsPlayStart();
      expect(effects.some((e) => e.type === "stop_listen")).toBe(true);
      c.onTtsPlayEnd();

      c.setDuplexEnabled(true);
      effects = c.onTtsPlayStart();
      expect(effects.some((e) => e.type === "stop_listen")).toBe(false);
    });

    it("partial 触发 barge-in 后，同段语音连续多次 partial 不应重复 interrupt（否则反复停麦导致长时间无法识别）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      c.onSpeechPartial("我想插话进来说点什么", { sessionReady: true, aiReplying: true });
      t += 250;
      const first = c.onSpeechPartial("我想插话进来说点什么呀", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(first.effects.some((e) => e.type === "stop_tts")).toBe(true);

      // 同一段语音继续更新 partial：不应再次 interrupt（无 stop_tts/abort_agent）
      t += 100;
      const second = c.onSpeechPartial("我想插话进来说点什么呀呀", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(second.effects).toEqual([]);
    });

    it("partial 已触发 barge-in 后，本段语音的 final 不应被打断冷却误判为回声丢弃（否则永远发不出消息）", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      c.onSpeechPartial("我想插话进来说点什么", { sessionReady: true, aiReplying: true });
      t += 250;
      const partial = c.onSpeechPartial("我想插话进来说点什么呀", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(partial.effects.some((e) => e.type === "stop_tts")).toBe(true);

      // final 紧跟在 partial 触发的 interrupt 之后到达（真实设备上典型间隔 <700ms 打断冷却窗）
      t += 200;
      const final = c.onSpeechFinal("我想插话进来说点什么呀", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(final.userText).toBe("我想插话进来说点什么呀");
      expect(final.ignoredAsEcho).toBeUndefined();
      expect(final.effects.some((e) => e.type === "send_message")).toBe(true);
    });

    it("onSpeechStarted 开始新一段语音时重置 barge-in 触发标记与武装", () => {
      let t = 1000;
      const c = createVoiceSessionController({
        mode: "phone_call",
        petVisible: true,
        duplexEnabled: true,
        now: () => t,
        echoGuardMs: 300,
      });
      c.onTtsPlayStart();
      t = 1000 + 2000;
      c.onSpeechPartial("我想插话进来说点什么", { sessionReady: true, aiReplying: true });
      t += 250;
      c.onSpeechPartial("我想插话进来说点什么呀", { sessionReady: true, aiReplying: true });

      // 新一段语音开始（VAD 检测到新起点）
      c.onSpeechStarted();
      t += 2000; // 越过打断冷却窗，允许新一轮独立判定
      const arm = c.onSpeechPartial("这是完全不同的第二句话内容", {
        sessionReady: true,
        aiReplying: true,
      });
      // 新段先武装，不立刻 interrupt
      expect(arm.effects).toEqual([]);
      t += 250;
      const nextPartial = c.onSpeechPartial("这是完全不同的第二句话内容更多", {
        sessionReady: true,
        aiReplying: true,
      });
      expect(nextPartial.effects.some((e) => e.type === "stop_tts")).toBe(true);
    });
  });

  describe("onTurnEndedWithoutAudio（连续对话无音频兜底重听）", () => {
    it("phone_call 下无音频结束 → stop_listen + start_listen 重开麦", () => {
      const c = createVoiceSessionController({ mode: "phone_call", petVisible: true });
      const effects = c.onTurnEndedWithoutAudio();
      expect(effects.some((e) => e.type === "start_listen")).toBe(true);
      expect(effects.some((e) => e.type === "stop_listen")).toBe(true);
      expect(c.getSnapshot().phase).toBe("listening");
    });

    it("normal 模式下不自动重听（仅回 idle）", () => {
      const c = createVoiceSessionController({ mode: "normal", petVisible: true });
      const effects = c.onTurnEndedWithoutAudio();
      expect(effects.some((e) => e.type === "start_listen")).toBe(false);
      expect(c.getSnapshot().phase).toBe("idle");
    });

    it("宠物不可见时不重听", () => {
      const c = createVoiceSessionController({ mode: "phone_call", petVisible: false });
      const effects = c.onTurnEndedWithoutAudio();
      expect(effects.some((e) => e.type === "start_listen")).toBe(false);
    });

    it("正在 speaking 时幂等不打架（返回空）", () => {
      const c = createVoiceSessionController({ mode: "phone_call", petVisible: true });
      c.onTtsPlayStart(); // phase → speaking
      const effects = c.onTurnEndedWithoutAudio();
      expect(effects).toEqual([]);
      expect(c.getSnapshot().phase).toBe("speaking");
    });
  });
});
