<!-- 语言 / Language: [English](./README.md) | 简体中文 -->

# Lumo

一个开源的 **儿童 AI 虚拟伙伴** —— 一个会聊天、会教学、会陪玩的屏幕角色。
Lumo 通过自然对话，帮孩子探索 **无代码编程、音乐、数据、语言、游戏和绘画**。

- **自带模型（BYO）** —— 在 App 内配置任意兼容 OpenAI 或 Anthropic 协议的服务商。
  你的 API Key **只保存在设备本机**，直连你配置的服务商。没有 Lumo 后端、没有中转
  服务器、无需账号。
- **独立运行** —— AI Agent 跑在设备内嵌的 Node.js 运行时（`nodejs-mobile`）里。
  无需登录、无需注册、不依赖云端。
- **内置语音** —— 设备端语音识别（sherpa-onnx）+ 在线语音合成（TTS）。
- **Android & iOS** —— 基于 React Native 构建。

> Lumo 脱胎于一个内部项目，被重构为一个专注、自包含的学习伙伴。"宠物"角色只是它的
> 外表 —— 内核是一位能干的老师和玩伴。

## 工作原理

```
┌─────────────────────────────┐
│  React Native App（界面）    │
│  ├─ Live2D 角色              │
│  ├─ 语音（设备端 ASR）        │
│  └─ 设置：模型提供商           │
└──────────────┬──────────────┘
               │  RN ⇄ Node 桥接
┌──────────────┴──────────────┐
│  内嵌 Node.js 运行时          │
│  └─ AI Agent  ──────────────►│  你的 OpenAI / Anthropic 端点
└─────────────────────────────┘
```

App 内置的 AI Agent **运行在设备内部**。当你在设置里配置了模型提供商，Agent 会用你的
Key 直接流式访问该端点。全程不经过任何 Lumo 服务器。

## 仓库结构

| 路径                      | 说明                                             |
| ------------------------- | ------------------------------------------------ |
| `app/`                    | React Native App（Android + iOS）                |
| `app/node-runtime/`       | 设备端 Node.js Agent 宿主 + RN 桥接              |
| `packages/core/`          | 角色渲染、状态机、情绪/口型同步                  |
| `packages/agent-runtime/` | Agent 循环、工具、上下文压缩、模型流式           |
| `packages/protocol/`      | 共享的消息/schema 契约                           |

## 快速开始

需要 Node.js >= 18 和 [pnpm](https://pnpm.io) 9。

```bash
pnpm install

# 下载设备端语音识别模型
pnpm setup:sherpa

# 运行
pnpm android    # Android
pnpm ios        # iOS（需 macOS + Xcode）
```

然后在 App 内打开 **设置 → 模型提供商**，填写服务商信息（协议、Base URL、API Key、
模型名），即可开始对话。

### 可选：联网搜索

Lumo 可接入自托管的 [SearXNG](https://docs.searxng.org/) 实现 `web_search` /
`web_fetch`。设置 `SEARXNG_BASE_URL`（见 `.env.example`）。留空则禁用联网搜索。

## 开发

```bash
pnpm typecheck   # 类型检查所有包
pnpm test        # 运行单元测试
```

## 隐私

Lumo 为儿童设计。它**不收集任何数据**，也没有后端。除了直连你配置的模型提供商这一次
调用之外，对话内容不会离开设备。详情见各包内说明。

## 许可证

[MIT](./LICENSE)
