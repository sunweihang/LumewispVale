# Luban 配置表（Lumewisp Vale）

与 SLG GameClient 同源的 Luban 管线：Excel → TypeScript + JSON。

## 表

| 表 | 说明 |
|---|---|
| `TCondition` | 条件模板（数据源 / 比较 / 描述 / 默认 Goto） |
| `TGoto` | 引导动作（选工具、开面板、提示文案） |
| `TQuest` | 主线任务链（条件实例 + 奖励 + next_id） |
| `TCraftRecipe` | 合成配方 |
| `TCraftCost` | 合成消耗（按 recipe_id 挂接） |

## 生成

```bash
npm run gen:config
# 或
bash tools/luban/gen.sh
```

输出：

- 代码：`assets/scripts/cfg/schema.ts`
- 数据：`assets/resources/config/*.json`

改表后务必重新生成再进游戏。
