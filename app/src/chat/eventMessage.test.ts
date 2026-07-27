import {
  encodeEventMessage,
  decodeEventMessage,
  eventCardLabel,
  toolLabelFor,
  type ChatEventPayload,
} from "./eventMessage";

describe("eventMessage encode/decode", () => {
  it("image_ready 带 url 往返", () => {
    const p: ChatEventPayload = { kind: "image_ready", prompt: "小猫", url: "data:image/png;base64,AA" };
    expect(decodeEventMessage(encodeEventMessage(p))).toEqual(p);
  });

  it("playground_open 带 gameId 往返", () => {
    const p: ChatEventPayload = { kind: "playground_open", title: "泡泡", gameId: "game-1" };
    expect(decodeEventMessage(encodeEventMessage(p))).toEqual(p);
  });

  it("tool_activity 往返", () => {
    const p: ChatEventPayload = {
      kind: "tool_activity",
      toolName: "image_generate",
      toolLabel: "画画",
      status: "done",
      ok: true,
      toolCallId: "tc-1",
    };
    expect(decodeEventMessage(encodeEventMessage(p))).toEqual(p);
  });

  it("非法 kind / 坏 JSON 返回 null", () => {
    expect(decodeEventMessage('{"kind":"unknown"}')).toBeNull();
    expect(decodeEventMessage("not json")).toBeNull();
  });
});

describe("toolLabelFor", () => {
  it("已知工具映射中文", () => {
    expect(toolLabelFor("image_generate")).toBe("画画");
    expect(toolLabelFor("create_web_playground")).toBe("做小游戏");
    expect(toolLabelFor("web_search")).toBe("查资料");
  });
  it("未知工具回退为原始工具名", () => {
    expect(toolLabelFor("something_else")).toBe("something_else");
  });
});

describe("eventCardLabel", () => {
  it("tool_activity 显示工具名与开始/结束状态", () => {
    expect(
      eventCardLabel({
        kind: "tool_activity",
        toolName: "create_web_playground",
        toolLabel: "做小游戏",
        status: "start",
      }),
    ).toBe("🔧 开始 · create_web_playground（做小游戏）");
    expect(
      eventCardLabel({
        kind: "tool_activity",
        toolName: "create_web_playground",
        toolLabel: "做小游戏",
        status: "done",
        ok: true,
      }),
    ).toBe("✅ 完成 · create_web_playground（做小游戏）");
    expect(
      eventCardLabel({
        kind: "tool_activity",
        toolName: "web_search",
        toolLabel: "查资料",
        status: "done",
        ok: false,
      }),
    ).toBe("😅 失败 · web_search（查资料）");
  });
});
