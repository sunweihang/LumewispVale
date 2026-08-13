#!/usr/bin/env node
/**
 * Seed guide-graphs/{gotoId} + TsGuide{gotoId}.ts from tgoto.json recipes.
 * Id == TGoto.id (quest.goto_id). Re-run after adding gotos; editor can re-export.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const GRAPHS = path.join(ROOT, 'assets/resources/guide-graphs');
const GEN = path.join(ROOT, 'assets/scripts/guide/generated');
const TGOTO = path.join(ROOT, 'assets/resources/config/tgoto.json');

const DOMAIN = [
  'GuideEntranceBlueprint',
  'TryBagToHotbarBlueprint',
  'TrySelectToolBlueprint',
  'TryOpenBagBlueprint',
  'TryWorldPlotBlueprint',
  'TryWorldDecorBlueprint',
  'TryWorldNodeBlueprint',
  'TryFishBlueprint',
  'TryCraftBenchBlueprint',
  'TryHarvestBoostBlueprint',
  'TryHintFarmBlueprint',
  'TryTownGateBlueprint',
  'TryMayorBlueprint',
  'TryTownOutdoorBlueprint',
  'TryIndoorOrDoorBlueprint',
  'TryMineCopperBlueprint',
  'AimQuestDockBlueprint',
  'FloatConst',
  'Add',
  'Branch',
  'BoolConst',
  'StringConst',
  'DebugLog',
  'FloatCompareBranch',
];

const PROFILE = {
  name: 'guide',
  useLightTheme: false,
  nodeFilter: { allowAll: false, whitelist: DOMAIN, blacklist: [] },
};

/** @typedef {{ type: string, data?: Record<string, unknown>, title?: string }} Step */

/** @type {Record<number, { name: string, steps: Step[] }>} */
const RECIPES = {
  2: {
    name: '开垦·锄头',
    steps: [
      { type: 'TryBagToHotbarBlueprint', data: { itemId: 'hoe', ensureHoe: true, openTip: '露穗：点开背包，把锄头拿出来' } },
      { type: 'TrySelectToolBlueprint', data: { tool: 'hoe' } },
      { type: 'TryWorldPlotBlueprint', data: { plot: 'soil', tip: '露穗：点这里开垦田地' } },
    ],
  },
  3: {
    name: '播种·种子',
    steps: [
      { type: 'TryBagToHotbarBlueprint', data: { itemId: 'seeds', ensureHoe: false, openTip: '露穗：点开背包，把种子拿出来' } },
      { type: 'TrySelectToolBlueprint', data: { tool: 'seeds' } },
      { type: 'TryWorldPlotBlueprint', data: { plot: 'tilled', tip: '露穗：点翻好的地播种' } },
    ],
  },
  4: {
    name: '浇水·水壶',
    steps: [
      { type: 'TryBagToHotbarBlueprint', data: { itemId: 'can', ensureHoe: false, openTip: '露穗：点开背包，把水壶拿出来' } },
      { type: 'TrySelectToolBlueprint', data: { tool: 'can' } },
      { type: 'TryWorldPlotBlueprint', data: { plot: 'water', tip: '露穗：给作物浇点水' } },
    ],
  },
  5: {
    name: '催熟收获',
    steps: [{ type: 'TryHarvestBoostBlueprint' }],
  },
  6: {
    name: '钓鱼·鱼竿',
    steps: [{ type: 'TryFishBlueprint' }],
  },
  7: {
    name: '打开背包',
    steps: [
      { type: 'TryOpenBagBlueprint', data: { tip: '露穗：点开背包看看' } },
      { type: 'AimQuestDockBlueprint', data: { tip: '查看当前任务目标' } },
    ],
  },
  8: {
    name: '农田翻种',
    steps: [{ type: 'TryHintFarmBlueprint' }],
  },
  9: {
    name: '拔草',
    steps: [
      { type: 'TrySelectToolBlueprint', data: { tool: 'hand' } },
      { type: 'TryWorldDecorBlueprint', data: { kind: 'grass', tip: '露穗：点这里拔掉杂草' } },
    ],
  },
  10: {
    name: '钓鱼·湖边',
    steps: [{ type: 'TryFishBlueprint' }],
  },
  11: {
    name: '工作台',
    steps: [{ type: 'TryCraftBenchBlueprint' }],
  },
  12: {
    name: '通往小镇',
    steps: [{ type: 'TryTownGateBlueprint' }],
  },
  13: {
    name: '通往小镇',
    steps: [{ type: 'TryTownGateBlueprint' }],
  },
  14: {
    name: '拜访镇长',
    steps: [{ type: 'TryMayorBlueprint' }],
  },
  15: {
    name: '公告板任务',
    steps: [
      {
        type: 'TryTownOutdoorBlueprint',
        data: {
          names: 'bld_police,bld_post',
          nearTip: '点击警局或邮局接任务',
          farTip: '往警局或邮局走，再点公告板',
        },
      },
    ],
  },
  16: {
    name: '木工坊工匠',
    steps: [
      {
        type: 'TryIndoorOrDoorBlueprint',
        data: {
          indoorName: 'npc_carpenter',
          doorName: 'bld_carpenter',
          indoorTip: '点工匠·石楠打招呼',
          doorTip: '点木工坊大门进屋',
          farTip: '往东市木工坊走，点大门进屋',
        },
      },
    ],
  },
  17: {
    name: '社区中心',
    steps: [
      {
        type: 'TryIndoorOrDoorBlueprint',
        data: {
          indoorName: 'npc_caretaker',
          doorName: 'bld_community',
          indoorTip: '点管理员·苔青打招呼',
          doorTip: '点社区中心大门进屋',
          farTip: '往社区中心走，点大门进屋',
        },
      },
    ],
  },
  18: {
    name: '商店购买',
    steps: [
      {
        type: 'TryTownOutdoorBlueprint',
        data: {
          names: 'bld_seedshop,bld_general',
          nearTip: '走进商店，点击购买商品',
          farTip: '往种子店走，再点门面',
        },
      },
    ],
  },
  19: {
    name: '商店出售',
    steps: [
      {
        type: 'TryTownOutdoorBlueprint',
        data: {
          names: 'bld_seedshop,bld_general',
          nearTip: '打开商店，点「出售」卖掉一件收获物',
          farTip: '往种子店走，再点门面',
        },
      },
    ],
  },
  20: {
    name: '春厅签字',
    steps: [
      {
        type: 'TryIndoorOrDoorBlueprint',
        data: {
          indoorName: 'prop_spring_desk',
          doorName: 'bld_community',
          indoorTip: '点春厅名册桌签字',
          doorTip: '点社区中心大门进屋',
          farTip: '往社区中心走，点大门进屋',
        },
      },
    ],
  },
  21: {
    name: '微光诊所',
    steps: [
      {
        type: 'TryIndoorOrDoorBlueprint',
        data: {
          indoorName: 'npc_doctor',
          doorName: 'bld_clinic',
          indoorTip: '点医生·荷叶听取叮嘱',
          doorTip: '点微光诊所大门进屋',
          farTip: '往微光诊所走，点大门进屋',
        },
      },
    ],
  },
  22: {
    name: '矿脉商会',
    steps: [
      {
        type: 'TryTownOutdoorBlueprint',
        data: {
          names: 'bld_oreshop',
          nearTip: '点矿脉商会，向掌柜·赤铜打听放行',
          farTip: '往矿脉商会走，再点一下找掌柜',
        },
      },
    ],
  },
  23: {
    name: '进入矿洞',
    steps: [
      {
        type: 'TryTownOutdoorBlueprint',
        data: {
          names: 'sign_mine,door_portal_mine',
          nearTip: '点击东门外矿洞路牌进入',
          farTip: '往东走到矿洞路牌',
        },
      },
      { type: 'TryMineCopperBlueprint' },
    ],
  },
  24: {
    name: '开采铜矿',
    steps: [{ type: 'TryMineCopperBlueprint' }],
  },
  25: {
    name: '春厅点灯',
    steps: [
      {
        type: 'TryIndoorOrDoorBlueprint',
        data: {
          indoorName: 'prop_spring_lamp',
          doorName: 'bld_community',
          indoorTip: '点春厅旧灯，献上铜矿',
          doorTip: '点社区中心大门进屋',
          farTip: '往社区中心走，点大门进屋',
        },
      },
    ],
  },
  26: {
    name: '挖石·锄头',
    steps: [
      { type: 'TryBagToHotbarBlueprint', data: { itemId: 'hoe', ensureHoe: true, openTip: '露穗：点开背包，把锄头拿出来' } },
      { type: 'TrySelectToolBlueprint', data: { tool: 'hoe' } },
      { type: 'TryWorldDecorBlueprint', data: { kind: 'rock', tip: '露穗：点石头挖石料' } },
    ],
  },
  27: {
    name: '砍树·斧头',
    steps: [
      { type: 'TryBagToHotbarBlueprint', data: { itemId: 'axe', ensureHoe: false, openTip: '露穗：点开背包，把斧头拿出来' } },
      { type: 'TrySelectToolBlueprint', data: { tool: 'axe' } },
      { type: 'TryWorldDecorBlueprint', data: { kind: 'tree', tip: '露穗：点树砍几下，攒木料' } },
    ],
  },
};

function nodeShell(id, typeName, title, x, y, customData, outs) {
  const isEntrance = typeName === 'GuideEntranceBlueprint';
  return {
    id,
    typeName,
    title,
    position: { x, y, w: isEntrance ? 220 : 240, h: isEntrance ? 120 : 140 },
    minWidth: isEntrance ? 220 : 240,
    minHeight: isEntrance ? 120 : 140,
    inputs: isEntrance ? [] : [{ name: '前序', portType: 'GraphFlow' }],
    outputs: outs,
    customData: customData || {},
  };
}

function outsFor(type) {
  if (type === 'GuideEntranceBlueprint') {
    return [{ name: '解析', portType: 'GraphFlow' }];
  }
  if (type === 'AimQuestDockBlueprint') {
    return [{ name: '后继', portType: 'GraphFlow' }];
  }
  return [
    { name: '已瞄准', portType: 'GraphFlow' },
    { name: '未命中', portType: 'GraphFlow' },
  ];
}

function buildGraph(guideId, recipe) {
  const nodes = [];
  const connections = [];
  const entrance = nodeShell(
    'node_entrance',
    'GuideEntranceBlueprint',
    '引导入口',
    40,
    80,
    {},
    outsFor('GuideEntranceBlueprint'),
  );
  nodes.push(entrance);

  let prevId = 'node_entrance';
  let prevOut = 0; // 解析 / 未命中
  recipe.steps.forEach((step, i) => {
    const id = `node_${i}`;
    const n = nodeShell(id, step.type, step.title || step.type, 320 + i * 280, 80, step.data || {}, outsFor(step.type));
    nodes.push(n);
    connections.push({
      fromNodeId: prevId,
      fromPortIndex: prevOut,
      toNodeId: id,
      toPortIndex: 0,
    });
    prevId = id;
    // chain on 未命中 (port 1) for Try*; AimQuestDock has only 后继 (0)
    prevOut = step.type === 'AimQuestDockBlueprint' ? 0 : 1;
  });

  return {
    version: 1,
    graphId: `guide_${guideId}`,
    profile: PROFILE,
    nodes,
    connections,
  };
}

function emitTs(guideId, recipe) {
  const lines = [];
  lines.push(`/*`);
  lines.push(` * AUTO-GENERATED by tools/guide/seed_goto_guides.mjs (guide ${guideId}).`);
  lines.push(` * Prefer re-export from guide-editor after graph edits.`);
  lines.push(` */`);
  lines.push(`import { AbsGuide } from '../AbsGuide';`);
  lines.push(``);
  lines.push(`export class TsGuide${guideId} extends AbsGuide {`);
  lines.push(`    public readonly guideId = ${guideId};`);
  lines.push(``);
  lines.push(`    protected onResolve(): void {`);
  lines.push(`        void this.step_0();`);
  lines.push(`    }`);

  recipe.steps.forEach((step, i) => {
    const next = i + 1 < recipe.steps.length ? `void this.step_${i + 1};` : null;
    const miss = next ? `            void this.step_${i + 1}();\n` : '            // end\n';
    const d = step.data || {};
    lines.push(``);
    lines.push(`    private step_${i}(): void {`);
    switch (step.type) {
      case 'TryBagToHotbarBlueprint':
        lines.push(`        if (this.tryBagToHotbar(${JSON.stringify(d.itemId)}, {`);
        lines.push(`            ensureHoe: ${!!d.ensureHoe},`);
        lines.push(`            openTip: ${JSON.stringify(d.openTip || '')},`);
        lines.push(`        })) {`);
        lines.push(`            // aimed`);
        lines.push(`        } else {`);
        lines.push(miss);
        lines.push(`        }`);
        break;
      case 'TrySelectToolBlueprint':
        lines.push(`        if (this.trySelectTool(${JSON.stringify(d.tool)})) {`);
        lines.push(`            // aimed`);
        lines.push(`        } else {`);
        lines.push(miss);
        lines.push(`        }`);
        break;
      case 'TryOpenBagBlueprint':
        lines.push(`        if (this.tryOpenBag(${JSON.stringify(d.tip || '')})) {`);
        lines.push(`            // aimed`);
        lines.push(`        } else {`);
        lines.push(miss);
        lines.push(`        }`);
        break;
      case 'TryWorldPlotBlueprint':
        lines.push(
          `        if (this.tryWorldPlot(${JSON.stringify(d.plot)}, ${JSON.stringify(d.tip || '')})) {`,
        );
        lines.push(`            // aimed`);
        lines.push(`        } else {`);
        lines.push(miss);
        lines.push(`        }`);
        break;
      case 'TryWorldDecorBlueprint':
        lines.push(
          `        if (this.tryWorldDecor(${JSON.stringify(d.kind)}, ${JSON.stringify(d.tip || '')})) {`,
        );
        lines.push(`            // aimed`);
        lines.push(`        } else {`);
        lines.push(miss);
        lines.push(`        }`);
        break;
      case 'TryFishBlueprint':
      case 'TryCraftBenchBlueprint':
      case 'TryHarvestBoostBlueprint':
      case 'TryHintFarmBlueprint':
      case 'TryTownGateBlueprint':
      case 'TryMayorBlueprint':
      case 'TryMineCopperBlueprint': {
        const fn = {
          TryFishBlueprint: 'tryFish',
          TryCraftBenchBlueprint: 'tryCraftBench',
          TryHarvestBoostBlueprint: 'tryHarvestBoost',
          TryHintFarmBlueprint: 'tryHintFarm',
          TryTownGateBlueprint: 'tryTownGate',
          TryMayorBlueprint: 'tryMayor',
          TryMineCopperBlueprint: 'tryMineCopper',
        }[step.type];
        lines.push(`        if (this.${fn}()) {`);
        lines.push(`            // aimed`);
        lines.push(`        } else {`);
        lines.push(miss);
        lines.push(`        }`);
        break;
      }
      case 'TryTownOutdoorBlueprint':
        lines.push(
          `        if (this.tryTownOutdoor(${JSON.stringify(d.names)}, ${JSON.stringify(d.nearTip)}, ${JSON.stringify(d.farTip)})) {`,
        );
        lines.push(`            // aimed`);
        lines.push(`        } else {`);
        lines.push(miss);
        lines.push(`        }`);
        break;
      case 'TryIndoorOrDoorBlueprint':
        lines.push(`        if (this.tryIndoorOrDoor({`);
        lines.push(`            indoorName: ${JSON.stringify(d.indoorName)},`);
        lines.push(`            doorName: ${JSON.stringify(d.doorName)},`);
        lines.push(`            indoorTip: ${JSON.stringify(d.indoorTip)},`);
        lines.push(`            doorTip: ${JSON.stringify(d.doorTip)},`);
        lines.push(`            farTip: ${JSON.stringify(d.farTip)},`);
        lines.push(`        })) {`);
        lines.push(`            // aimed`);
        lines.push(`        } else {`);
        lines.push(miss);
        lines.push(`        }`);
        break;
      case 'AimQuestDockBlueprint':
        lines.push(`        this.aimQuestDock(${JSON.stringify(d.tip || '查看当前任务目标')});`);
        break;
      default:
        lines.push(`        // unknown ${step.type}`);
        if (next) lines.push(`        void this.step_${i + 1}();`);
    }
    lines.push(`    }`);
  });

  lines.push(`}`);
  lines.push(``);
  return lines.join('\n');
}

function writeClassMap(ids) {
  const imports = ids.map((id) => `import { TsGuide${id} } from './TsGuide${id}';`).join('\n');
  const entries = ids.map((id) => `  ${id}: () => new TsGuide${id}(),`).join('\n');
  return `/*
 * AUTO-GENERATED by tools/guide/seed_goto_guides.mjs. Do not edit manually.
 */
import type { AbsGuide } from '../AbsGuide';
${imports}

const MAP: Record<number, () => AbsGuide> = {
${entries}
};

export function createTsGuide(guideId: number): AbsGuide | null {
  const factory = MAP[guideId | 0];
  return factory ? factory() : null;
}

export function listExportedGuideIds(): number[] {
  return Object.keys(MAP).map((k) => Number(k));
}
`;
}

function main() {
  fs.mkdirSync(GRAPHS, { recursive: true });
  fs.mkdirSync(GEN, { recursive: true });

  const tgoto = JSON.parse(fs.readFileSync(TGOTO, 'utf8'));
  const ids = [];
  for (const row of tgoto) {
    const id = row.id | 0;
    if (id <= 0) continue;
    const recipe = RECIPES[id];
    if (!recipe) {
      console.warn(`no recipe for goto ${id}, skip`);
      continue;
    }
    const dir = path.join(GRAPHS, String(id));
    fs.mkdirSync(dir, { recursive: true });
    const index = {
      guideId: id,
      name: recipe.name,
      description: row.hint || '',
      category: 'goto',
      exportFlag: true,
    };
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
    fs.writeFileSync(
      path.join(dir, 'graph.graph.json'),
      JSON.stringify(buildGraph(id, recipe), null, 2) + '\n',
    );
    fs.writeFileSync(path.join(GEN, `TsGuide${id}.ts`), emitTs(id, recipe));
    ids.push(id);
    console.log(`seeded guide ${id} (${recipe.name})`);
  }
  fs.writeFileSync(path.join(GEN, 'TsGuideClassMap.ts'), writeClassMap(ids));
  console.log(`class map: ${ids.length} guides`);
}

main();
