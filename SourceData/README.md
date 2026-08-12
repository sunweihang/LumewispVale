# Luban 配置表（Lumewisp Vale）

权威源：**`SourceData/Datas/*.xlsx`**（鲁班 Excel）。  
改表 → `npm run gen:config` → 生成 `schema.ts` + `assets/resources/config/*.json`。

不要手改 JSON；不要用脚本覆盖 Excel。

## 表

| Excel | 表名 | 说明 |
|---|---|---|
| `quest.xlsx` | `TQuest` | 主线任务（条件、奖励、`next_id`、接取/完成对白、章节、解锁地图） |
| `dialogue.xlsx` | `TDialogue` | 对白脚本目录（`id`=storyId/chatId，`script_id`，`kind`） |
| `chat.xlsx` | `TChat` | 对白台词行（按 `dialogue_id`+`seq`；序章填 `image` UUID） |
| `craft_recipe.xlsx` | `TCraftRecipe` | 合成配方（产出、耗时、`unlock_quest` / `unlock_mode`） |
| `craft_cost.xlsx` | `TCraftCost` | 合成消耗（按 `recipe_id`） |
| `condition.xlsx` | `TCondition` | 条件模板 |
| `goto.xlsx` | `TGoto` | 引导动作与提示 |
| `flag.xlsx` | `TFlag` | 剧情旗标显示名 + 可选解锁地图 |
| `item.xlsx` | `TItem` | 物品显示名 |
| `__enums__.xlsx` | 枚举 | `ConditionType` / `GotoAction` 等 |
| `__tables__.xlsx` | 表注册 | Luban 表清单 |

### `quest.xlsx` 扩展列

`intro_script` · `outro_script` · `chapter`（`farm`/`town`/`market`/`spring`）· `unlock_map`（`town`/`mine`…）

`intro_script` / `outro_script` 填 `TDialogue.script_id`（如 `quest_1002`、`ch1_done`）。

### `dialogue.xlsx` / `chat.xlsx`

| 表 | 关键列 |
|----|------|
| `TDialogue` | `id`（10001+，=剧情图 StartChat）、`script_id`、`kind`（`dialogue`/`intro`）、`name` |
| `TChat` | `id`、`dialogue_id`、`seq`、`speaker`（空=旁白）、`text`、`image`（序章 SpriteFrame UUID，日常对白留空） |

运行时：`DialogueScripts` 读表 → `StoryRuntime` / `StoryDialogue` 播放。  
**新增/改对白**：用 `python3 tools/dialogue/dialogue_cli.py`（见 `.cursor/skills/dialogue-luban/SKILL.md`），不要手改 JSON。

### `craft_recipe.xlsx` 解锁列

- `unlock_quest`：任务 ID，`0` = 常驻  
- `unlock_mode`：`reached`（进行中或已完成）/ `completed`（领取后）

## 生成

```bash
npm run gen:config
```

输出：

- `assets/scripts/cfg/schema.ts`
- `assets/resources/config/t*.json`
