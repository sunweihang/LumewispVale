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
| `item.xlsx` | `TItem` | 基础物品表（类型 / 名 / display_id / 堆叠 / 描述 / GM） |
| `display.xlsx` | `TDisplay` | 展示配置（按 `link_id`=`display_id` 挂多条叠加） |
| `display_template.xlsx` | `TDisplayTemplate` | 展示模板（堆叠 / 品质框 / 图标展示…） |
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

### 道具 = 基础表 + 展示表（对齐 SLG / GameClient）

```
TItem.display_id ──► TDisplay.link_id  (一对多叠加)
                         │
                         └─ display_template_id ► TDisplayTemplate
```

**`item.xlsx`（基础，薄表）**

| 列 | 说明 |
|----|------|
| `id` | 字符串主键（`hoe` / `wood` / `gold`…） |
| `type` | `ItemType` |
| `name` / `desc` | 显示名、描述 |
| `display_id` | 关联 `TDisplay.link_id` |
| `use_condition_id` / `use_effect_id` | 使用条件 / 效果（`0`=无，预留） |
| `max_stack` | 逻辑堆叠上限 |
| `gm_grant` / `gm_amount` / `sort` | GM 与排序 |

**`display.xlsx`（每个道具可挂多条；没有的叠加就不要挂）**

| 列 | 说明 |
|----|------|
| `id` | 展示行主键 |
| `display_template_id` | 1 堆叠 / 4 品质框 / **11 图标** / **12 售价**… |
| `param` | JSON；图标 `{"icon","kind"}`；售价 `{"price":35,"currency":"gold"}` |
| `num` | 模板数值（堆叠上限显示、品质等级；售价也可冗余写 price） |
| `link_id` | = 对应物品的 `display_id` |

- **售价不在 `TItem`**：不是每个道具都能卖，货币也不一定是金币 → 用模板 12；无此行 = 不可出售。  
运行时：`ItemCatalog.itemSell` / `itemIcon` / `itemKind`…

## 生成

```bash
npm run gen:config
```

输出：

- `assets/scripts/cfg/schema.ts`
- `assets/resources/config/t*.json`
