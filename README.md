# AI Casino — AI 陪玩赌场 🂡

> 拟真实体赌场风格的桌面应用：接入任意 OpenAI 兼容 LLM API，让 AI 扮演你的**牌桌对手**和**贴身陪玩**。从赌场大厅进入，第一个项目：21 点（英式 / 欧式 / 美式 Vegas 规则）。
>
> A casino-simulation desktop app where LLM-powered characters play **against** you and **alongside** you. First game: Blackjack (UK / European / Vegas rules).

![Electron](https://img.shields.io/badge/Electron-React%20%2B%20TS-2ea44f) ![Tests](https://img.shields.io/badge/tests-116%20passed-brightgreen) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Web%20PWA-blue)

> 同一套核心代码，两个发行目标：**Electron 桌面版** 与 **网页版 / PWA**（可安装、离线可开、GitHub Pages 静态托管）。

## ✨ 特性

### 牌桌与规则
- **三套规则预设 + 自定义**：
  - **英式 UK**（默认）：无暗牌、任意前两张加倍、仅分一次、S17
  - **欧式 European**：ENHC、双倍限硬 9-11、分 A 一张、无 DAS
  - **美式 Vegas**（完全拟真）：**暗牌+偷看+保险 2:1+Late Surrender**、H17、可再分至 4 手
  - 自定义模式暴露全部开关（H17、DAS、分A、双倍限制、分牌上限、渗透率…）
- **三种边注**：21+3（9:1）、Pairs（5/12或10/30:1）、Top 3（90/180/270:1）
- **真随机牌靴**：CSPRNG + Fisher–Yates，1–8 副牌每副严格 52 张不重不漏；**牌靴可跨重启保存**（不洗就一直同一靴）或每次新靴，随时手动换靴——记牌玩家友好
- **拟真下注**：3D 筹码（真实赌场配色，可自定义）、单击入等候区/双击直押/拖拽下注、Repeat Bet / Clear / All In、桌面筹码堆一眼看清各家身价与押注
- **发牌沉浸**：桌角发牌靴（真实牌背图）、飞牌动画、暗牌以牌背扣在桌上、揭示翻转动画

### AI 角色
- **对手位（0–6，含你最多 7 人同桌，顺位可自由排序）**：AI 自主下注/决策/说垃圾话，可留言影响它心态
- **陪玩位（0–3，悬浮小窗贴身聊天）**：看你的完整视角（手牌+资金+盈亏），概率吐槽、一键吐槽/建议、自由聊天
- **荷官**：发牌机器或 AI 评论/结算播报；可选**模型决策抽牌**（保持人设，规则强制兜底）+ 逐张抽牌播报
- **每角色三模型槽**：快速（出牌/宣言/吐槽）/ 推理（聊天/建议/分析）/ 备用（失败自动切换）；多接口多**模型池**自由组合
- **记忆六档**：无 / 本局 / 本场 / 本次打开 / 永久 / 手动管理 ＋ 历史感知三档（无/摘要/详细）＋ 手动压缩/新会话
- **手动节奏模式**：每次 AI 思考由你点按钮触发，自己掌控牌局节奏

### 场次体系
大厅 → 选游戏 → **继续上一场 / 新开一场**（可命名，默认自动命名）。一场含多局，历史按 场→局 分组管理；启动行为可设为询问/自动继续/总是新开。

### 防天眼架构 🚫👁
所有 AI 输入必经 `projectView()` 投影：类型层面不存在牌靴；**美式暗牌在揭示前对 AI（和已发牌汇总）完全不可见**——有专门的零泄漏单测。记牌是人格开关（只注入本就公开的明牌汇总）。

### 语音与音乐
- **TTS 三引擎**：神经 TTS（sherpa-onnx，kokoro 多音色 / melo 中英模型，应用内下载或**本地导入**离线包）、系统语音（零安装）、OpenAI 兼容 TTS API；每角色独立音色；首次启动向导保证开箱即用
- **BGM**：上传本地音乐，循环/音量管理（曲目获取建议见 `MUSIC.md`）

### 数据
- **四块统计**：玩家（胜率/盈亏/BJ/爆牌/投降/基本策略一致率）、**赌场**（house 盈亏/抽水率/走势）、按角色（跨模型）、按模型（跨角色）
- **AI 报告** + **角色分析师对话**：每个角色（含玩家）一键生成出牌风格/流派/盈亏分析，可持续追问
- 玩家习惯记忆、12 个成就、结算宣言与个人结算笔记全持久化、外观全自定义（纹理上传/背景模糊暗度/筹码配色/头像）
- **数据导出/导入**：一键备份全部数据（含自定义图片）跨设备转移；BGM 正版歌单推荐见 `MUSIC.md`

### 计费友好
行动+台词一次调用；宣言+下局注额一次调用；留言/桌聊零额外调用；记忆与感知分档控 token；非法输出自动按基本策略兜底（并告知 AI 被修正）。

## 🚀 开始

```bash
npm install
npm run dev        # Electron 开发（内置本地基本策略机器人，无 Key 可玩）
npm test           # 116 个单元/端到端测试
npm run dist:mac   # 打包 macOS（universal dmg）
npm run dist:win   # 打包 Windows（NSIS x64）
```

启用 AI 角色：「API 接口」填 baseURL/Key → 拉取模型勾入**模型池** → 「角色」绑定快速/推理/备用模型 → 「设置」选座排序 → 应用并重开牌桌。

### 🌐 网页版 / PWA

同一套 `src/` 渲染层，浏览器侧用 `src/web/` 提供 `window.casino`（LLM 走浏览器 fetch、存储用 IndexedDB、用户文件用 Cache Storage、Service Worker 提供离线与资产服务）。

```bash
npm run dev:web      # 网页开发服务器（含 PWA 热更新）
npm run build:web    # 产物输出到 docs/（完全自包含，可直接静态托管）
npm run preview:web  # 本地预览构建产物
```

**部署目标**：`https://yuanzhao321.github.io/AI-Casino/`。`docs/` 是自包含的完整站点——只把 `docs/` 的内容托管到该路径即可运行（无外部文件依赖）。

**GitHub Pages（项目页，从 `/docs` 目录）**：仓库 Settings → Pages → Source 选 `Deploy from a branch` → 分支 `main` + 目录 `/docs` → 保存。`build:web` 用**相对 base**（不写死仓名，改项目名也无需改构建），自动适配 `.../<仓名>/` 子路径。
- **部署到根路径**（自定义域名/用户页）：`WEB_BASE=/ npm run build:web`。

**网页版与桌面版的差异**：
- LLM/TTS 由浏览器直连你填写的接口（apiKey 存本地 IndexedDB）——目标接口须允许浏览器 **CORS**（OpenAI 官方端点默认不允许，需 CORS-friendly 网关/兼容服务）。
- **神经 TTS（sherpa-onnx）不可用**（原生组件）；保留系统语音(Web Speech)与 API TTS。
- 数据导出/导入走浏览器下载/选择文件；用户文件存浏览器，跨设备迁移用导出包。

## 🏗 架构

```
electron/main/          桌面主进程：LLM/TTS 客户端、casino-asset 协议、文件导入、模型下载、TTS 工作进程
src/core/               平台核心（游戏无关）：CSPRNG、牌靴(可序列化)、人格、记忆、统计、成就、迁移、GameModule 契约
src/games/blackjack/    21 点模块：规则引擎(三预设)、边注、基本策略(含投降/保险)、视角投影、prompt、会话编排
src/ui/                 React UI：大厅、拟真牌桌、悬浮陪玩、全部管理面板、i18n(zh/en)
src/web/                网页平台适配器：浏览器版 window.casino（idb/llm/assets/data/tts）+ Service Worker + PWA 入口
```

`window.casino` 桥是平台抽象的唯一接缝：Electron 由 `electron/preload` 提供，网页由 `src/web/platform.ts` 提供，`src/` 其余代码两端共用、零改动。

新增游戏 = 实现 `GameModule` 接口 + prompt 预设；AI 编排、人格、记忆、统计、场次全部复用。

## 📚 文档

| 文档 | 内容 |
|---|---|
| [`RELEASE.md`](RELEASE.md) | v1.0.0 发布说明（特性/安装/已知限制） |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 项目介绍与代码地图（维护必读：进程模型/IPC/存储键/不变量/测试地图） |
| [`GAME-PROTOCOL.md`](GAME-PROTOCOL.md) | 新玩法接入协议（GameModule 契约/编排复用/验收清单） |
| [`ASSETS.md`](ASSETS.md) / [`MUSIC.md`](MUSIC.md) | 图片资产 / 音乐推荐 |

## License

MIT
