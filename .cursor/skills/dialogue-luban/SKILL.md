---
name: dialogue-luban
description: >-
  Add or edit Lumewisp Vale story dialogue via Luban Excel (dialogue.xlsx / chat.xlsx)
  using tools/dialogue/dialogue_cli.py. Use when adding 对白/对话/台词, quest intro_script,
  chat lines, origin_story intro pages, or regenerating story graphs for StartChat.
---

# 对白 Luban（低 token）

**禁止**打开/通读 `DialogueScripts.ts`、整表 Excel、或手改 `t*.json`。  
**只跑 CLI**；用户给齐台词后尽量一轮结束。

## 命令（仓库根目录）

```bash
python3 tools/dialogue/dialogue_cli.py status          # 下一个 id
python3 tools/dialogue/dialogue_cli.py template         # JSON 模板
python3 tools/dialogue/dialogue_cli.py add --json '...' # 写入 Excel
python3 tools/dialogue/dialogue_cli.py apply            # gen:config + 剧情图
python3 tools/dialogue/dialogue_cli.py verify
python3 tools/dialogue/dialogue_cli.py show <script_id>
```

npm：`npm run dialogue:status` / `dialogue:apply` / `dialogue:verify`

## 新增流程（照做）

1. `status` → 记下 `next_dialogue_id`（一般不用手填 id）。
2. 向用户要齐：`script_id`、`name`、每句 `speaker`+`text`；若挂任务要 `quest_intro` / `quest_outro` 数字 id。
3. `add --json`（一行 JSON，见下）。成功应打印 `OK id=…`。
4. `apply` → `verify`。
5. **触发接线**（二选一，勿两边都漏）：
   - 任务接取/完成：JSON 里带 `"quest_intro": 1040` 或 `"quest_outro": 1040`（写 `quest.xlsx`）。
   - 建筑/NPC 特例：才改 `StoryDialogue.ts` 的 `BUILDING_STORY` / `try*`（少数）；任务线不要改 TS。

## add JSON（最小）

```json
{
  "script_id": "quest_1040",
  "name": "任务1040",
  "kind": "dialogue",
  "lines": [
    {"speaker": "露穗", "text": "第一句"},
    {"speaker": "", "text": "旁白（speaker 空字符串）"}
  ],
  "quest_intro": 1040
}
```

- `kind`：`dialogue`（对话框）| `intro`（序章插画；每行必填 `image` = SpriteFrame uuid）。
- 覆盖已有脚本：加 `"replace": true`（重写该 `script_id` 的 chat 行）。
- 可选 `"id": 10036` 指定 dialogue id；默认用 `next_dialogue_id`。

## 表分工（勿再解释给自己听）

| 表 | 一行 |
|----|------|
| `dialogue.xlsx` | 一段脚本：`id`(=StartChat)、`script_id`、`kind`、`name` |
| `chat.xlsx` | 一句台词：`dialogue_id`+`seq`+`speaker`+`text`(+`image`) |

## 自检

- [ ] `verify` 退出码 0  
- [ ] 任务引用已写（或明确是建筑/代码触发）  
- [ ] 未手改 `assets/resources/config/tchat.json` / `tdialogue.json`

剧情图节点细节见 `story-graph-authoring`（本 skill 的 `apply` 已生成默认 Lock→StartChat→Unlock→End）。
