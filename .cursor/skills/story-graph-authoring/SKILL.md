---
name: story-graph-authoring
description: >-
  Author Cocos story graphs (story-editor / TsStory / StoryRuntime) for LumewispVale
  (migrated from oops-framework / 后室). Use when creating or editing story-graphs, StartChat,
  WaitSeconds, EmitGameEvent, StoryTrigger storyId, TsStory export, StoryDebugBoot,
  or wiring ChatManager / camera / input lock.
---

# 剧情图制作约束（LumewispVale / 后室迁移）

制作剧情图前先读本 skill。对齐技能图管线，但 Flow 为 **async 续跑**（对话/等待后继续）。

## 默认流程

1. 启用 **node-graph** + **story-editor**（`cd extensions/story-editor && npm run build`）
2. 战斗管理器 → 剧情管理 → 创建 / 编辑图
3. 导出 TS → `assets/Scripts/src/story/generated/TsStory{id}.ts` + ClassMap
4. 触发：`StoryTrigger.storyId` 或 `StoryRuntime.Inst.play(id)`；调试用 `StoryDebugBoot`（G 播放 / H 中断）

## 路径

| 用途 | 路径 |
|------|------|
| 图 | `assets/resources/story-graphs/{id}/graph.graph.json` |
| 元数据 | `assets/resources/story-graphs/{id}/index.json` |
| 生成类 | `assets/scripts/story/generated/TsStory{id}.ts` |
| 基类 | `assets/scripts/story/AbsStory.ts` |
| Runtime | `assets/scripts/story/StoryRuntime.ts` |
| 对话目录 | Luban `dialogue.xlsx` → `TDialogue`（id=storyId/chatId） |
| 台词行 | Luban `chat.xlsx` → `TChat`（dialogue_id + seq；序章填 image） |
| 查表 | `assets/scripts/story/DialogueScripts.ts` |
| 增删改对白 | **优先** `.cursor/skills/dialogue-luban` + `tools/dialogue/dialogue_cli.py`（勿扫全库） |

主线对话图由 `dialogue_cli.py apply` 生成。触发：`StoryDialogue` → `StoryRuntime.play`。

## 生命周期

| 出口 | 方法 | 说明 |
|------|------|------|
| 开始 | `onStart` | async 主链 |
| 每帧更新 | `onUpdate` | sync；勿挂 Wait/对话 |
| 正常结束 | `onEnd` | StoryEnd 或主链结束 |
| 中断 | `onInterrupted` | interrupt / 切关 |

## 端口硬约束

- 端口名必须与 `extensions/story-editor/src/nodes/storyNodes.ts` **中文名一致**：`前序` / `后继` / …
- **禁止**手写英文口名。打开/导出时 `syncStoryGraphPorts` 按端口名重映射，对不上会丢线。

## 新增节点清单

1. `storyNodes.ts` 增加 `NodeDefinition`（中文端口）
2. `templates/Execute{TypeName}.ts.tpl`（`async` + `await` Flow）
3. `AbsStory` 增加对应 API
4. `npm run build` 扩展并重载
5. 建图 → 导出 → ClassMap

## 样例（Vale 主线对话）

`10001`–`10035`：锁输入 → `StartChat(chatId)` → 解锁 → `StoryEnd`（chatId===storyId）。  
台词改 `DialogueScripts.ts`；流程改图后在编辑器重导，或跑 `node tools/story/generate_dialogue_stories.mjs`。

## 场景↔剧情关联（Excel / Luban）

策划表：`config/luban/Datas/scene_story.xlsx`  
注册：`__tables__.xlsx` → `TbSceneStory`  
导出走：`tools/dataTools/export.bat` → `tbscenestory.json` + `schema.ts`

| 列 | 含义 |
|----|------|
| id | 资源场景 Id（如 606） |
| story_id | 剧情图 Id（如 10002） |
| name | 备注名 |

运行时（**无 StoryTrigger**）：`LevelController.LevelStart` → Loading 结束 → `TbSceneStory.get(sceneId)` → `StoryRuntime.play`。

表无该 scene 的行则不播。换房会 interrupt 上一房剧情。

## 606 Boss 出场 10002

表行：`id=606, story_id=10002`。勿再 emit `Boss01Appear`，避免双驱动。

锁输入 → 镜头到 `606/Enemy04` → `ShowBoss` → `BossPlayAppearShow` → 等 `CameraLockPlayer` → 镜头锁回 → `BossStartCombat` → 解锁 → 结束。

## 接入注意

- `StoryTrigger`：`storyId > 0` 走 Runtime；否则兼容 `GameEvent.emit(storyName)`
- 同屏单实例：新 `play` 会先 `interrupt` 当前剧情
- 输入锁：`storyInputLocked` + `EnterChat`/`ExitChat`；对话结束的 `ExitChat` 不会清掉 `storyInputLocked`
- 勿与旧纯事件剧情双驱动同一演出

## 提交前自检

- [ ] 图端口全中文，打开后连线仍在
- [ ] 已导出 `TsStory{id}` 且 ClassMap 含该 id
- [ ] 等待节点依赖 `StoryRuntime.tick`（Player / StoryDebugBoot）
- [ ] 扩展已 build
