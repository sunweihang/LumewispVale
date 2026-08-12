# 节点图扩展套件（自后室项目迁移）

来源：`/Users/CreativeCenter/TikTokMiniGames/oops-framework-master/extensions`

Cocos Creator **3.8.8** 项目扩展，与后室生存同一套节点图工具链。

## 扩展列表

| 扩展 | 作用 |
|------|------|
| `node-graph` | 通用节点图画布（其它业务扩展依赖它） |
| `battle-manager` | Game 编辑器宿主（菜单：扩展 → Game编辑器） |
| `skill-editor` | 技能图 → 导出 `TsAbility` |
| `ballistic-editor` | 弹道图 → 导出 `TsBallistic` |
| `modifier-editor` | Buff 图 → 导出 `TsModifier` |
| `story-editor` | 剧情图 → 导出 `TsStory` |
| `unit-editor` | 单位资产浏览/创建 |
| `scene-editor` | 关卡/场景资产与刷怪配置 |
| `effect-editor` | 特效资产 |
| `effect-preview` | 特效预览 |
| `ui-bind` | UI 绑定辅助 |

节点字段手册：[`editor-nodes-reference.html`](./editor-nodes-reference.html)

## 启用

1. 各扩展已 `npm install` + `npm run build`（改源码后在对应目录再 `npm run build`）。
2. Creator：**扩展 → 扩展管理器 → 项目**，启用上表扩展（至少 `node-graph` + `battle-manager` + 你要的业务编辑器）。
3. **扩展 → Game编辑器 → 打开**，或各编辑器自己的菜单。

一键重编译：`扩展 → Game编辑器 → 一键编译并刷新全部扩展`。

## 约定路径

| 用途 | 路径 |
|------|------|
| 技能图 | `assets/resources/skill-graphs/{id}/` |
| 弹道图 | `assets/resources/ballistic-graphs/{id}/` |
| Buff 图 | `assets/resources/modifier-graphs/{id}/` |
| 剧情图 | `assets/resources/story-graphs/{id}/` |
| 剧情生成 TS | `assets/scripts/story/generated/`（`story-editor` `paths.ts` 已对齐） |
| 其它生成 TS | 部分扩展仍写 `assets/Scripts/src/.../generated/`（技能等） |

剧情运行时已迁入：`assets/scripts/story/`（`AbsStory` / `StoryRuntime` / `DialogueScripts`）。主线 `10001`–`10035` 由 `tools/story/generate_dialogue_stories.mjs` 生成；`StoryDialogue` 经 `StoryRuntime.play` 播图。

## Cursor Skills

- `.cursor/skills/skill-graph-authoring/`
- `.cursor/skills/story-graph-authoring/`
