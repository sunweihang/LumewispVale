# 微光溪谷 · 对话稿（序章 + 第一章 + 第二章）

> 运行时由 `StoryDialogue` + `DialoguePanel` / `StoryIntroPanel` 播放；`GameState.seenDialogue` 去重。  
> 点击屏幕推进；对话中锁定移动。开场插画为打字机旁白（打印字）。  
> **农场新手引导全部由露穗口述**（甜蜜、陪伴感）；箭头镂空仍由 `TutorialGuide` 负责。

## 流程

```
开场插画 origin_story → 自由走动 + 箭头点露穗 → 露穗唤醒（wake_farm）
  → 镂空教程（任务→手→拔草）→ 露穗领后续（领奖后下一句）→ 路牌进镇
  → 抵达小镇 → 镇长的茶 → 公告板 → 木工坊 → 社区钟楼 → 章末信件
  → 市集购买 → 市集出售 → 春厅立项 → 诊所叮嘱 → 矿脉商会 → 浅层矿洞采铜 → 春厅点亮 → 第二章信件
```

## 脚本 ID

| ID | 触发 | 要点 |
|----|------|------|
| `origin_story` | 农场开局且任务 1001（优先于醒来） | 5 格插画 + 打字机旁白：决战重伤 → 失忆风暴 → 露穗相救 → 农场同居 |
| `wake_farm` | 点击农场 `npc_girl`（任务 1001 且尚未开始 `guide_wake_yard`） | 露穗温柔叫醒、安顿农庄；**开局不自动播**；对话中露穗停步面向玩家；结束后镂空引导：任务 → 手 → 拔草 |
| `guide_wake_yard` | `wake_farm` 对话结束后 | 镂空新手引导（`TutorialGuide`，去重）；**标记前**自由走动、不拦操作、仅软箭头指露穗；**标记后**才拔草强制引导 |
| `quest_1002`…`1007` / `1009` | 领奖后进入对应任务 | 露穗甜蜜口述下一动作；钓完后指路进镇 |
| `girl_chat` | 点击农场 `npc_girl`（闲聊） | 可重复的短甜蜜句 |
| `arrive_town` | 首次进入 Town | 路人指镇长府 |
| `mayor_tea` | 进镇长府室内点 `npc_mayor`（主线 1010） | 定居许可 + 本章待办（先认镇子，买卖后置） |
| `quest_1011`…`1013` | 领奖后进入 | 公告板 / 木工 / 钟楼 |
| `carpenter_nails` | 点击木工坊（主线） | 石楠指引社区中心 |
| `community_bell` | 点击社区中心（主线 1013） | 第二章钩子 |
| `ch1_done` | 领取 1013 后（进入 1020） | 镇长信件：先去市集买卖 |
| `quest_1020`…`1021` | 领奖后进入 | 购买 / 出售 |
| `quest_1022`…`1027` | 领奖后进入 | 立项 / 诊所 / 商会 / 进矿 / 采铜 / 送铜 |
| `spring_pack` | 社区中心（主线 1022） | 签字立项 |
| `clinic_advice` | 微光诊所（主线 1023） | 医生·荷叶叮嘱 |
| `spring_light` | 社区中心（主线 1027） | 交付铜矿、点亮春厅 |
| `ch2_done` | 领取 1027 后 | 镇长信件：南路/海滩后话 |

## 角色（本阶段）

| 显示名 | 出场 |
|--------|------|
| （旁白） | 开场插画、钟楼氛围、春厅点亮 |
| 露穗 | 农场全部教程对话 + 可点击闲聊；节点 `npc_girl` |
| 你 | 小镇侧偶发确认 |
| 路人 | 进镇一句 |
| 镇长·艾岚 | 镇长府 + 章节信件 + 春厅字条 |
| 工匠·石楠 | 木工坊 |
| 医生·荷叶 | 诊所（暂无立绘，纯对话框） |

## 工程

- 开场插画：`assets/scripts/game/StoryIntroPanel.ts`（贴图 `assets/textures/story/`，UUID 表 `StoryIntroFrames.ts`）
- 开场音效：`StoryIntroAudio.ts` — SpaceCard 序章轨（决战/风暴 `storyThemeAlert` + 第 3 页落雷；农场苏醒切 `storyThemeCalm`，序章结束后宁静轨继续在主场景循环；资源在 `assets/resources/audio/story/`）
- 导入脚本：`tools/ui/import_story_intro.py`（源图在 `tools/ui/ai-source/story-*.png`）
- 露穗帧：`assets/textures/chars/girl/` ← `tools/ui/slice_npc_walk_sheet.py girl`
- 农场生成：`FarmWorldLayout.spawnNpcs`（小屋前廊南侧）
- 日常对话 UI：`assets/scripts/game/DialoguePanel.ts`
- 编排：`assets/scripts/game/StoryDialogue.ts`（`tryFarmNpc`）
- 接线：`GameBootstrap`（农场点击优先露穗）/ `StoryWorldHooks`（路牌）/ 小镇建筑 `tryBuilding`
- 商店买卖：`TownShopPanel`（购买 / 出售页签；出售记 `shop_sell`）

## 开场操作

- 打字中点击：立刻显示整句
- 整句出完再点：下一格；序章插画结束后自由走动，箭头引导点击露穗 → `wake_farm`
- 右上角「跳过」：立刻结束序章插画（与播完相同，仍走 `onDone`）
- 露穗对话期间：`NpcAnimator.holdPatrol` + 面向玩家；对话结束 `releasePatrol`
