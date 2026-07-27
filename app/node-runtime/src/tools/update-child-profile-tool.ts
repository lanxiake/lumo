/**
 * update-child-profile-tool — AI 在对话中静默收集小主人信息
 *
 * 当孩子在聊天中透露自己的名字/年龄/喜好/性格/学习状况等，AI 调用本工具把
 * 增量信息记下来。Node 侧只做校验与事件转发，实际持久化由 RN 侧 SecureStorage
 * 完成（emit profile_update）。仅存非敏感偏好特征——不收住址/电话/证件等隐私。
 */

import { Type, type Static } from "@sinclair/typebox";
import type { MtBotToolConfig, AgentToolResult, ToolExecutionContext } from "@lumo/agent-runtime";
import type { MobileToolExecutionContext } from "../host/mobile-tool-context.js";
import type { ChildProfile, MobileNodeEvent } from "../bridge/schema.js";

const UpdateChildProfileParams = Type.Object({
  name: Type.Optional(Type.String({ description: "小主人的名字或称呼" })),
  age: Type.Optional(Type.Number({ minimum: 1, maximum: 18, description: "年龄（岁）" })),
  gender: Type.Optional(
    Type.Union([Type.Literal("男孩"), Type.Literal("女孩"), Type.Literal("保密")], {
      description: "性别",
    }),
  ),
  heightCm: Type.Optional(Type.Number({ minimum: 30, maximum: 200, description: "身高（厘米）" })),
  likes: Type.Optional(
    Type.Array(Type.String(), { description: "喜欢的颜色/事物/活动，只传本次新了解到的" }),
  ),
  dislikes: Type.Optional(
    Type.Array(Type.String(), { description: "不喜欢的事物，只传本次新了解到的" }),
  ),
  personality: Type.Optional(Type.String({ description: "性格特点，如'活泼''好奇'" })),
  learning: Type.Optional(Type.String({ description: "学习状况，如'在学拼音''喜欢数学'" })),
});

type UpdateChildProfileInput = Static<typeof UpdateChildProfileParams>;

export const updateChildProfileToolConfig: MtBotToolConfig<typeof UpdateChildProfileParams> = {
  name: "update_child_profile",
  label: "记住小主人的信息",
  description:
    "当你在聊天中了解到小主人的名字、年龄、性别、身高、喜欢/不喜欢的东西、性格或学习状况时，" +
    "调用这个工具把新了解到的信息悄悄记下来（不要打断对话、不用告诉孩子你在记）。" +
    "只传本次【新了解到】的字段，不用重复已知信息。likes/dislikes 只传新增项。" +
    "严禁记录住址、电话、身份证、学校班级、家长信息等隐私——孩子说了也不要记。",
  parameters: UpdateChildProfileParams,
  category: "channel",
  isReadOnly: true,
  needsPermission: false,
  execute: async (
    _toolCallId: string,
    params: UpdateChildProfileInput,
    context: ToolExecutionContext,
  ): Promise<AgentToolResult<{ ok: boolean }>> => {
    // 只挑出有值的字段作为增量 patch（RN 侧负责与已存档案合并）
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      patch[k] = v;
    }
    if (Object.keys(patch).length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, note: "empty" }) }],
        details: { ok: true },
      };
    }
    const event: MobileNodeEvent = {
      type: "profile_update",
      payload: { patch: patch as ChildProfile },
    };
    (context as MobileToolExecutionContext).emit(event);
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      details: { ok: true },
    };
  },
};
