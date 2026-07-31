# Lumo 2D 精灵养成学习游戏 — 需求冻结版

**版本**：1.0（冻结）  
**冻结日期**：2026-07-29  
**状态**：已冻结，作为详细设计与 MVP 实现依据  
**详细设计**：见同目录 `2026-07-29-sprite-nurture-game-design.md`  
**讨论历程**：v0.1 → v0.2 → v0.3（见 git / 历史稿可对照）

---

## 1. 产品一句话

在 Lumo（RN + 端上 Agent）上，将 Live2D 主体验替换为 **Shimeji 精灵养成**：App 内 **单场景单主线** 跑通「养 + 学」，并支持 Android **透明悬浮桌面宠**；动态关卡仍可由 Agent 补充，但不阻塞主线。

## 2. 已冻结决策

| ID | 决策 |
|----|------|
| D1 | 精灵资产与切帧约定复用 `AI-desktop-pets`（KidsPet） |
| D2 | MVP 三角色：`shimeji_caneko`（四足猫）、`klee`（人类）、`gengar_shimeji`（异型） |
| D3 | **纳入** Android 透明无背景悬浮窗（同时仅 1 只） |
| D4 | 唯一场景「温馨小屋」+ 唯一主线「第一次照顾伙伴」 |
| D5 | 主线强制：必须先完成喂食，才能进书桌学习 |
| D6 | 主线内置小游戏题材：数一数 / 点点看（离线可通关） |
| D7 | `hunger` 语义与 KidsPet 一致：**越高越饿**；喂食使 hunger↓ |
| D8 | 学习失败 **不扣** 心情 |
| D9 | MVP **不做** 离线衰减、多场景、悬浮多实例、完整爬墙物理、iOS 悬浮 |
| D10 | Agent 养成工具（`get_pet_care_state` 等）为 P1，可后置于主线闭环之后 |

## 3. MVP Done 标准（摘要）

1. 三角色可切换；家园 STAND/GREET（及 SIT/WALK）正常。  
2. 主线 `intro → first_feed → first_study → celebrate → desktop_hint|skip → completed` 可跑通。  
3. 喂食与学习通关数值落盘。  
4. 悬浮窗：授权后透明显示、拖拽、单击 GREET、回 App。  
5. Agent 对话与自由 playground 可用且不破坏主线。  
6. Android 可演示。

## 4. 范围边界

| 做 | 不做 |
|----|------|
| 家园 WebView+Pixi 精灵 | Live2D 主路径 |
| 原生 Overlay 悬浮 | iOS 悬浮 / 多宠 |
| 1 场景 1 主线 + 1 内置关 | 第二场景/第二主线 |
| 3 个代表角色 | 全量 30+ 迁移 |
| 自由 Agent 小游戏 | 主线依赖生成 |

完整功能条目、验收用例、风险见详细设计文档 §12～§14；历史讨论细节见 v0.3 稿结构已并入设计文。
