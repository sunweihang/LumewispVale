/**
 * 离线扫描 Prefab JSON：补必要空挂点节点 + 写入 mounts.json 旁路配置。
 * 场景内「写回 Decorator 组件」由 scene script 负责；此处保证磁盘侧挂点节点齐全。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  NECESSARY_BONE_NAMES,
  NODE_NAME_TO_SLOT,
  UnitIndexJSON,
  indexFsPath,
  prefabFsPath,
  unitsFsRoot,
} from './paths';

function genFileId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = '';
  for (let i = 0; i < 22; i++) s += chars[(Math.random() * 62) | 0];
  return s;
}

function collectNodeNames(prefab: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const obj of prefab) {
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    if (o.__type__ === 'cc.Node' && typeof o._name === 'string') names.add(o._name);
  }
  return names;
}

/** 在 Prefab 根节点下追加缺失的空挂点子节点 */
export function ensurePrefabMountNodes(prefabPath: string): {
  ok: boolean;
  added: string[];
  error?: string;
} {
  if (!fs.existsSync(prefabPath)) {
    return { ok: false, added: [], error: `prefab missing: ${prefabPath}` };
  }

  let prefab: any[];
  try {
    prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
  } catch (e) {
    return { ok: false, added: [], error: String(e) };
  }

  if (!Array.isArray(prefab) || prefab.length < 2) {
    return { ok: false, added: [], error: 'invalid prefab format' };
  }

  // root node is typically __id__ 1
  const root = prefab[1];
  if (!root || root.__type__ !== 'cc.Node') {
    return { ok: false, added: [], error: 'root node not found at index 1' };
  }

  const names = collectNodeNames(prefab);
  const added: string[] = [];
  const rootChildren: Array<{ __id__: number }> = root._children || [];

  for (const boneName of NECESSARY_BONE_NAMES) {
    if (names.has(boneName)) continue;

    const nodeId = prefab.length;
    const posId = nodeId + 1;
    const rotId = nodeId + 2;
    const scaleId = nodeId + 3;
    const eulerId = nodeId + 4;
    const prefabInfoId = nodeId + 5;

    const y = boneName === 'bone_hud' || boneName === 'bone_hit' ? 1.5 : 0;

    prefab.push(
      {
        __type__: 'cc.Node',
        _name: boneName,
        _objFlags: 0,
        __editorExtras__: {},
        _parent: { __id__: 1 },
        _children: [],
        _active: true,
        _components: [],
        _prefab: { __id__: prefabInfoId },
        _lpos: { __id__: posId },
        _lrot: { __id__: rotId },
        _lscale: { __id__: scaleId },
        _mobility: 0,
        _layer: 1073741824,
        _euler: { __id__: eulerId },
        _id: '',
      },
      { __type__: 'cc.Vec3', x: 0, y, z: 0 },
      { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
      { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
      { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
      {
        __type__: 'cc.PrefabInfo',
        root: { __id__: 1 },
        asset: { __id__: 0 },
        fileId: genFileId(),
        instance: null,
        targetOverrides: null,
      }
    );

    rootChildren.push({ __id__: nodeId });
    names.add(boneName);
    added.push(boneName);
  }

  root._children = rootChildren;
  fs.writeFileSync(prefabPath, JSON.stringify(prefab, null, 2) + '\n', 'utf8');
  return { ok: true, added };
}

/** 根据 Prefab 节点名导出 mounts.json（slot → nodeName） */
export function writeMountsJson(unitId: number, prefabPath: string): {
  ok: boolean;
  mounts: Record<string, string>;
  error?: string;
} {
  if (!fs.existsSync(prefabPath)) {
    return { ok: false, mounts: {}, error: 'prefab missing' };
  }
  let prefab: any[];
  try {
    prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
  } catch (e) {
    return { ok: false, mounts: {}, error: String(e) };
  }

  const mounts: Record<string, string> = { '1': '(root)' };
  const names = collectNodeNames(prefab);
  for (const [nodeName, slot] of Object.entries(NODE_NAME_TO_SLOT)) {
    if (names.has(nodeName)) {
      mounts[String(slot)] = nodeName;
    }
  }

  const outDir = path.join(unitsFsRoot(), String(unitId));
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'mounts.json');
  fs.writeFileSync(outPath, JSON.stringify({ unitId, mounts }, null, 2) + '\n', 'utf8');
  return { ok: true, mounts };
}

export function scanUnitMountsOnDisk(unitId: number): {
  ok: boolean;
  added: string[];
  mounts: Record<string, string>;
  error?: string;
} {
  const indexPath = indexFsPath(unitId);
  if (!fs.existsSync(indexPath)) {
    return { ok: false, added: [], mounts: {}, error: 'index missing' };
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as UnitIndexJSON;
  if (!index.prefab) {
    return { ok: false, added: [], mounts: {}, error: 'prefab path empty' };
  }
  const prefabPath = prefabFsPath(index.prefab);
  const ensure = ensurePrefabMountNodes(prefabPath);
  if (!ensure.ok) {
    return { ok: false, added: [], mounts: {}, error: ensure.error };
  }
  const mounts = writeMountsJson(unitId, prefabPath);
  if (!mounts.ok) {
    return { ok: false, added: ensure.added, mounts: {}, error: mounts.error };
  }
  return { ok: true, added: ensure.added, mounts: mounts.mounts };
}
