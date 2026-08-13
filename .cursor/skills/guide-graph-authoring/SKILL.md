---
name: guide-graph-authoring
description: >-
  Author Lumewisp Vale tutorial/guide graphs (guide-editor / TsGuide / GuideRuntime).
  Use when creating or editing guide-graphs, TryBagToHotbar, TrySelectTool, world/town
  aim chains, TsGuide export, or wiring TutorialGuide ↔ GuideRuntime.
---

# 引导图制作约束（LumewispVale）

对齐 story-editor / skill-editor，但 Flow 为 **sync 解析**（每帧 `onResolve`，不是异步剧情）。

## 默认流程

1. 启用 **node-graph** + **guide-editor**（`cd extensions/guide-editor && npm run build`）
2. Game 编辑器 → 引导管理 → 创建 / 编辑 / 导出 TS
3. 图：`assets/resources/guide-graphs/{gotoId}/`
4. 生成：`assets/scripts/guide/generated/TsGuide{id}.ts` + ClassMap
5. 运行：`TutorialGuide` → `GuideRuntime.resolveGoto(host, quest.gotoId)`

批量从 TGoto 种子：`node tools/guide/seed_goto_guides.mjs`

## 入口

| 出口 | 方法 | 说明 |
|------|------|------|
| 解析 | `onResolve` | sync；Try* 首次命中即瞄准 |

## Try* 约定

- 出口：`已瞄准` / `未命中`
- 命中后通常不连线（停止链）；未命中接下一步
- 典型：`TryBagToHotbar` → `TrySelectTool` → `TryWorldPlot` / 城镇节点

## 端口硬约束

端口名必须与 `extensions/guide-editor/src/nodes/guideNodes.ts` **中文名一致**。禁止英文口名。

## 公共优先级（图外）

`TutorialGuide.resolveCommonPriority()`：日志关闭、商店/板、领奖、配方学习、制作忙碌压制。再跑 per-goto 图。

## 新增节点清单

1. `guideNodes.ts` 增加定义（中文端口）
2. `templates/Execute{TypeName}.ts.tpl`（sync `private …(): void`）
3. `AbsGuide` 增加 API；`GuideAimHost` + TutorialGuide 桥接
4. `npm run build` 扩展并重载
5. 建图 → 导出 → ClassMap
