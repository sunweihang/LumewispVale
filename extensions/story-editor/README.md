# story-editor

剧情图编辑器。依赖通用图引擎 [`node-graph`](../node-graph/)，导出 **TsStory{id}**，运行时由 [`StoryRuntime`](../../assets/Scripts/src/story/StoryRuntime.ts) + [`AbsStory`](../../assets/Scripts/src/story/AbsStory.ts) 驱动。

## 启用

1. 启用 **node-graph**
2. `cd extensions/story-editor && npm install && npm run build`，启用 **story-editor**
3. 或用战斗管理器「一键编译并刷新全部扩展」

## 路径

| 用途 | 路径 |
|------|------|
| 图资产 | `assets/resources/story-graphs/{storyId}/graph.graph.json` |
| 元数据 | `assets/resources/story-graphs/{storyId}/index.json` |
| 生成类 | `assets/Scripts/src/story/generated/TsStory{storyId}.ts` |
| ClassMap | `assets/Scripts/src/story/generated/TsStoryClassMap.ts` |

## 生命周期

`onStart`（async）→ `onUpdate`（sync）→ `onEnd` / `onInterrupted`

主链节点为 `async`，对话/等待用 `await` 续跑。

## 端口

中文口名：`前序` / `后继` / …。打开与导出前会 `syncStoryGraphPorts`；勿用手写英文口名。
