# Design Tokens — Lumewisp Vale

## 画布

| Token | 值 |
|-------|-----|
| `designSize` | 1080×1920 |
| `runtimeSize` | 1080×1920（本项目设计分辨率 = 设计稿） |
| `pixelRatio` | 1（贴图按逻辑 px 直出；需要更清晰时再出 2x） |
| `orientation` | portrait |
| `tileSize` | 64 |

## 世界色板（牧场 / 夜景）

| Token | Hex | 用途 |
|-------|-----|------|
| `world.grass` | `#3A7A3A` | 草地底 |
| `world.grassDark` | `#2A5A2A` | 草地阴影 / 夜调 |
| `world.dirt` | `#D29E2A` | 土路（金赭，对齐 Stardew 参考） |
| `world.stone` | `#6A6E76` | 石砖广场 |
| `world.water` | `#2A5A9A` | 河水 |
| `world.waterEdge` | `#5A9AD0` | 水岸波纹 |
| `world.cliff` | `#7A5A3A` | 悬崖立面 |
| `world.nightTint` | `#0A1420` @ 35% | 夜色叠层（可选） |
| `world.lampGlow` | `#F0D080` | 路灯光斑 |
| `world.windowGlow` | `#F8E090` | 窗光 |

## UI 色板（后续 HUD）

| Token | Hex | 用途 |
|-------|-----|------|
| `color.bg` | `#1A2420` | 安全底 |
| `color.surface` | `#2E3A32` | 面板 |
| `color.primary` | `#6B9E4A` | 主按钮（叶绿） |
| `color.secondary` | `#C4A35A` | 次强调（麦金） |
| `color.danger` | `#B85A4A` | 破坏性 |
| `color.text` | `#F2EDE0` | 主文案 |
| `color.textMuted` | `#A8A090` | 次文案 |
| `color.stroke` | `#1A1814` | 描边 |
| `color.dimmer` | `#000000` @ 55% | 弹窗遮罩 |

## 圆角与描边（UI）

| Token | design px |
|-------|-----------|
| `radius.panel` | 24 |
| `radius.btn` | 20 |
| `radius.sm` | 12 |
| `stroke.width` | 3 |

## 控件默认尺寸（design px）

| 控件 | W×H |
|------|-----|
| 主按钮 | 920×120 |
| 次按钮 | 920×104 |
| 图标 cell | 96×96 |
| 顶栏高 | 160 |
| 底栏高 | 200 |
