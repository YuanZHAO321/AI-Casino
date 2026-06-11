# AI Blackjack — AI 陪玩21点 🂡

> 一个拟真实体21点的桌面应用：接入任意 OpenAI 兼容 LLM API，让 AI 扮演你的**牌桌对手**和**贴身陪玩**。第一个游戏：英式 21 点（Blackjack）。
>
> A Blackjack-simulation desktop app where LLM-powered characters play **against** you and **alongside** you. First game: UK-style Blackjack.

![Electron](https://img.shields.io/badge/Electron-React%20%2B%20TS-2ea44f) ![Tests](https://img.shields.io/badge/tests-77%20passed-brightgreen) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)

## ✨ 特性

### 牌桌
- **严格英式21点规则**：无暗牌（庄家先发一张明牌）、庄家 17 停牌（S17/H17 可切）、BJ 赔 3:2、加倍/分牌（不可再分、分 A 的 21 不算 BJ）、ENHC 结算
- **三种边注**：21+3（9:1）、Pairs（5:1 / 12:1 或 10:1 / 30:1）、Top 3（90/180/270:1）
- **真随机牌靴**：CSPRNG（`crypto.getRandomValues`）+ Fisher–Yates；1–8 副牌可配，每副严格 52 张不重不漏，切牌渗透率可调——**记牌玩家友好**，界面实时显示已发牌数
- 台注限红 £10–£1000，起始资金 £1000，破产可重新买入（计入历史）

### AI 角色
- **对手位（0–4）**：AI 用自己的筹码下注、决策、说垃圾话；你可以给它留言，影响它下一手的心态
- **陪玩位（0–3）**：看你的视角，概率自动吐槽，一键「吐槽」/「建议」，随时自由聊天
- **荷官**：纯发牌机器，或开启每轮/概率评论与结算播报
- **人格自定义**：简单模式直接写角色设定（如二次元角色），高级模式自定义完整 prompt；游戏规则层与输出格式层由系统锁定
- **多 API 接口**：OpenAI 兼容面板（baseURL + key + 模型名，可自动拉取模型列表），每个角色可绑定不同接口/模型；另有**本地基本策略机器人**（无需 API 即可游玩）

### 架构保证：禁止开天眼 🚫👁
所有 AI 的输入都经过 `projectView()` 投影层，**类型层面不存在**牌靴与未发牌字段——AI 只能看到一个真实玩家在桌边能看到的东西（各家明牌、注额、本靴已发牌汇总）。有单元测试断言投影序列化结果零泄漏。「记牌能力」是人格开关：明牌本来人人可见，记牌是合法的。

### 计费友好
- 一次调用完成多件事：行动+台词同一次；结算宣言+下局注额同一次
- 玩家留言/AI 桌聊并入角色下一次调用，零额外调用
- 三种记忆模式（持久/会话/每局重置）+ 手动压缩记忆/开新会话
- 关闭说话或结算宣言可进一步省 token/调用

### 其他
- 跨局持久化：对局历史（含各方结算宣言+你的结算笔记，可逐条删除）、内置胜率统计（全局 + 每个「人格@模型」）、一键 AI 生成战绩分析报告
- 玩家习惯记忆（可选）：记录你的每个决策 vs 基本策略
- 成就系统、AI 桌聊（角色互相看到对方发言）、中英双语 UI
- 非法操作兜底：劣质模型输出不合法操作时自动按基本策略执行并标记

## 🚀 开始

```bash
npm install
npm run dev        # 开发模式
npm test           # 运行 77 个单元/端到端测试
npm run dist:mac   # 打包 macOS（universal dmg）
npm run dist:win   # 打包 Windows（NSIS x64）
```

首次打开即可用内置「本地基本策略机器人」直接游玩。要启用 AI 角色：

1. 顶栏「API 接口」→ 填 baseURL / API Key →「获取模型列表」或手填模型名
2. 「角色」→ 选择角色 → 把「使用接口」从本地机器人切到你的 API
3. 「设置」→ 勾选上桌的对手/陪玩/荷官 →「应用并重开牌桌」

## 🏗 架构

```
electron/main/          主进程：LLM 客户端（CORS 免疫、key 不进渲染层）、JSON 持久化、IPC
src/core/               平台核心（游戏无关）：CSPRNG、牌靴、人格、记忆、统计、成就、GameModule 契约
src/games/blackjack/    21 点模块：规则引擎、边注、基本策略、视角投影、prompt 预设、会话编排器
src/ui/                 React UI：拟真21点牌桌（SVG 扑克）、配置面板、历史/统计/报告、i18n
```

平台核心与游戏模块通过 `GameModule` 接口解耦（`getLegalActions / applyAction / projectView / fallbackAction`）。新增游戏 = 实现该接口 + 一套 prompt 预设，AI 编排、人格、记忆、统计全部复用。

## 📜 规则来源

严格实现英国21点标准 Blackjack 规则（含 21+3 / Pairs / Top 3 边注赔率表）。庄家无暗牌；保险与投降不存在于该规则集，故不提供。

## License

MIT
