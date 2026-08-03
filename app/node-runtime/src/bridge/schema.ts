/**
 * bridge schema — RN ↔ nodejs-mobile 通信协议类型
 *
 * 移动端宿主与 React Native 之间通过 nodejs-mobile channel 收发 JSON 消息。
 * 所有跨 bridge 消息必须有显式类型（规范 §12.1）：
 *  - MobileNodeCommand：RN → Node（用户操作 / 生命周期）
 *  - MobileNodeEvent：Node → RN（Agent 事件 / 宠物状态 / 错误）
 *
 * 单向依赖：本文件只定义类型，不引入 agent-runtime 运行时依赖，
 * 便于 RN 侧（TS）与 Node 侧共享同一份 schema。
 */

/** 系统运行/错误日志行传输格式 */
export interface SystemLogLineWire {
  readonly id: string;
  readonly at: number;
  readonly level: "info" | "warn" | "error";
  readonly message: string;
}

/** 已有创作的元信息（供 Agent 复用感知，不含 url/html 大字段） */
export interface CreationMeta {
  readonly kind: "image" | "game";
  readonly id: string;
  readonly title: string;
  readonly prompt?: string;
}

/**
 * 小主人档案（AI 对话中逐步收集，注入提示词供个性化对话）。
 * 全部字段可选、非敏感——只存偏好与基础特征，不存住址/电话/证件等隐私。
 */
export interface ChildProfile {
  readonly name?: string;
  /** 年龄（岁） */
  readonly age?: number;
  readonly gender?: "男孩" | "女孩" | "保密";
  /** 身高（厘米） */
  readonly heightCm?: number;
  /** 喜欢的颜色、事物、活动等 */
  readonly likes?: readonly string[];
  /** 不喜欢的事物 */
  readonly dislikes?: readonly string[];
  /** 性格特点（如"活泼""内向""好奇"） */
  readonly personality?: string;
  /** 学习状况（如"在学拼音""喜欢数学""刚上幼儿园"） */
  readonly learning?: string;
}

/**
 * 模型提供商配置（用户在设置页填写，直连 OpenAI / Anthropic 兼容端点）。
 * apiKey 属敏感字段：经命令 `_auth` 通道下发 Node 侧内存缓存，不进普通日志、
 * 不放 InitPayload（InitPayload 会被日志打点）。
 */
export interface ProviderConfig {
  /** 协议：openai 兼容（含本地 Ollama/LM Studio）或 anthropic messages */
  readonly protocol: "openai" | "anthropic";
  /** API 基础 URL（如 https://api.openai.com/v1） */
  readonly baseUrl: string;
  /** API Key（本地端点可留空，direct-stream 会填占位符） */
  readonly apiKey: string;
  /** 模型 ID（如 gpt-4o-mini / claude-sonnet-4-5） */
  readonly model: string;
}

/**
 * 生图提供商协议：
 *  - openai：OpenAI Images 兼容，同步返回 b64_json/url（POST {baseUrl}/images/generations）
 *  - rightcode：Right Code 异步 Images，提交带 async:true 拿 task_id，轮询站点级 /v1/tasks/{id}
 *  - gemini：Right Code Gemini generateContent 兼容，异步（POST {baseUrl}/v1beta/models/{model}:generateContent）
 * 缺省视为 openai（向后兼容旧配置）。
 */
export type ImageProviderKind = "openai" | "rightcode" | "gemini";

/**
 * 生图提供商配置（用户在设置页填写，直连上游图像端点）。
 * 缺省（未配置）时生图工具回退 gateway 兜底路径。
 */
export interface ImageProviderConfig {
  /** 协议类型；缺省 openai */
  readonly provider?: ImageProviderKind;
  /** API 基础 URL（openai 已含 /v1；rightcode/gemini 形如 https://www.rightapi.ai/draw） */
  readonly baseUrl: string;
  /** API Key */
  readonly apiKey: string;
  /** 生图模型 ID（如 dall-e-3 / gpt-image-1 / nano-banana-fast） */
  readonly model: string;
}

/** 会话初始化载荷 */
export interface InitPayload {
  /** 宠物 ID（决定人格 / 模型槽） */
  readonly petId: string;
  /** Agent 定义 ID（内置或云端同步） */
  readonly agentId: string;
  /** 儿童称呼（注入提示词，非敏感） */
  readonly childNickname?: string;
  /** 小主人档案（本地已收集的偏好与基础特征，注入提示词个性化对话） */
  readonly childProfile?: ChildProfile;
  /** Agent 名字 / 唤醒词（如「小猫姐姐」） */
  readonly petName?: string;
  /** 会话 key（本地会话标识） */
  readonly sessionKey: string;
  /** 模型用途槽覆盖（仅选择，不含凭据） */
  readonly modelTier?: string;
}

/** RN → Node 命令 */
export type MobileNodeCommand =
  | { readonly type: "ping" }
  | { readonly type: "init"; readonly payload: InitPayload }
  | {
      readonly type: "send_user_message";
      readonly payload: {
        readonly text: string;
        readonly sessionId: string;
        /** RN 侧语音会话 generation；用于作废打断后的迟到 TTS */
        readonly generationId?: number;
      };
    }
  | { readonly type: "reset_session"; readonly payload: { readonly sessionId: string } }
  | { readonly type: "abort"; readonly payload: { readonly sessionId: string } }
  | {
      // RN 侧同步"已有创作"元信息（画/游戏），供 Agent 复用感知（不含 url/html 大字段）
      readonly type: "update_creations";
      readonly payload: { readonly creations: readonly CreationMeta[] };
    }
  | {
      // 家长/孩子对确认卡片的回应（对应 confirm_request 事件）
      readonly type: "confirm_response";
      readonly payload: { readonly requestId: string; readonly approved: boolean };
    }
  | {
      // 编辑已有游戏：把原始 html + 修改指令投喂 Agent，就地更新同 gameId
      readonly type: "edit_creation";
      readonly payload: {
        readonly sessionId: string;
        readonly gameId: string;
        readonly title: string;
        readonly html: string;
        readonly instruction: string;
        readonly generationId?: number;
      };
    }
  | {
      /** 家长手动覆盖小主人档案：热更新当前会话 soul，不拆会话 */
      readonly type: "update_child_profile";
      readonly payload: { readonly childProfile: ChildProfile };
    }
  | {
      // 点击宠物身体部位时直接合成一句本地台词（不经 Agent，不落对话记录）
      readonly type: "speak_text";
      readonly payload: { readonly text: string };
    }
  | {
      // 游戏/互动页面请求朗读（如认字学拼音）。走独立通道：合成后发 game_tts_audio，
      // 不参与 generationId 门控、不驱动宠物状态机，避免污染语音会话与宠物表情。
      readonly type: "speak_text_raw";
      readonly payload: { readonly text: string; readonly requestId?: string };
    }
  | {
      readonly type: "close_playground";
      readonly payload: {
        readonly sessionId: string;
        readonly reason: "user" | "timeout";
        readonly score?: number;
      };
    }
  | {
      // 请求系统运行/错误日志（设置页「系统日志」查看/导出用）
      readonly type: "get_system_logs";
      readonly payload: { readonly maxItems?: number };
    }
  | {
      // RN 侧诊断日志上报（barge-in 决策等），写入 node SystemLogBuffer 以便应用内查看
      readonly type: "client_log";
      readonly payload: { readonly message: string };
    };

/**
 * 权限决定线格式（对齐 host-kit PermissionDecisionOutcome）。
 * MVP 不启用家长确认往返；保留此类型与 permission_request 事件供 P1 家长控制复用。
 */
export type PermissionDecisionWire = "allow-once" | "allow-always" | "deny";

/** Node → RN 事件 */
export type MobileNodeEvent =
  | { readonly type: "node_ready" }
  | { readonly type: "pong" }
  | {
      readonly type: "init_done";
      readonly payload: { readonly sessionId: string; readonly instanceId: string };
    }
  | { readonly type: "agent_delta"; readonly payload: { readonly text: string; readonly fullText: string } }
  | { readonly type: "agent_final"; readonly payload: { readonly text: string } }
  | {
      readonly type: "tts_audio";
      readonly payload: {
        /** mp3 音频的 base64（不含 data URI 前缀） */
        readonly audioBase64: string;
        /** MIME 类型（RN 侧据此写临时文件/构造 data URI） */
        readonly mimeType: string;
        /** 与 send_user_message.generationId 对齐；RN 用于丢弃打断后的迟到音频 */
        readonly generationId: number;
      };
    }
  | { readonly type: "tts_failed"; readonly payload: { readonly code?: string; readonly message?: string } }
  | {
      // 游戏/互动页面 TTS 朗读音频（speak_text_raw 的产物）。RN 侧直接播放，
      // 不过 shouldPlayTts 门控、不驱动宠物状态机。
      readonly type: "game_tts_audio";
      readonly payload: {
        readonly audioBase64: string;
        readonly mimeType: string;
        readonly requestId?: string;
      };
    }
  | { readonly type: "agent_thinking"; readonly payload: { readonly text: string } }
  | {
      readonly type: "tool_started";
      readonly payload: {
        readonly toolName: string;
        readonly toolCallId?: string;
        /** 入参摘要（脱敏截断），供聊天卡片展开展示 */
        readonly paramsSummary?: string;
      };
    }
  | {
      readonly type: "tool_finished";
      readonly payload: {
        readonly toolName: string;
        readonly toolCallId?: string;
        readonly ok: boolean;
        /** 结果摘要（脱敏截断），供聊天卡片展开展示 */
        readonly resultSummary?: string;
      };
    }
  | {
      readonly type: "permission_request";
      readonly payload: {
        readonly requestId: string;
        readonly toolName: string;
        readonly description: string;
      };
    }
  | {
      readonly type: "safety_blocked";
      readonly payload: { readonly friendlyMessage: string; readonly category: string };
    }
  | {
      readonly type: "agent_error";
      readonly payload: { readonly message: string; readonly code?: string };
    }
  // ── App Action 与动态内容事件（MVP Agent 直接控制 App） ──
  | { readonly type: "navigate"; readonly payload: { readonly target: string; readonly reason: string } }
  | { readonly type: "play_sound"; readonly payload: { readonly sound: string; readonly volume?: number } }
  | { readonly type: "show_toast"; readonly payload: { readonly text: string; readonly style?: string } }
  | { readonly type: "image_ready"; readonly payload: { readonly url: string; readonly prompt: string } }
  | {
      // AI 在对话中收集到小主人新信息，请求 RN 侧合并保存到本地档案（SecureStorage）
      readonly type: "profile_update";
      readonly payload: { readonly patch: ChildProfile };
    }
  | {
      readonly type: "playground_open";
      readonly payload: {
        readonly type: "game" | "effect" | "interactive";
        readonly title: string;
        readonly html: string;
        /** 编辑已有游戏时携带；RN 侧据此就地替换同 id 条目而非新增 */
        readonly replaceId?: string;
      };
    }
  | {
      // 请求孩子确认是否进行推荐的活动（玩游戏/画画），RN 弹大图标确认卡
      readonly type: "confirm_request";
      readonly payload: {
        readonly requestId: string;
        readonly kind: "game" | "drawing";
        readonly title: string;
      };
    }
  | {
      readonly type: "playground_close";
      readonly payload: { readonly reason: "user" | "timeout" | "complete"; readonly score?: number };
    }
  | {
      // 按 id 打开已有游戏（内置精品库或小主人历史作品）。html 在 RN 侧，
      // Node 只发 id + title，RN 从 BUILTIN_GAMES / gameHistory 取 html 打开。
      readonly type: "open_creation";
      readonly payload: { readonly id: string; readonly title: string };
    }
  | {
      // 系统日志回传（get_system_logs 的响应）：运行/错误日志行 + 累计总数
      readonly type: "system_logs_result";
      readonly payload: {
        readonly logs: readonly SystemLogLineWire[];
        readonly logTotalCount: number;
      };
    };

/** 儿童 UI 错误分类（规范 §9.1） */
export type ChildErrorCategory =
  | "auth_error"
  | "network_error"
  | "gateway_error"
  | "quota_error"
  | "tts_error"
  | "stt_error"
  | "safety_blocked"
  | "tool_denied"
  | "agent_error";
