# Lumo 2D 精灵养成学习游戏 — 详细设计方案

**版本**：1.0  
**日期**：2026-07-29  
**状态**：待评审（对应需求冻结版 1.0）  
**需求依据**：`2026-07-29-sprite-nurture-game-requirements.md`  
**资源参考**：`D:\my-project\AI-desktop-pets`（KidsPet）

---

## 目录

1. [引言](#1-引言)  
2. [术语与缩写](#2-术语与缩写)  
3. [总体架构](#3-总体架构)  
4. [模块划分与目录规划](#4-模块划分与目录规划)  
5. [数据模型与持久化](#5-数据模型与持久化)  
6. [养成与主线状态机](#6-养成与主线状态机)  
7. [精灵系统（Shimeji）](#7-精灵系统shimeji)  
8. [家园场景（形态 A）](#8-家园场景形态-a) — **主界面详设**见 `2026-07-29-home-scene-ui-design.md`  
9. [悬浮窗（形态 B）](#9-悬浮窗形态-b)  
10. [主线学习关卡](#10-主线学习关卡)  
11. [Agent 与对话集成](#11-agent-与对话集成)  
12. [关键时序](#12-关键时序)  
13. [实现工作包与里程碑](#13-实现工作包与里程碑)  
14. [测试与验收](#14-测试与验收)  
15. [风险、版权与后续](#15-风险版权与后续)  
16. [附录](#16-附录)

---

## 1. 引言

### 1.1 目的

本文给出 MVP 的**可实施级**设计：模块边界、数据结构、状态机、原生桥接协议、UI 信息架构、资源迁移清单与验收标准，供评审后直接拆任务开发。

### 1.2 范围

| 包含 | 不包含 |
|------|--------|
| 三角色精灵迁移与渲染 | Live2D 主路径维护 |
| 温馨小屋 + 主线状态机 | 第二场景 / 多主线 |
| Android 透明悬浮窗（单实例） | iOS 悬浮、多悬浮实例、完整爬墙物理 |
| 内置「数一数」主线关 | Agent 生成关作为主线前置 |
| Care / Quest 持久化 | 离线衰减（Phase 2） |

### 1.3 设计原则

1. **双形态、单内核**：家园与悬浮共享 `CareState`、`MainQuestState`、`SpriteConfig`、当前 `petId`。  
2. **事件结算、禁止直写数值**：UI / Agent / 原生仅提交 `CareEvent`，由纯函数 reducer 产出新状态。  
3. **主线可单测**：quest reducer 与 care reducer 零 RN 依赖，放在 `@lumo/core`。  
4. **主线离线可通**：不依赖模型 Key；Agent 为增值。  
5. **参考不照搬框架**：复用 KidsPet 的精灵约定与悬浮权限/窗口思路；不引入 Compose/Hilt 到 RN 工程。

---

## 2. 术语与缩写

| 术语 | 含义 |
|------|------|
| Shimeji | 网格精灵表：固定 `frameSize`（默认 128），行=状态、列=帧 |
| CareState | 养成数值状态（hunger/mood/…） |
| MainQuest | 唯一主线「第一次照顾伙伴」 |
| 形态 A | App 内全屏家园 |
| 形态 B | 系统悬浮透明宠 |
| GREET 等 | KidsPet `PetState` 枚举，对应精灵表行号 |
| Playground | 现有 HTML 沙箱小游戏层 |
| Overlay | Android `SYSTEM_ALERT_WINDOW` / `TYPE_APPLICATION_OVERLAY` |

---

## 3. 总体架构

### 3.1 逻辑架构

```
┌──────────────────────────────────────────────────────────────────┐
│ Presentation (RN)                                                 │
│  HomeScreen(家园) │ QuestHUD │ PetPicker │ Settings(悬浮开关)      │
│  Chat/Voice 复用现有 │ PlaygroundView 复用现有                      │
├──────────────────────────────────────────────────────────────────┤
│ Domain (@lumo/core)                                               │
│  careReducer │ mainQuestReducer │ spriteMotionMapper              │
│  types: CareState, CareEvent, MainQuestState, SpriteSheetConfig   │
├──────────────────────────────────────────────────────────────────┤
│ Rendering                                                         │
│  A: SpriteHomeView (WebView + Pixi 切帧)                          │
│  B: FloatingPetModule (Kotlin Overlay + Bitmap 切帧)              │
├──────────────────────────────────────────────────────────────────┤
│ Native Bridge                                                     │
│  FloatingPetModule: start/stop/setPet/setAnim/onTap/onDoubleTap   │
│  SharedPrefsModule(现有): 持久化 JSON                             │
├──────────────────────────────────────────────────────────────────┤
│ Agent (nodejs-mobile, 现有)                                       │
│  对话 │ create_web_playground │ image_generate │ (P1) care tools  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 与现有 Lumo 的衔接

| 现有能力 | MVP 处理 |
|----------|----------|
| `Live2DView` | 默认不再挂载；代码可保留，入口隐藏 |
| `SceneBackground` | 扩展/替换为「温馨小屋」场景（可先基于现有 meadow 改版） |
| `petOrchestrator` / 对话态 | 保留；输出动画名改为 sprite 映射 |
| `PlaygroundView` + `close_playground` | 主线关复用；扩展 completed 语义 |
| `SharedPrefsModule` | 新增 care/quest/petId 键 |
| `mobile-tool-policy` | 暂不改白名单；P1 再加 care 工具 |
| Android `com.kidsmobile` | 新增 `FloatingPetPackage` |

### 3.3 进程与生命周期

```
App 前台 ──► 形态 A 渲染；可选同时开形态 B
App 后台 ──► 形态 A 暂停 ticker；形态 B 若已 start 则继续（前台 Service）
用户杀 App ──► Service 按 KidsPet 策略：有前台通知则可保活；MVP 要求「设置里开启则尽量恢复」
权限拒绝 ──► 形态 B 不可用；主线 desktop_hint 可 skip → completed
```

---

## 4. 模块划分与目录规划

### 4.1 建议目录

```
packages/core/src/
  care/
    care-types.ts          # CareState, CareEvent
    care-reducer.ts        # 纯函数 + 单测
    care-reducer.test.ts
  quest/
    main-quest-types.ts
    main-quest-reducer.ts
    main-quest-reducer.test.ts
  sprite/
    sprite-types.ts        # SpriteSheetConfig, PetMotionId
    sprite-motion-map.ts   # 对话态/事件 → PetState 行
    sprite-motion-map.test.ts

app/assets/pet-sprites/
  shimeji_caneko/sheet.png + config.json
  klee/sheet.png + config.json
  gengar_shimeji/sheet.png + config.json
  registry.json            # 三角色注册表

app/src/home/
  SpriteHomeView.tsx       # WebView 封装（替代 Live2DView 主路径）
  HomeHud.tsx
  HomeHotspots.tsx
  useHomeWorld.ts          # 组装 care/quest/动画指令

app/src/floating/
  FloatingPetBridge.ts     # RN ↔ Native API
  useFloatingPet.ts

app/src/quest/
  MainQuestGuide.tsx       # 顶栏/气泡文案
  mainQuestCopy.ts

app/src/games/
  mainlineCountGame.ts     # 内置数数关 HTML（走 wrapPlaygroundHtml）

app/src/storage/
  carePersistence.ts
  questPersistence.ts
  selectedPetPersistence.ts

app/android/.../com/kidsmobile/floating/
  FloatingPetModule.kt
  FloatingPetPackage.kt
  FloatingPetService.kt
  SpriteFrameView.kt       # 切帧绘制
```

### 4.2 包依赖方向

```
app → @lumo/core（care/quest/sprite 类型与 reducer）
app/native → 不依赖 core 源码；通过 Bridge 传 JSON
agent-runtime → 暂不依赖 care（P1 再接）
```

禁止：WebView 运行时直接写 SharedPrefs；悬浮 Service 直接改 RN state（一律事件回调）。

---

## 5. 数据模型与持久化

### 5.1 CareState

```ts
/** 养成数值；hunger 越高越饿（对齐 KidsPet） */
interface CareState {
  hunger: number;      // 0..100
  mood: number;        // 0..100
  energy: number;      // 0..100，MVP HUD 可隐藏
  studyXp: number;     // >=0
  level: number;       // >=1
  lastFedAt: number | null;
  lastStudyAt: number | null;
  updatedAt: number;
}
```

**默认值**：`hunger:20, mood:80, energy:100, studyXp:0, level:1, last*:null`。

**等级公式（冻结）**：`level = floor(studyXp / 100) + 1`（与 KidsPet `level * 100` 经验条同构；MVP 只在通关加 XP 时重算）。

### 5.2 CareEvent（唯一写入入口）

```ts
type CareEvent =
  | { type: "FEED"; at?: number }
  | { type: "STUDY_CLEAR"; score?: number; at?: number }
  | { type: "STUDY_FAIL"; at?: number }      // MVP：不改 mood
  | { type: "COMFORT" }                      // 预留：mood+小幅
  | {
      type: "TICK";
      /** 前台定时器派发的饥饿变化（由调度器计算） */
      hungerDelta: number;
      /** 前台定时器派发的心情变化（由调度器计算） */
      moodDelta: number;
      at?: number;
    }
  | { type: "HYDRATE"; state: CareState };   // 仅从磁盘恢复
```

**FEED 规则（冻结）**：

- `hunger = max(0, hunger - 20)`  
- `mood = min(100, mood + 5)`  
- `lastFedAt = now`  
- MVP **无冷却**（若刷喂食可接受；Phase 2 再加 CD）

**STUDY_CLEAR 规则（冻结）**：

- `studyXp += 10`（主线首次与之后自由再玩均可加；若需防刷，Phase 2 加每日上限）  
- `mood = min(100, mood + 10)`  
- 重算 `level`  
- `lastStudyAt = now`

**TICK 规则（前台时间衰减，非离线，MVP 已启用）**：

- 仅当 App 在前台（或悬浮窗前台 Service 在运行）时触发；**离线不计入**（离线衰减仍为 Phase 2）
- 推荐调度（由应用侧计算 delta 后 dispatch）：
  - 每 `60s`：`hungerDelta = +1`
  - 当 `hunger >= 70` 时，每 `120s`：`moodDelta = -1`；否则 `moodDelta = 0`
- `hunger = clamp(0..100, hunger + hungerDelta)`
- `mood = clamp(0..100, mood + moodDelta)`
- `updatedAt = at ?? now`

### 5.3 MainQuestState

```ts
type MainQuestStep =
  | "intro"
  | "first_feed"
  | "first_study"
  | "celebrate"
  | "desktop_hint"
  | "completed";

interface MainQuestState {
  step: MainQuestStep;
  /** 是否已成功喂食过（主线门闩） */
  hasFedOnce: boolean;
  /** 是否已通关主线学习关 */
  hasClearedStudy: boolean;
  /** 是否已打开过悬浮（用于 desktop_hint） */
  hasOpenedFloating: boolean;
  updatedAt: number;
}
```

默认：`step:"intro"`, 三布尔均为 `false`。

### 5.4 选中角色

```ts
type PetId = "shimeji_caneko" | "klee" | "gengar_shimeji";
// 持久化 selectedPetId，默认 shimeji_caneko
```

### 5.5 持久化键（SharedPrefs）

| Key | 内容 |
|-----|------|
| `kids.careState` | CareState JSON |
| `kids.mainQuest` | MainQuestState JSON |
| `kids.selectedPetId` | string |
| `kids.floatingEnabled` | `"0"` / `"1"` |
| 现有 | gallery / gameHistory / scene / provider… 不变 |

读写模块：`carePersistence.ts` / `questPersistence.ts` / `selectedPetPersistence.ts`，模式对齐 `appDataPersistence.ts`。

### 5.6 注册表 registry.json

```json
{
  "version": 1,
  "defaultPetId": "shimeji_caneko",
  "pets": [
    {
      "id": "shimeji_caneko",
      "name": "加拿大猫",
      "category": "quadruped_cat",
      "sheetUrl": "shimeji_caneko/sheet.png",
      "configUrl": "shimeji_caneko/config.json"
    },
    {
      "id": "klee",
      "name": "可莉",
      "category": "human",
      "sheetUrl": "klee/sheet.png",
      "configUrl": "klee/config.json"
    },
    {
      "id": "gengar_shimeji",
      "name": "耿鬼",
      "category": "creature",
      "sheetUrl": "gengar_shimeji/sheet.png",
      "configUrl": "gengar_shimeji/config.json"
    }
  ]
}
```

每个 `config.json` 对齐 KidsPet `SpriteConfig`（见 §7）。

---

## 6. 养成与主线状态机

### 6.1 主线步骤图

```
                    ┌─────────┐
                    │  intro  │ 点击伙伴 / 「开始」
                    └────┬────┘
                         ▼
                 ┌───────────────┐
                 │  first_feed   │ 仅食盆可推进；书桌点击 → 拦截提示
                 └───────┬───────┘
                         │ FEED 成功
                         ▼
                 ┌───────────────┐
                 │ first_study   │ 书桌打开内置数数关
                 └───────┬───────┘
                         │ STUDY_CLEAR
                         ▼
                 ┌───────────────┐
                 │  celebrate    │ 自动动画 + 文案（可短时停留）
                 └───────┬───────┘
                         ▼
                 ┌───────────────┐
            ┌────┤ desktop_hint  ├────┐
            │    └───────────────┘    │
     打开悬浮成功                   点「稍后再说」
            │                         │
            └──────────┬──────────────┘
                       ▼
                 ┌─────────────┐
                 │  completed  │ 自由养成 + 可随时开悬浮
                 └─────────────┘
```

### 6.2 MainQuestEvent

```ts
type MainQuestEvent =
  | { type: "START" }                 // intro → first_feed
  | { type: "PET_TAPPED" }            // intro 下等同 START；其他步骤可只播 GREET
  | { type: "FEED_OK" }               // → first_study；要求当前为 first_feed
  | { type: "DESK_TAP" }              // 若 !hasFedOnce → 返回 { blocked:true, reason }
  | { type: "STUDY_CLEAR" }           // → celebrate
  | { type: "CELEBRATE_DONE" }        // → desktop_hint
  | { type: "FLOATING_OPENED" }       // → completed
  | { type: "SKIP_DESKTOP" }          // → completed
  | { type: "HYDRATE"; state: MainQuestState };
```

**DESK_TAP 门闩（冻结 D5）**：

- `hasFedOnce === false`（或 `step === first_feed` / 仍为 intro）：**不打开** Playground；UI 显示「先吃一点再学习吧～」。  
- `step === first_study` 或之后：打开主线关（首次）或允许重玩。

### 6.3 引导文案（`mainQuestCopy.ts`）

| step | 顶栏/气泡 |
|------|-----------|
| intro | 「点点我，我们做朋友吧！」 |
| first_feed | 「我有点饿了，去点食盆喂我吧～」 |
| first_study | 「吃饱啦！去书桌学一小会儿吧」 |
| celebrate | 「太棒了！我们一起变强了！」 |
| desktop_hint | 「想把我放到桌面陪你吗？」【放到桌面】【稍后再说】 |
| completed | 「想学就来书桌，想聊就叫我～」 |

### 6.4 与对话态 petStateMachine 的关系

- **不合并**两个状态机：语音管线仍用现有 9 态；养成/主线独立。  
- **汇合点**仅在「当前应播放哪套精灵动画」：`spriteMotionMapper(care, quest, petDialogState, lastCareEvent) → PetState`。

优先级（高 → 低）：

1. 一次性动作：FEED/STUDY_CLEAR/点击 → GREET（播完回落）  
2. `petDialogState === speaking` → GREET（或 STAND + 气泡，MVP 用 GREET 慢循环）  
3. `thinking` / `listening` → SIT  
4. 悬浮闲逛定时器 → WALK  
5. 默认 → STAND  

---

## 7. 精灵系统（Shimeji）

### 7.1 三角色（冻结）

| category | id | 文件 | 备注 |
|----------|-----|------|------|
| 四足猫 | `shimeji_caneko` | 1024×1152 | 默认；完整 8×9 |
| 人类 | `klee` | 1024×1152 | GREET `frameMax:4`（KidsPet 已特化） |
| 异型 | `gengar_shimeji` | 2048×1152 | 列数更多，按 config 的 frameMax 裁切 |

迁移命令（实现阶段执行）：从  
`AI-desktop-pets/app/src/main/res/drawable-nodpi/{id}.png`  
拷到 `app/assets/pet-sprites/{id}/sheet.png`，并手写/生成 `config.json` + credit。

### 7.2 config.json schema

```ts
interface SpriteSheetConfig {
  id: string;
  name: string;
  frameSize: number; // 128
  states: Partial<Record<PetStateName, StateConfig>>;
  credit: { author: string; link: string };
}

interface StateConfig {
  spriteLine: number; // 1-based
  frameMax: number;
  frameRate: number;  // default 9
  loop: boolean;
}

type PetStateName =
  | "STAND" | "WALK" | "SIT" | "GREET"
  | "JUMP" | "FALL" | "DRAG" | "CRAWL" | "CLIMB";
```

MVP **必须配置**：STAND / WALK / SIT / GREET。其余行若图中有可写上，家园暂不用。

**切帧公式**（与 KidsPet 一致）：

```
row = spriteLine - 1
col = currentFrame  // 0 .. frameMax-1
srcX = col * frameSize
srcY = row * frameSize
```

越界则钳制或不绘制该帧（打日志）。

### 7.3 家园渲染（Pixi）

- WebView 加载精简 `webview-sprite.html`（**不再**加载 live2d cubism）。  
- 资源：`file:///android_asset/pet-sprites/...`（同步脚本类似现有 `sync-live2d-assets.mjs`，可改名为 `sync-sprite-assets.mjs`）。  
- RN → WebView 指令（JSON）：

| type | payload | 说明 |
|------|---------|------|
| `init` | `{ petId, config, sheetUrl }` | 加载表 |
| `set_state` | `{ state, loop? }` | 切动画 |
| `set_facing` | `{ left: boolean }` | 水平翻转 |
| `viewport` | `{ scale, offsetX, offsetY }` | 可选 |

- WebView → RN：`ready` / `error` / `tap` / `animation_complete`。

### 7.4 悬浮渲染（Native）

- `SpriteFrameView`：用 `Bitmap` + `Canvas.drawBitmap(srcRect,dstRect)`，逻辑同 KidsPet `SpriteAnimationView`。  
- 精灵 PNG 打进 `android/app/src/main/assets/pet-sprites/` 或 `res/drawable-nodpi`（二选一；**建议 assets** 与家园共用同步脚本）。  
- 帧循环：`Handler` / `Choreographer`，按 `frameRate` 推进；非 loop 到末帧回调 `animation_complete`。

---

## 8. 家园场景（形态 A）

### 8.1 信息架构（一屏）

```
┌─────────────────────────────────────────┐
│ [主线提示条]              [选宠] [设置] │
│ 心情 ❤ ##  饿 #  等级 Lv.n              │
├─────────────────────────────────────────┤
│                                         │
│         （温馨小屋背景）                  │
│              [精灵]                      │
│     🥣食盆              📚书桌           │
│                                         │
├─────────────────────────────────────────┤
│  语音/输入条（复用现有）  [放到桌面]      │
└─────────────────────────────────────────┘
```

- 背景：MVP 可用现有 `SceneBackground` 的「草地/室内向」改造为固定 `cozy_home`（仍允许 emoji 占位）；后续换一张房间图。  
- 热点：绝对/百分比定位的透明按钮区，不依赖精灵 hitTest 做喂食/书桌（精灵 tap 仅推进 intro / GREET）。

### 8.2 热点行为

| 热点 | 行为 |
|------|------|
| 伙伴 | `PET_TAPPED`；非 intro 则 GREET |
| 食盆 | dispatch `FEED` + `FEED_OK`；播 GREET；toast |
| 书桌 | `DESK_TAP`：未喂食 → 提示；已喂食 → 开主线 Playground |
| 放到桌面 | 调 Bridge `start()`；权限引导 |

### 8.3 替换 Live2D 主路径

`App.tsx` 主舞台：

- `petVisible` 时渲染 `SpriteHomeView` 而非 `Live2DView`。  
- `petOrchestrator` 的 motion 回调改为向 `SpriteHomeView` post `set_state`。  
- 选宠 UI：仅列 registry 三角色。

---

## 9. 悬浮窗（形态 B）

### 9.1 能力集（MVP）

| 能力 | 支持 |
|------|------|
| 透明无背景 | ✓ |
| 单实例 | ✓ |
| 显示当前 petId 精灵 | ✓ |
| STAND / WALK / GREET | ✓ |
| 拖拽 | ✓ |
| 单击 GREET | ✓ |
| 双击打开 App 家园 | ✓ |
| 设置开关 + 权限引导 | ✓ |
| 爬墙/倒挂/多宠 | ✗ Phase 2 |

### 9.2 RN Bridge API

```ts
interface FloatingPetBridge {
  /** 是否已有 Overlay 权限 */
  canDrawOverlays(): Promise<boolean>;
  /** 跳转系统设置授权页 */
  requestOverlayPermission(): Promise<void>;
  /** 启动前台 Service 并显示宠 */
  start(options: { petId: string; configJson: string }): Promise<void>;
  stop(): Promise<void>;
  setPet(petId: string, configJson: string): Promise<void>;
  setAnim(state: PetStateName): Promise<void>;
  isRunning(): Promise<boolean>;
}

// Native → JS 事件
type FloatingPetEvent =
  | { type: "tap" }
  | { type: "double_tap" }
  | { type: "drag_end"; x: number; y: number }
  | { type: "service_stopped" };
```

### 9.3 Service 行为

- 类型：`foregroundServiceType` 按目标 SDK 声明（特殊用途 / 数据同步需合规填写；实现时对照当前 `targetSdk`）。  
- 通知：常驻「桌面伙伴运行中 / 点击返回」，点击 PendingIntent → `MainActivity`。  
- 窗口：`TYPE_APPLICATION_OVERLAY`，`FORMAT_TRANSPARENT`，`FLAG_NOT_FOCUSABLE`（点击仍可收）；尺寸约 128dp～160dp。  
- 简单 WALK：定时在左右边界内缓慢平移 + WALK 动画；触边翻转 facing。  
- 与 RN 同步：`start` 时传入 petId；RN 侧 `selectedPetId` 变更若悬浮在跑则 `setPet`。

### 9.4 权限 UX

1. 用户点「放到桌面」→ `canDrawOverlays`  
2. false → 说明弹窗（儿童可读）→ `requestOverlayPermission`  
3. 返回 App 再检测；成功 → `start` + quest `FLOATING_OPENED`  
4. 用户拒绝 → 可「稍后再说」`SKIP_DESKTOP`

### 9.5 参考移植点（KidsPet）

| KidsPet | Lumo MVP |
|---------|----------|
| `FloatingPetService` | 精简版：单实例、无 Hilt |
| `SpriteAnimationView` | `SpriteFrameView` |
| `SYSTEM_ALERT_WINDOW` | 同 |
| 多宠 Map | 删除，仅一个 View |
| Physics 爬墙 | 不做 |

---

## 10. 主线学习关卡

### 10.1 设计要点

| 项 | 规格 |
|----|------|
| ID | `mainline_count_v1` |
| 载体 | 内置 HTML，经 `wrapPlaygroundHtml` + 安全校验 |
| 玩法 | 屏幕出现 N 个物品（⭐/🍎），问「有几个？」；点数字按钮作答 |
| 关卡 | 5 题；每题 N∈[1,5]；答对进下一题 |
| 通关 | 答对 ≥4 题 **或** 完成第 5 题后自动 `completed` |
| 时长 | 目标 ≤2 分钟 |
| 依赖 | 无网络、无外部资源 |

### 10.2 与 Playground 结算协议

关闭时复用 `close_playground`：

```ts
{
  reason: "completed" | "user" | "error";
  score: number;      // 0-100，如 答对题数/总题*100
  gameId?: string;    // "mainline_count_v1"
}
```

RN 处理：

```
if (gameId === mainline && (reason==="completed" || score>=80)) {
  care.dispatch(STUDY_CLEAR);
  quest.dispatch(STUDY_CLEAR);
  // celebrate 动画
}
```

内置 HTML 应在通关时尽量自行 `postMessage` 或依赖现有关闭按钮带 score 的路径；实现阶段对齐 `PlaygroundView` 现有桥。

### 10.3 重玩

- `completed` 之后点书桌：仍打开同一关或「自由练习」；再通关仍可 `STUDY_CLEAR`（加 XP）。  
- 主线步骤不再回退。

---

## 11. Agent 与对话集成

### 11.1 MVP（P0）

- 保留现有对话、TTS/ASR、`create_web_playground`、`image_generate`。  
- System prompt 增补短段落：  
  - 伙伴生活在「温馨小屋」；  
  - 有喂食/学习主线；  
  - 不要引导孩子绕过喂食；  
  - 自由小游戏是加餐不是主线。  

### 11.2 P1 工具（主线后再做）

| 工具 | 行为 |
|------|------|
| `get_pet_care_state` | 返回 CareState + quest.step + petId |
| `apply_pet_care_event` | 仅允许 `FEED` / `COMFORT` 等白名单事件 |
| `play_pet_animation` | 请求 GREET/SIT/… |

仍禁止 Agent 直接写任意 hunger 数值。

---

## 12. 关键时序

### 12.1 主线喂食

```
User → 食盆 → useHomeWorld
  → careReducer(FEED)
  → persist care
  → questReducer(FEED_OK)  // step: first_feed→first_study
  → persist quest
  → SpriteHomeView.set_state(GREET)
  → 更新 HUD + 文案
```

### 12.2 主线学习

```
User → 书桌 → quest.DESK_TAP
  alt 未喂食
    → Toast/气泡拦截
  else
    → openPlayground(mainlineCountHtml)
    → User 通关关闭
    → STUDY_CLEAR (care+quest)
    → celebrate UI
    → CELEBRATE_DONE → desktop_hint
```

### 12.3 打开悬浮

```
User → 放到桌面
  → canDrawOverlays?
  → request / start(petId, config)
  → Service 显示透明宠
  → quest.FLOATING_OPENED → completed
  → 可选：minimize App
```

### 12.4 悬浮双击回 App

```
Service double_tap → sendEvent → RN
  → MainActivity intent（若未在前台）
  → navigate 家园
  → 不强制 stop 悬浮（可保持两边同时；设置项决定）
```

**冻结建议**：双击回 App **不自动 stop** 悬浮，避免孩子来回开关权限；提供设置「打开 App 时隐藏悬浮」。

---

## 13. 实现工作包与里程碑

### 13.1 工作包（建议顺序）

| WP | 名称 | 交付物 | 依赖 |
|----|------|--------|------|
| WP0 | 资源迁移 | 3×sheet+config、registry、sync 脚本、credit | 无 |
| WP1 | core 状态机 | care/quest/sprite-map + 单测 | 无 |
| WP2 | 持久化 | prefs 读写 hooks | WP1 |
| WP3 | Pixi 精灵 WebView | SpriteHomeView 可切三角色/动画 | WP0 |
| WP4 | 家园壳 | 小屋布局、热点、HUD、主线文案 | WP1–3 |
| WP5 | 主线数数关 | HTML + 结算接线 | WP4 |
| WP6 | 悬浮原生 | Service+Module+权限+拖拽+GREET | WP0 |
| WP7 | Bridge 联调 | 选宠同步、主线 desktop_hint | WP4,WP6 |
| WP8 | App 主路径切换 | 去 Live2D 默认、回归对话 | WP4 |
| WP9 | 打磨验收 | AC 全过、文档微调 | 全部 |

### 13.2 里程碑

| 里程碑 | 标准 | 预估（人天，供参考） |
|--------|------|---------------------|
| M1 可看 | 家园三角色 STAND/GREET | 2–3 |
| M2 可玩主线 | 喂食门闩 + 数数通关到 celebrate | 2–3 |
| M3 可悬浮 | 透明宠拖拽 + 回 App | 3–5 |
| M4 MVP Done | §14 AC 全绿 | 1–2 |

合计约 **8–13 人天**（视熟悉原生 Overlay 程度浮动）。

### 13.3 明确不做进 WP

- 衰减、爬墙、多宠、第二场景、Agent care 工具、iOS。

---

## 14. 测试与验收

### 14.1 单元测试（必做）

- `careReducer`：FEED 下限、STUDY_CLEAR 升级阈值、STUDY_FAIL 不改 mood  
- `mainQuestReducer`：逐步推进、DESK 拦截、SKIP/FLOATING 到 completed、禁止回退  
- `spriteMotionMapper`：优先级

### 14.2 手工验收（需求 AC 细化）

| ID | 步骤 | 期望 |
|----|------|------|
| AC-01 | 冷启动 | cozy_home + caneko STAND + intro 文案 |
| AC-02 | 切换 klee / gengar | 表与名称切换，动画正常 |
| AC-03 | intro 点伙伴 | → first_feed 文案 |
| AC-04 | 未喂食点书桌 | 拦截提示，无 Playground |
| AC-05 | 喂食 | hunger-20，GREET，→ first_study |
| AC-06 | 书桌通关数数 | XP/mood 增加，celebrate → desktop_hint |
| AC-07 | 稍后再说 | → completed |
| AC-08 | 放到桌面（含授权） | 透明悬浮、拖拽、单击 GREET |
| AC-09 | 双击悬浮 | 回家园 |
| AC-10 | 杀进程再开 | care/quest/petId 恢复 |
| AC-11 | 无 Key 断网 | AC-01～06 仍可 |
| AC-12 | 对话一轮 | SIT/GREET 映射，回复正常 |

### 14.3 回归

- 设置里模型配置、画廊、自由 playground、语音权限原路径冒烟。

---

## 15. 风险、版权与后续

### 15.1 风险

| 风险 | 等级 | 对策 |
|------|------|------|
| Overlay 各厂商权限差异 | 中 | 引导文案 + skip 主线；真机矩阵测小米/华为 |
| 同人精灵版权 | 高（若上架） | credit 展示；商店版可换成自有资产 |
| WebView+Service 双开内存 | 中 | Playground 打开时暂停家园 ticker；悬浮用低分辨率绘制 |
| klee GREET 仅 4 帧 | 低 | config 特化已存在 |
| gengar 图较宽 | 低 | 严格按 frameMax 裁切 |

### 15.2 Phase 2+  backlog

1. 离线 hunger/mood 衰减  
2. 悬浮物理（FALL/CLIMB）  
3. Agent care 工具  
4. 第二场景与支线任务  
5. 更多角色（仍走 registry）  
6. 专用 eat 动画行或换皮  

---

## 16. 附录

### 16.1 默认 Sprite 状态表（与 KidsPet DEFAULT_STATES）

| State | line | frameMax | loop |
|-------|------|----------|------|
| STAND | 1 | 1 | true |
| WALK | 2 | 4 | true |
| SIT | 3 | 1 | true |
| GREET | 4 | 8（klee=4） | false |
| JUMP | 5 | 1 | true |
| FALL | 6 | 3 | false |
| DRAG | 7 | 1 | true |
| CRAWL | 8 | 8 | true |
| CLIMB | 9 | 8 | true |

### 16.2 credit 摘录（迁移时写入 config）

| id | author（以 KidsPet 为准） |
|----|---------------------------|
| shimeji_caneko | uncut-adventure |
| klee | Reddit User（见原 link） |
| gengar_shimeji | Unknown（需后续核实） |

### 16.3 相关文件索引

| 文档/代码 | 路径 |
|-----------|------|
| 需求冻结 | `docs/plans/2026-07-29-sprite-nurture-game-requirements.md` |
| KidsPet 精灵配置 | `AI-desktop-pets/.../SpriteConfig.kt` |
| KidsPet 悬浮 | `AI-desktop-pets/.../FloatingPetService.kt` |
| Lumo 场景背景 | `app/src/pet/SceneBackground.tsx` |
| Lumo Playground | `app/src/components/PlaygroundView.tsx` |
| Lumo 持久化范例 | `app/src/storage/appDataPersistence.ts` |

### 16.4 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-07-29 | 首版详细设计：双形态、状态机、Bridge、主线关、WP 拆分 |

---

## 评审检查清单

请确认下列项无异议后即可进入实现计划 / 开工：

- [ ] 三角色与主线门闩、数数关规格认可  
- [ ] 家园 Pixi + 悬浮 Native 双渲染方案认可  
- [ ] Care/Quest 数据结构与持久化键认可  
- [ ] Bridge API 与悬浮交互（双击不强制停服）认可  
- [ ] WP 顺序与 MVP 砍掉项认可  

有修改意见请按章节号反馈，修订后升 v1.1 再开工。
