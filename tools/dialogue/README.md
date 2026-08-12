# 对白 CLI

权威源：`SourceData/Datas/dialogue.xlsx` + `chat.xlsx`。

```bash
python3 tools/dialogue/dialogue_cli.py status
python3 tools/dialogue/dialogue_cli.py add --json '{"script_id":"quest_1040","name":"任务1040","lines":[{"speaker":"露穗","text":"…"}],"quest_intro":1040}'
python3 tools/dialogue/dialogue_cli.py apply
python3 tools/dialogue/dialogue_cli.py verify
```

Agent 流程见 `.cursor/skills/dialogue-luban/SKILL.md`。
