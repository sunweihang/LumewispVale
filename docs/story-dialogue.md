# 微光溪谷 · 对话稿（序章 + 第一章）

> 运行时由 `StoryDialogue` + `DialoguePanel` 播放；`GameState.seenDialogue` 去重。  
> 点击屏幕推进；对话中锁定移动。

## 流程

```
农场醒来 → 生存教程（领奖后旁白）→ 紫晶异象 → 路牌进镇
  → 抵达小镇 → 镇长的茶 → 购物 / 公告板 → 木工坊 → 社区钟楼 → 章末信件
```

## 脚本 ID

| ID | 触发 | 要点 |
|----|------|------|
| `wake_farm` | 农场开局且当前任务 1001 | 继承农庄、先清杂草；结束后镂空引导：任务 → 手 → 拔草 |
| `guide_wake_yard` | `wake_farm` 结束后 | 镂空新手引导（`TutorialGuide`，去重） |
| `quest_1002`…`1009` | 领奖后进入对应任务 | 下一动作口述引导 |
| `meteor_inspect` | 靠近紫晶陨石 | 异象确认、指路进镇 |
| `arrive_town` | 首次进入 Town | 路人指镇长府 |
| `mayor_tea` | 点击镇长府（主线） | 定居许可 + 本章待办 |
| `quest_1011`…`1014` | 领奖后进入 | 商店 / 公告板 / 木工 / 钟楼 |
| `carpenter_nails` | 点击木工坊（主线） | 石楠指引社区中心 |
| `community_bell` | 点击社区中心（主线） | 第二章钩子 |
| `ch1_done` | 领取 1014 后 | 镇长信件收束 |

## 角色（本阶段）

| 显示名 | 出场 |
|--------|------|
| （旁白） | 醒来、陨石、钟楼氛围 |
| 你 | 自言自语式目标确认 |
| 路人 | 进镇一句 |
| 镇长·艾岚 | 镇长府 + 章末信 |
| 工匠·石楠 | 木工坊 |

## 工程

- UI：`assets/scripts/game/DialoguePanel.ts`
- 编排：`assets/scripts/game/StoryDialogue.ts`
- 接线：`GameBootstrap`（点击优先对话）/ `StoryWorldHooks`（陨石）/ 小镇建筑 `tryBuilding`
