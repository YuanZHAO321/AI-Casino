# GAME-PROTOCOL — 新玩法接入协议

> 在本框架下开发新游戏（德州、百家乐、骰宝……）时遵循的契约。平台复用：人格/三模型槽/记忆/桌聊/统计/场次/成就/TTS/UI 骨架；游戏方只需实现规则引擎、视角投影、prompt 预设与牌桌渲染。

## 1. 总原则（先读这个）

1. **防天眼是硬约束**：完整游戏状态（牌堆/暗牌/骰盅…）只许存在于引擎内部；任何进入 AI prompt 或 UI 的数据必须经过你实现的 `projectView()`，且投影类型**在结构上不包含**隐藏信息字段。为它写零泄漏测试（序列化投影，断言不含隐藏内容）。
2. **AI 是真实玩家**：给 AI 的视角=同座位真人能看到的东西。公开信息（明牌、弃牌、注额、桌聊）可以给；衍生信息（如已发牌汇总）只给"现实中可记忆"的。
3. **调用预算**：一次 LLM 调用完成多件事（动作+台词；结算反应+下轮决策）。新增调用点前先想能不能并进已有调用。
4. **非法输出兜底**：prompt 里列出合法操作集合；返回后用引擎校验；非法→本地策略兜底+下次调用告知 AI 被修正。每个游戏必须自带一个"本地基本策略"（机器人/兜底两用）。
5. **纯说话输出过 `unwrapSpeech()`**，结构化输出用 prompt 强制 JSON + `extractJsonObject()` 宽容解析。

## 2. 必须实现的契约

### 2.1 GameModule（src/core/game.ts）

```ts
interface GameModule<TState, TView, TAction extends string> {
  gameId: string
  getLegalActions(state: TState): TAction[]        // 当前行动者的合法操作
  applyAction(state: TState, action: TAction): TState
  projectView(state: TState, viewerId: string): TView  // 防天眼唯一出口
  fallbackAction(state: TState, legal: TAction[]): TAction // 本地策略兜底
}
```

viewerId 约定：座位 id ｜ `'player'`（人类）｜ `'companion'`（=玩家视角）｜ `'dealer'`。

### 2.2 引擎（参考 games/blackjack/engine.ts 的形态）

- 纯函数/纯状态机，不碰 IPC、不碰 React、不碰 LLM —— 保证可单测
- 显式 Phase 枚举驱动（下注→…→结算），`startRound(shoe/randomSource, rules, roundNo, bets)` 返回初始状态
- 随机源用 `core/rng.ts`（CSPRNG）；牌类游戏用 `core/shoe.ts`（自带完整性校验与序列化）
- 规则参数化（`TRules` 对象 + 预设表，参考 rulePresets.ts），不要硬编码
- 结算时给每座位产出 `net`（净盈亏）与 `outcome` 字符串——平台统计按这两个字段聚合

### 2.3 Prompt 预设（参考 games/blackjack/prompts.ts）

三层结构（顺序固定，静态在前利于 prompt cache）：

```
[1] 规则层：按当前桌面规则动态生成的游戏说明（锁定）
[2] 角色层：characterLayer(persona)（平台提供，直接复用）
[3] 输出格式层：每种调用类型的 JSON/纯文本格式（锁定）
```

平台约定的调用类型（kind）：`bet`（下注，JSON）/ `decision`（行动，JSON {action, say?}）/ `settlement`（结算，JSON {say, nextBet…}）/ `speech`（纯说话，强制非 JSON）。新游戏可加自己的 kind，但格式层必须锁定且写明「只输出 JSON / 直接输出台词」。

态势序列化：紧凑单行文本（参考 serializeView），不要发整个 JSON 视图。

### 2.4 会话编排（参考 games/blackjack/session.ts）

新游戏可以复制 BlackjackSession 的骨架（它依赖的平台件全部可复用）：

- `CharacterState`（persona+memory+留言队列+战绩）与 `makeChar`
- `callSlot()`：三模型槽解析 + 备用切换（直接搬）
- `gate()/continueStep()`：手动节奏闸门（直接搬）
- `takeContext()`：留言/桌聊/修正/历史感知 注入（直接搬）
- `utter()/utterPlayer()`：桌聊事件（直接搬）
- 必须发出同一套 `SessionEvent`（view/utterance/awaiting-player/thinking/step/corrected/backup-used/bankrolls/round-settled/log/error）——store 的事件处理无需改动
- `round-settled` 必须产出平台 `RoundRecord`：`seats[]` 带 personaId/modelLabel/bet(实际总押注)/net/outcome/hands(牌面或等价物)，这样四块统计、成就、分析师自动工作

> 中期计划：若出现第二个游戏，把上述可搬部分抽成 `core/sessionBase.ts`，游戏 session 只写回合流程。

## 3. UI 接入

1. **大厅**：Lobby.tsx 加一张 game-card（gameId 路由进对应桌面组件）
2. **牌桌组件**：自由实现，但遵守视觉基调（高端实体赌场：深绿毡/木/铜金/衬线；动画 150–500ms ease-out；禁手游感）。可复用：PlayingCard/CardBack、Chip/ChipStack、Avatar、Modal、悬浮陪玩窗、ChatPanel、step-bar、house-plaque 样式
3. **store**：screen 路由按 gameId 扩展；`enterTable` 里按 settings 当前游戏建对应 session；RoundRecord.game 字段写 gameId（历史/统计自动按记录工作）
4. **设置**：规则节做成按 gameId 切换的子面板；座位/AI 功能/外观/音频全部平台级，勿复制

## 4. 数据与持久化约定

- 新增存储键走 `window.casino.store`（主进程原子写）；键名小写 kebab
- RoundRecord 不够用时把游戏特有数据放 `detail`（unknown），不要改平台字段语义
- 给 Persona/Profile/Settings 加字段 → 同步 `core/migrate.ts` 与 `presets.migrateSettings`
- 备份（dataTransfer.ts）：新存储键若需进备份，加进 ALL_KEYS / SECTION_KEYS

## 5. 验收清单（新游戏 PR 必须满足）

- [ ] 引擎单测：规则正确性（含边界赔付）、随机源完整性
- [ ] **投影零泄漏测试**（每个隐藏信息一条断言）
- [ ] 非法操作兜底测试（resolveProposedAction 等价物）
- [ ] 本地机器人可无 API 跑通整局（端到端测试）
- [ ] 调用预算注释写在 session 头部（每局每角色调用次数上限）
- [ ] zh/en i18n 同步；typecheck + 全量 vitest 绿
- [ ] prompt 规则层随规则开关动态生成（不要写死一套）
