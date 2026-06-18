# ARCHITECTURE — 项目介绍与代码地图

> 写给后续维护者（包括未来的 AI 助手）：读完本文即可定位与修改任何子系统，无需通读代码。配套：新游戏接入见 `GAME-PROTOCOL.md`。

## 0. 一句话定位

「AI 赌场」：平台核心（座位/人格/LLM 编排/记忆/统计/场次）与具体游戏解耦，Blackjack 是第一个 GameModule。卖点 = AI 对手位 + AI 陪玩位 + 架构级防天眼 + 调用次数/token 双友好。**两个发行目标共用同一套 `src/`：Electron 桌面版 + 网页版/PWA**，平台差异全部收敛到 `window.casino` 这一道接缝（细节见 §10）。

## 1. 技术栈与命令

Electron 33 + electron-vite + React 18 + TypeScript（strict）+ Zustand + vitest + electron-builder；网页目标额外用 vite + vite-plugin-pwa。

```bash
npm run dev          # Electron 开发
npm test             # vitest（116 个测试，全绿才算改完）
npm run typecheck    # 双 tsconfig（web + node）
npm run dist:mac     # mac universal dmg
npm run dist:win     # win nsis x64（mac 上交叉打包可用）

npm run dev:web      # 网页开发（PWA 热更新）
npm run build:web    # 输出 docs/（GitHub Pages 从 /docs 手动部署，相对 base 适配子路径）
npm run preview:web  # 预览网页构建产物
```

## 2. 进程模型

```
┌─ 主进程 electron/main ──────────────────────────────┐
│ index.ts      窗口 + 全部 ipcMain.handle 注册        │
│ llm.ts        OpenAI 兼容 chat/completions + /models │
│ tts.ts        神经TTS管理(下载/导入/删除) + API TTS  │
│ ttsWorker.ts  ELECTRON_RUN_AS_NODE fork 的合成子进程 │
│ storage.ts    userData/casino-data/<key>.json 原子写 │
│ files.ts      casino-asset:// 协议 + 文件导入/删除   │
│ dataTransfer.ts 全量/部分 备份导出导入(按id合并)     │
└─────────────────────────────────────────────────────┘
        ↕ IPC（preload/index.ts 桥接，类型在 preload/api.d.ts）
┌─ 渲染层 src/ ───────────────────────────────────────┐
│ core/      平台核心（游戏无关，纯 TS 可测）          │
│ games/blackjack/  21点模块（引擎+编排+prompt）       │
│ ui/        React UI + zustand store + i18n + 音频    │
└─────────────────────────────────────────────────────┘
```

**为什么 LLM/文件在主进程**：绕 CORS、apiKey 不进渲染层、文件系统访问。
**为什么 TTS 合成在子进程**：sherpa-onnx 合成是 CPU 重活，fork(`ELECTRON_RUN_AS_NODE`) 防卡主进程；模型加载一次常驻，IPC 消息协议见 ttsWorker.ts 头注释。

### IPC 通道清单（preload `window.casino.*`）

`llm.chat / llm.models`｜`store.load / store.save`｜`files.import(kind,dir) / files.remove`｜`data.export(sections) / data.import`｜`tts.models / downloadModel / cancelDownload / importModel / removeModel / load / synthesize / api / onDownloadProgress`

## 3. src/core —— 平台核心（改这里影响所有游戏）

| 文件 | 职责 |
|---|---|
| `cards.ts` | Suit/Rank/Card（含 deckIndex）、buildDeck（52 张断言） |
| `rng.ts` | CSPRNG：randomInt（拒绝采样）、Fisher-Yates shuffle、chance |
| `shoe.ts` | 牌靴：N 副构造校验、切牌渗透、seenSummary（记牌数据源）、**serialize/restore**（跨重启） |
| `types.ts` | ApiProfile（**models[] 模型池**）、ModelRef、Persona（**fast/smart/backup 三槽**、memoryReset 六档、historyAwareness 三档、voice、companion/dealer 配置）、Match（场）、RoundRecord/SeatResult（含 hands 牌面）、TableUtterance |
| `memory.ts` | CharacterMemory：六档清理（none/per-round/per-match/per-launch/permanent/manual）、压缩、persisted 判定 |
| `aiClient.ts` | resolveModelRef（槽→接口+模型）、callModel（IPC，内部重试 1 次）、pickSlot |
| `json.ts` | extractJsonObject（平衡大括号扫描）、**unwrapSpeech**（纯说话输出防 `{"response":..}` 泄漏）、num/strField |
| `stats.ts` | 四块统计：computeGlobalStats（玩家，含策略一致率）/ computeHouseStats / computePersonaStats / computeModelStats；characterRecordsBrief（分析师输入） |
| `achievements.ts` | 12 个成就定义 + checkAchievements |
| `migrate.ts` | v0.1→v0.2 存储迁移（profile.model→models[]、persona.profileId→fast、memoryMode 三档→六档）。**改 Persona/Profile 结构必须同步这里** |
| `game.ts` | GameModule 契约（见 GAME-PROTOCOL.md） |

## 4. src/games/blackjack —— 21 点模块

| 文件 | 职责 |
|---|---|
| `types.ts` | BlackjackRules（含 holeCard/peek/insurance/lateSurrender/doubleRestriction/maxSplitHands）、状态机 Phase（betting→sidebets-settled→**insurance**→acting→dealer→settled）、BlackjackState（**含牌靴与暗牌，禁入 prompt**）、TableView（投影类型，**结构上无隐藏信息**） |
| `rulePresets.ts` | uk/eu/us 预设 + applyPreset/detectPreset |
| `hand.ts` | 计值（软硬）、isBlackjack（分牌后不算）、isPair（同 rank 才可分） |
| `engine.ts` | 纯规则状态机：startRound（发牌+边注即结+保险阶段+偷看）、getLegalActions、applyAction（hit/stand/double/split/surrender/insure/no-insurance）、playDealer、dealerMustDraw/dealerDrawOne/settleRound（荷官模型决策模式用）、settle（ENHC/暗牌通用+保险+投降）。**结算要点：庄家 BJ=恰好两张 21；玩家天生 BJ 击败三张 21 照付 3:2** |
| `sideBets.ts` | 21+3 / Pairs / Top 3 赔率表（严格按用户上传的规则文档） |
| `basicStrategy.ts` | 多副基本策略（ENHC 修正仅无暗牌时；美式含投降表；保险永不买）；resolveProposedAction（**非法操作兜底**核心）；fallbackAction |
| `projection.ts` | **防天眼唯一出口**：暗牌揭示前 cards 用 '??'、total 只计明牌、seenSummary 扣除暗牌 |
| `prompts.ts` | 三层 prompt（规则层按当前规则动态生成/角色层/输出格式层）、紧凑态势序列化、各调用类型 user 消息、SPEECH_INSTRUCTIONS、DEALER_DRAW_FORMAT |
| `session.ts` | **编排中枢 BlackjackSession**（一个实例=一场）：回合驱动、调用预算、保险/投降/暗牌流程、手动节奏闸门（gate/continueStep）、荷官逐张抽牌（模型决策/播报）、三槽调用 callSlot（备用切换）、记忆/桌聊/留言队列、结算记录构建（含牌面）、generateReport/buildAnalystSystem |

### 调用预算（设计承诺，改编排时必须维持）

- 对手下注：第 1 局 1 次，之后用上局结算输出的 nextBet（0 调用）；关宣言→沿用上局注额（0 调用）
- 行动/保险：每决策点 1 次（动作+台词同一次）
- 结算：开宣言时 对手/陪玩/荷官 各 1 次（宣言+下局注额同一次）
- 玩家留言、AI 桌聊：并入对应角色下一次调用，0 额外调用
- 备用模型：仅主模型重试后仍失败时追加

### SessionEvent（session → store 的全部事件）

`view`（投影快照）/ `utterance`（channel: table|companion）/ `awaiting-player`（legal 列表）/ `thinking` / `step`（手动模式闸门）/ `corrected`（兜底标记）/ `backup-used` / `bankrolls` / `rebuy` / `round-settled`（RoundRecord）/ `log` / `error`

## 5. src/ui —— 界面层

| 文件 | 职责 |
|---|---|
| `store.ts` | zustand 单店：持久化键的加载（**经 migrate**）/保存、screen（lobby/table）、**场次管理 enterTable('continue'|'new')**（新场清 per-match 记忆、建 BlackjackSession）、handleEvent（上表事件→UI 状态+TTS 队列+成就检查+持久化）、分析师对话、报告、数据动作 |
| `presets.ts` | AppSettings 全量定义+默认值+migrateSettings、预设人格 4 个、默认筹码配色 |
| `audio.ts` | BGM 单例播放器；TTS 队列（neural→IPC 合成 wav、system→speechSynthesis、api→/audio/speech；**defaultVoice**：未配音色按全局 preferredEngine） |
| `i18n/` | zh.ts 为类型源（Dict = typeof zh，**不能加 as const**），en.ts 必须同构 |
| `components/` | Lobby（大厅+续场对话+TTS 首启向导）、Table（毡面/扇形座位/发牌靴/动画/暗牌/荷官牌子）、BetPanel（筹码托盘/待押/注位/Repeat-Clear-AllIn）、ActionBar（含保险/投降）、FloatingCompanion（可拖悬浮窗）、ChatPanel（桌聊）、SettingsModal、ProfilesModal（模型池）、PersonasModal（三槽/记忆/音色/头像）、HistoryModal（场分组+四块统计+AnalystDialog）、BgmModal、TtsModal（模型下载/导入/首选引擎）、AchievementsModal、Chip/PlayingCard/Avatar/Modal |
| `styles.css` | 单文件。**基调：高端实体赌场**（深绿毡/木/铜金/衬线），动画 150–500ms ease-out 禁手游感。⚠️ 历史教训：不要用通配选择器给 .app 子元素设 position——会覆盖悬浮元素的 fixed（v0.2.1 恶性 bug） |

### 存储键（userData/casino-data/*.json）

`settings`（AppSettings）｜`profiles`｜`personas`｜`history`（RoundRecord[]，round=0 为资金事件）｜`matches`｜`achievements`｜`reports`｜`memories`（personaId→{note,turns}，仅 persisted 档）｜`shoe`（ShoeSnapshot）

用户文件：`userData/casino-files/{custom,music,tts-models}`，渲染层经 `casino-asset://` 协议访问。**CSP 在 index.html，新增资源类型记得放行**（v0.2.3 教训：media-src 漏了导致音频全哑）。

## 6. 不可破坏的不变量

1. **防天眼**：任何进 prompt 的信息必须出自 `projectView()`；TableView 类型不得新增隐藏信息字段；投影零泄漏测试必须保持通过
2. **规则拟真**：引擎行为以用户上传的英式文档与真实赌场惯例为准；改赔付先写测试
3. **调用预算**（见上）与 unwrapSpeech：新增任何"纯说话"类 LLM 输出都要过 unwrapSpeech
4. **迁移**：Persona/ApiProfile/AppSettings 加字段 → 同步 core/migrate.ts + presets.migrateSettings，老用户数据不许炸
5. **i18n 同构**：zh.ts 加键，en.ts 必须同步（Dict 类型会在 typecheck 抓住）

## 7. 测试地图（src/__tests__）

`shoe`（完整性/序列化/RNG）｜`hand`｜`sideBets`（全赔率）｜`engine`（基本流程/ENHC/S17H17/加倍/分牌/**BJ vs 三张21 回归**）｜`engine-v2`（预设/保险/偷看/暗牌泄漏/投降/再分/荷官手动抽牌）｜`projection`（零泄漏）｜`orchestration`（json/unwrapSpeech/记忆六档/迁移/统计四块/成就）｜`session`（端到端整局/连局/牌靴恢复/手动模式/保险暴露）。helpers.ts 的 `riggedShoe(['KS','9H',...])` 用于确定性发牌（顺序：每人一张→庄明→每人二张→庄暗）。

## 8. 打包注意

- 本机为 Intel mac；universal 打包依赖显式安装的 `sherpa-onnx-darwin-arm64` + `sherpa-onnx-win-x64`（`npm i --force`，EBADPLATFORM 正常）
- `asarUnpack`：sherpa 全家 + `out/main/ttsWorker.js`
- `assets/` 是 vite publicDir（默认纹理打进 out/renderer）；`buildResources/icon.png` 须 1024² 正方形
- 未签名：mac 需右键打开或 xattr -cr

## 9. 已知薄弱点

- 神经 TTS 运行时（模型下载+首次合成）未在真实环境端到端验证
- 旧历史记录无牌面字段（v1.0 起才记录）
- electron-builder 会把 react/zustand 等 renderer 依赖冗余打进 asar（已被 vite 打包，无害但占体积）

## 10. 网页版 / PWA（src/web）

设计原则：**`src/` 一行不改**。整层渲染代码原本就只通过 `window.casino.*` 触达平台能力（桥类型在 `electron/preload/api.d.ts`，是两端共同契约）；网页目标就是为浏览器再实现一份同构的 `window.casino`。

| 文件 | 职责 / 对应桌面模块 |
|---|---|
| `web/idb.ts` | IndexedDB key-value（库 `casino`/store `kv`），替代 `storage.ts` |
| `web/llm.ts` | 浏览器 fetch 版 chat/models（逻辑移植自 `main/llm.ts`，含 /v1 归一化、JSON 模式 400/422 回退、超时） |
| `web/assets.ts` | 用户文件存 **Cache Storage**（cache 名 `casino-assets`），URL 改为**相对**路径 `casino-asset/<dir>/<file>`，替代 `files.ts` 的 casino-asset:// 协议 |
| `web/data.ts` | 备份导出(浏览器下载)/导入(选文件)，移植 `dataTransfer.ts` 的 ALL_KEYS/按 id 合并逻辑 |
| `web/tts.ts` | 神经 TTS 全部降级失败（自动回落系统语音），`apiTts` 移植为浏览器 fetch |
| `web/platform.ts` | 组装上述模块为 `window.casino` 并 `installWebPlatform()`；仅在桥不存在时安装（不覆盖 Electron） |
| `web/sw.ts` | Service Worker（vite-plugin-pwa injectManifest）：precache app shell + 拦截路径含 `/casino-asset/` 的请求从 Cache 命中 |
| `web/main.tsx` | 网页入口：先装桥 → 注册 SW → 渲染 `App`（镜像 `src/main.tsx`） |

**构建**：`vite.web.config.ts`（纯 vite + react + VitePWA）；入口 `index.web.html`（web 版 CSP：去 casino-asset: scheme、放行 connect-src 直连任意接口），产物经插件改名为 `index.html` 输出到 `docs/`。`docs/` **完全自包含**（index.html / assets / sw.js / manifest / 图标 / textures 全在内，运行期无 docs 外文件依赖），可直接静态托管。

**子路径适配（关键不变量）**：面向 GitHub Pages 项目页（`user.github.io/<仓名>/` 子路径）。**不写死仓名/URL**（便于改项目名）——用 **相对 base（`./`）** + 相对 PWA `scope`/`start_url`（随 manifest 位置解析）+ **相对资产 URL（`casino-asset/...` 无前导 /，随文档基址解析）** + **SW 按子串 `/casino-asset/` 匹配**（非固定前缀）。四者保证任意子路径与根路径下都正确，缺一即断。根路径部署可 `WEB_BASE=/ npm run build:web`。具体发布地址只记在 `README.md`。

**网页端取舍**：神经 TTS 不可用（sherpa-onnx 原生插件）；LLM/TTS 受目标接口 CORS 约束；apiKey 存本地 IndexedDB。

**改 `src/` 时注意**：新增的 `window.casino` 用途必须同时在 `electron/preload` 与 `src/web/platform.ts` 落地，否则网页或桌面一端会缺能力。`web/sw.ts` 因用 WebWorker lib 与 DOM 冲突，已从 `tsconfig.web.json` 排除（由 vite-plugin-pwa 自行编译）。
