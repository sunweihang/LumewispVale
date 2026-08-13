# guide-editor（引导图）

对齐 skill-editor / story-editor：用 node-graph 编辑引导决策链，导出 `TsGuide{id}`，由 `GuideRuntime` 每帧 `resolve()`。

## 流程

1. 启用 **node-graph** + **guide-editor**（`cd extensions/guide-editor && npm run build`）
2. Game 编辑器 → **引导管理** → 创建 / 编辑图 / 导出 TS
3. 图资产：`assets/resources/guide-graphs/{gotoId}/`
4. 生成类：`assets/scripts/guide/generated/TsGuide{id}.ts` + `TsGuideClassMap.ts`
5. 运行时：`TutorialGuide` → `GuideRuntime.resolveGoto(host, quest.gotoId)`

## 引导 ID

与 Luban **TGoto.id**（`quest.goto_id`）一致。批量种子：

```bash
node tools/guide/seed_goto_guides.mjs
```

## 入口生命周期

| 出口 | 方法 | 说明 |
|------|------|------|
| 解析 | `onResolve` | sync；Try* 链首次命中即瞄准 |

## Try* 节点

`已瞄准` / `未命中` 两出口。命中后通常不连线（停止）；未命中接下一步。

常用：`TryBagToHotbar` → `TrySelectTool` → `TryWorldPlot` / `TryWorldDecor` / 城镇节点。

## 端口硬约束

端口名必须与 `guideNodes.ts` **中文名一致**（`前序` / `已瞄准` / `未命中`…）。禁止手写英文口名。

## 公共优先级

日志关闭、商店/公告板、领奖、配方学习、工作台打开等仍由 `TutorialGuide.resolveCommonPriority()` 处理（图外），再跑 per-goto 图。
