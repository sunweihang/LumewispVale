import * as fs from 'fs';
import * as path from 'path';
import { BattleModuleInfo } from './moduleTypes';

/**
 * 磁盘 package.json 未重载时，battle-module-info 消息可能尚未注册。
 * 用内置契约 + 已有 list-* 探测，保证宿主仍能工作。
 *
 * 分组对齐 GameAsset MainEditorWindow：
 *   单位管理器（unit） / 特效管理器（effect） / 场景管理（scene） / 战斗管理器（battle） 同级
 */
const FALLBACK_MODULES: Record<string, BattleModuleInfo | BattleModuleInfo[]> = {
  'effect-editor': [
    {
      id: 'effect',
      packageName: 'effect-editor',
      title: '特效管理',
      order: 10,
      group: 'effect',
      groupTitle: '特效管理器',
      groupOrder: 12,
      itemIdKey: 'effectId',
      openArgKey: 'effectId',
      emptyHint: '暂无特效。请「创建」或「迁移现有特效」。',
      openLabel: '打开Prefab',
      hideExport: true,
      messages: {
        list: 'list-effects',
        open: 'open-effect',
        exportOne: 'validate-effect',
        exportBatch: 'validate-effects',
        create: 'create-effect',
        delete: 'delete-effect',
        locate: 'locate-effect',
        validateOne: 'validate-effect',
      },
      extraActions: [
        { id: 'migrate', label: '迁移特效', message: 'migrate-effects' },
      ],
    },
    {
      id: 'effect-category',
      packageName: 'effect-editor',
      title: '特效类型管理',
      order: 20,
      group: 'effect',
      groupTitle: '特效管理器',
      groupOrder: 12,
      itemIdKey: 'categoryId',
      openArgKey: 'categoryId',
      emptyHint: '暂无类型（由特效 index.category 汇总）。',
      openLabel: '查看',
      hideCreate: true,
      hideExport: true,
      messages: {
        list: 'list-effect-categories',
        open: 'open-effect-category',
        exportOne: 'validate-effects',
        exportBatch: 'validate-effects',
        create: 'create-effect',
      },
    },
  ],
  'unit-editor': [
    {
      id: 'unit',
      packageName: 'unit-editor',
      title: '单位管理',
      order: 10,
      group: 'unit',
      groupTitle: '单位管理器',
      groupOrder: 10,
      itemIdKey: 'unitId',
      openArgKey: 'unitId',
      emptyHint: '暂无单位。请点「创建」。',
      exportLabel: '扫描挂点',
      openLabel: '打开Prefab',
      messages: {
        list: 'list-units',
        open: 'open-unit',
        exportOne: 'scan-unit-mounts',
        exportBatch: 'scan-unit-mounts-batch',
        create: 'create-unit',
        delete: 'delete-unit',
        locate: 'locate-unit',
      },
      extraActions: [
        {
          id: 'save-collision',
          label: '保存碰撞',
          message: 'save-unit-collision',
        },
      ],
    },
    {
      id: 'unit-category',
      packageName: 'unit-editor',
      title: '单位类型管理',
      order: 20,
      group: 'unit',
      groupTitle: '单位管理器',
      groupOrder: 10,
      itemIdKey: 'categoryId',
      openArgKey: 'categoryId',
      emptyHint: '暂无类型（由单位 index.category 汇总）。',
      openLabel: '查看',
      hideCreate: true,
      hideExport: true,
      messages: {
        list: 'list-unit-categories',
        open: 'open-unit-category',
        exportOne: 'scan-unit-mounts-batch',
        exportBatch: 'scan-unit-mounts-batch',
        create: 'create-unit',
      },
    },
  ],
  'skill-editor': {
    id: 'skill',
    packageName: 'skill-editor',
    title: '技能',
    order: 10,
    group: 'battle',
    groupTitle: '战斗管理器',
    groupOrder: 20,
    itemIdKey: 'skillId',
    openArgKey: 'skillId',
    emptyHint: '暂无技能。请点「创建」。',
    messages: {
      list: 'list-skills',
      open: 'open-skill',
      exportOne: 'export-skill',
      exportBatch: 'export-ts-batch',
      create: 'create-skill',
      validateOne: 'validate-skill',
    },
  },
  'ballistic-editor': {
    id: 'ballistic',
    packageName: 'ballistic-editor',
    title: '弹道',
    order: 20,
    group: 'battle',
    groupTitle: '战斗管理器',
    groupOrder: 20,
    itemIdKey: 'ballisticId',
    openArgKey: 'ballisticId',
    emptyHint: '暂无弹道。请点「创建」。',
    messages: {
      list: 'list-ballistics',
      open: 'open-ballistic',
      exportOne: 'export-ballistic',
      exportBatch: 'export-ts-batch',
      create: 'create-ballistic',
      validateOne: 'validate-ballistic',
    },
    extraActions: [
      { id: 'refs', label: '引用技能', message: 'find-skills-using-ballistic' },
    ],
  },
  'modifier-editor': {
    id: 'modifier',
    packageName: 'modifier-editor',
    title: 'Buff',
    order: 30,
    group: 'battle',
    groupTitle: '战斗管理器',
    groupOrder: 20,
    itemIdKey: 'modifierId',
    openArgKey: 'modifierId',
    emptyHint: '暂无 Buff。请点「创建」。',
    openLabel: '编辑',
    exportLabel: '导出TS',
    messages: {
      list: 'list-modifiers',
      open: 'open-modifier',
      exportOne: 'export-modifier',
      exportBatch: 'export-ts-batch',
      create: 'create-modifier',
      validateOne: 'validate-modifier',
    },
  },
  'story-editor': {
    id: 'story',
    packageName: 'story-editor',
    title: '剧情',
    order: 10,
    group: 'story',
    groupTitle: '剧情管理',
    groupOrder: 18,
    itemIdKey: 'storyId',
    openArgKey: 'storyId',
    emptyHint: '暂无剧情。请点「创建」。',
    openLabel: '编辑',
    exportLabel: '导出TS',
    messages: {
      list: 'list-stories',
      open: 'open-story',
      exportOne: 'export-story',
      exportBatch: 'export-ts-batch',
      create: 'create-story',
      delete: 'delete-story',
      validateOne: 'validate-story',
    },
  },
  'scene-editor': [
    {
      id: 'resource-scene',
      packageName: 'scene-editor',
      title: '资源场景',
      order: 10,
      group: 'scene',
      groupTitle: '场景管理',
      groupOrder: 15,
      itemIdKey: 'sceneId',
      openArgKey: 'sceneId',
      emptyHint: '暂无资源场景。请「创建」或「迁移现有关卡」。',
      openLabel: '打开Prefab',
      hideExport: true,
      messages: {
        list: 'list-scenes',
        open: 'open-scene',
        exportOne: 'sync-spawn',
        exportBatch: 'sync-spawn-batch',
        create: 'create-scene',
        delete: 'delete-scene',
        locate: 'locate-scene',
        validateOne: 'validate-scene',
      },
      extraActions: [
        { id: 'migrate', label: '迁移关卡', message: 'migrate-chapters' },
        { id: 'sync-default-logic', label: '同步到默认逻辑', message: 'sync-spawn' },
      ],
    },
    {
      id: 'block-plant',
      packageName: 'scene-editor',
      title: '阻挡种植',
      order: 15,
      group: 'scene',
      groupTitle: '场景管理',
      groupOrder: 15,
      itemIdKey: 'sceneId',
      openArgKey: 'sceneId',
      emptyHint: '暂无资源场景。请先在「资源场景」创建，再编辑阻挡。',
      openLabel: '编辑阻挡',
      hideCreate: true,
      hideExport: true,
      messages: {
        list: 'list-scenes',
        open: 'open-block-plant',
        exportOne: 'sync-spawn',
        exportBatch: 'sync-spawn-batch',
        create: 'create-scene',
        locate: 'locate-scene',
        validateOne: 'validate-scene',
      },
      extraActions: [
        { id: 'open-prefab', label: '打开Prefab', message: 'open-scene' },
      ],
    },
    {
      id: 'logic-scene',
      packageName: 'scene-editor',
      title: '逻辑场景',
      order: 20,
      group: 'scene',
      groupTitle: '场景管理',
      groupOrder: 15,
      itemIdKey: 'logicId',
      openArgKey: 'logicId',
      emptyHint: '暂无逻辑场景。请点「创建」并绑定资源场景，再「编辑种植」。',
      openLabel: '编辑种植',
      hideExport: true,
      messages: {
        list: 'list-logic-scenes',
        open: 'open-logic-scene',
        exportOne: 'sync-spawn',
        exportBatch: 'sync-spawn-batch',
        create: 'create-logic-scene',
        validateOne: 'validate-logic-scene',
        locate: 'locate-logic-scene',
      },
      extraActions: [
        { id: 'open-resource-prefab', label: '打开资源Prefab', message: 'open-logic-resource-prefab' },
        { id: 'import-from-prefab', label: '从Prefab导入', message: 'sync-spawn' },
      ],
    },
    {
      id: 'scene-category',
      packageName: 'scene-editor',
      title: '类型配置',
      order: 30,
      group: 'scene',
      groupTitle: '场景管理',
      groupOrder: 15,
      itemIdKey: 'categoryId',
      openArgKey: 'categoryId',
      emptyHint: '暂无类型（由资源场景 index.category 汇总）。',
      openLabel: '查看',
      hideCreate: true,
      hideExport: true,
      messages: {
        list: 'list-scene-categories',
        open: 'open-scene-category',
        exportOne: 'sync-spawn-batch',
        exportBatch: 'sync-spawn-batch',
        create: 'create-scene',
      },
    },
  ],
};

function normalizeInfoList(raw: unknown): BattleModuleInfo[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === 'object' && (x as BattleModuleInfo).id) as BattleModuleInfo[];
  }
  if (typeof raw === 'object' && (raw as BattleModuleInfo).id) {
    return [raw as BattleModuleInfo];
  }
  return [];
}

function withDefaultGroup(info: BattleModuleInfo): BattleModuleInfo {
  if (info.group) return info;
  // 未声明分组时：单位 / 特效 / 场景 / 其余→战斗
  if (info.id.startsWith('unit')) {
    return {
      ...info,
      group: 'unit',
      groupTitle: info.groupTitle || '单位管理器',
      groupOrder: info.groupOrder ?? 10,
    };
  }
  if (info.id.startsWith('effect')) {
    return {
      ...info,
      group: 'effect',
      groupTitle: info.groupTitle || '特效管理器',
      groupOrder: info.groupOrder ?? 12,
    };
  }
  if (info.id.includes('scene')) {
    return {
      ...info,
      group: 'scene',
      groupTitle: info.groupTitle || '场景管理',
      groupOrder: info.groupOrder ?? 15,
    };
  }
  return {
    ...info,
    group: 'battle',
    groupTitle: info.groupTitle || '战斗管理器',
    groupOrder: info.groupOrder ?? 20,
  };
}

function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

function listCandidatePackageNames(): string[] {
  const root = path.join(getProjectRoot(), 'extensions');
  const names = new Set<string>(Object.keys(FALLBACK_MODULES));

  if (fs.existsSync(root)) {
    for (const name of fs.readdirSync(root)) {
      if (name === 'battle-manager' || name.startsWith('.')) continue;
      const pkgPath = path.join(root, name, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
          name?: string;
          contributions?: {
            messages?: Record<string, unknown>;
            battleManager?: { enabled?: boolean };
          };
        };
        const pkgName = pkg.name || name;
        const msgs = pkg.contributions?.messages || {};
        const flagged = pkg.contributions?.battleManager?.enabled === true;
        if (flagged || 'battle-module-info' in msgs || FALLBACK_MODULES[pkgName]) {
          names.add(pkgName);
        }
      } catch (e) {
        console.warn('[battle-manager] skip package.json', name, e);
      }
    }
  }

  return [...names];
}

async function packageAlive(pkgName: string, listMessage: string): Promise<boolean> {
  try {
    await Editor.Message.request(pkgName, listMessage);
    return true;
  } catch {
    return false;
  }
}

function mergeFallbackFields(pkgName: string, infos: BattleModuleInfo[]): BattleModuleInfo[] {
  const fallback = FALLBACK_MODULES[pkgName];
  if (!fallback) return infos;
  const fbList = normalizeInfoList(fallback);
  return infos.map((info) => {
    const fb = fbList.find((f) => f.id === info.id);
    if (!fb) return info;
    return {
      ...info,
      messages: {
        ...fb.messages,
        ...info.messages,
        delete: info.messages.delete || fb.messages.delete,
        locate: info.messages.locate || fb.messages.locate,
        // 单位管理已去掉校验按钮，勿把 fallback 的 validate 合回去
        validateOne:
          info.id === 'unit' ? undefined : info.messages.validateOne || fb.messages.validateOne,
      },
      extraActions: info.extraActions?.length ? info.extraActions : fb.extraActions,
    };
  });
}

async function resolveModules(pkgName: string): Promise<BattleModuleInfo[]> {
  // 1) 优先正式契约（支持单对象或数组）
  try {
    const info = await Editor.Message.request(pkgName, 'battle-module-info');
    const list = mergeFallbackFields(pkgName, normalizeInfoList(info).map(withDefaultGroup));
    if (list.length > 0) return list;
  } catch (e) {
    const msg = String(e);
    if (msg.includes('Message does not exist')) {
      console.warn(
        `[battle-manager] ${pkgName} 未注册 battle-module-info（扩展可能未重载），改用内置契约`
      );
    } else {
      console.warn(`[battle-manager] battle-module-info failed: ${pkgName}`, e);
    }
  }

  // 2) 内置兜底
  const fallback = FALLBACK_MODULES[pkgName];
  if (!fallback) return [];
  const list = normalizeInfoList(fallback).map(withDefaultGroup);
  const alive: BattleModuleInfo[] = [];
  for (const m of list) {
    if (await packageAlive(pkgName, m.messages.list)) {
      alive.push(m);
    } else {
      console.warn(`[battle-manager] ${pkgName}/${m.id} 未启用或 list 消息不可用，跳过`);
    }
  }
  return alive;
}

/** 扫描 extensions/* + 内置兜底，组装同级分组子模块列表 */
export async function discoverBattleModules(): Promise<BattleModuleInfo[]> {
  const names = listCandidatePackageNames();
  const modules: BattleModuleInfo[] = [];
  const seen = new Set<string>();

  for (const pkgName of names) {
    const infos = await resolveModules(pkgName);
    for (const info of infos) {
      if (!info || seen.has(info.id)) continue;
      seen.add(info.id);
      modules.push(info);
    }
  }

  modules.sort(
    (a, b) =>
      (a.groupOrder ?? 50) - (b.groupOrder ?? 50) ||
      a.order - b.order ||
      a.title.localeCompare(b.title, 'zh')
  );
  console.log(
    `[battle-manager] discovered ${modules.length} module(s):`,
    modules.map((m) => `${m.groupTitle || m.group}/${m.title}(${m.packageName})`).join(', ') ||
      '(none)'
  );
  return modules;
}
