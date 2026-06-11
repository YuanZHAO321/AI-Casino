# 图片资产生成指南（ChatGPT Images 2.0）

应用**无图也能正常运行**（CSS 渐变兜底已内置）。以下图片为氛围增强项，按提示词生成后放到指定路径，然后告诉 Claude 收尾接线（把图接进样式/打包配置）。

> 通用要求：写实摄影/材质质感，**不要**卡通、不要游戏 UI 风、不要文字水印。

---

## 1. 应用图标（必须，打包需要）

**路径**：`buildResources/icon.png`（1024×1024，PNG 透明底）

> A luxurious casino app icon: a single ace of spades playing card crossed with a golden poker chip, on a deep emerald-green felt circle with brass/gold rim, dark background, realistic materials, soft studio lighting, no text, centered, flat front view, 1024x1024.

生成后由 Claude 转换出 `icon.icns`（mac）与 `icon.ico`（win）。

## 2. 毡面纹理（可选）

**路径**：`assets/textures/felt.jpg`（≥1600×1000，可平铺更佳）

> Seamless dark emerald green casino table felt texture, fine wool fabric weave, subtle vignette lighting from above, photorealistic macro detail, no objects, no text, tileable.

## 3. 环境背景（可选）

**路径**：`assets/textures/ambience.jpg`（≥2560×1440）

> Blurred high-end casino interior at night as a background: warm amber chandelier bokeh, dark mahogany wood and brass accents, deep shadows, cinematic depth of field, moody and luxurious, no people in focus, no text.

## 4. 人格头像（可选，每个 512×512）

**路径**：`assets/avatars/<personaId>.png`（如 `persona-rival-1.png`）

预设角色参考提示词（也可按你自定义的角色自行修改）：

- **远坂时音（对手）**
  > Anime-style portrait of an elegant blonde twin-tail young lady in a black evening dress at a casino table, confident smirk, holding playing cards, warm candlelight, dark green felt background, bust shot, high quality illustration, no text.
- **老周（对手）**
  > Portrait of a weathered Chinese man in his 60s wearing an old brown suit and fedora, faint knowing smile, cigarette smoke, dim casino lighting, photorealistic, bust shot, no text.
- **小鸢（陪玩）**
  > Cheerful anime girl with short brown hair and amber eyes, leaning forward excitedly with sparkling eyes, casual hoodie, casino table bokeh background, warm lighting, bust shot, high quality illustration, no text.
- **Victor（荷官）**
  > Portrait of a refined British casino dealer in his 40s, white gloves, black vest and bow tie, composed subtle smile, standing behind a blackjack table, warm low-key lighting, photorealistic, bust shot, no text.

## 5. 牌背花纹（可选）

当前牌背为程序化 SVG（绿底金点阵）。如想要更精致的：

**路径**：`assets/textures/card-back.png`（640×930）

> Ornate playing card back design: deep emerald green background with intricate gold filigree symmetrical pattern, thin gold border frame, art deco style, flat vector-like illustration, no text, 2:2.9 aspect ratio.

---

## 落位总结

| 图 | 路径 | 必要性 |
|---|---|---|
| 应用图标 | `buildResources/icon.png` | 打包需要 |
| 毡面纹理 | `assets/textures/felt.jpg` | 可选 |
| 环境背景 | `assets/textures/ambience.jpg` | 可选 |
| 头像 | `assets/avatars/<personaId>.png` | 可选 |
| 牌背 | `assets/textures/card-back.png` | 可选 |

全部放好后，把这份清单发给 Claude：「图片已放好，请收尾接线」。
