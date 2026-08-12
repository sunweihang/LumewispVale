import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import { listLocalModifiers } from './browseModifiers';
import { genId, NodeGraphJSON } from './graphTypes';
import { ENTRANCE_TYPE, findModifierNodeDef } from './nodes/modifierNodes';
import {
  GRAPH_FILE_NAME,
  INDEX_FILE_NAME,
  ModifierIndexJSON,
  ensureDir,
  graphDbUrl,
  indexDbUrl,
  indexFsPath,
  modifierFolderDbUrl,
  modifierGraphsFsRoot,
} from './paths';
import { buildModifierGraphProfile } from './profile';

function entranceDef() {
  return findModifierNodeDef(ENTRANCE_TYPE)!;
}

export function buildEmptyModifierGraph(modifierId: number): NodeGraphJSON {
  const def = entranceDef();
  return {
    version: 1,
    graphId: `modifier_${modifierId}`,
    profile: buildModifierGraphProfile(),
    nodes: [
      {
        id: 'node_entrance',
        typeName: def.typeName,
        title: def.title,
        position: { x: 100, y: 80, w: def.minWidth ?? 200, h: def.minHeight ?? 140 },
        minWidth: def.minWidth ?? 200,
        minHeight: def.minHeight ?? 140,
        inputs: def.inputs.map((p) => ({ ...p })),
        outputs: def.outputs.map((p) => ({ ...p })),
        customData: {},
      },
    ],
    connections: [],
  };
}

export function nextModifierId(): number {
  const items = listLocalModifiers();
  if (items.length === 0) return 200000001;
  return Math.max(...items.map((i) => i.modifierId)) + 1;
}

export async function createModifierAssets(opts: {
  modifierId: number;
  name: string;
  description?: string;
  category?: string;
  exportFlag?: boolean;
}): Promise<{ ok: boolean; modifierId: number; error?: string }> {
  const { modifierId, name } = opts;
  if (!Number.isFinite(modifierId) || modifierId <= 0) {
    return { ok: false, modifierId, error: '无效的 modifierId' };
  }
  if (fs.existsSync(indexFsPath(modifierId))) {
    return { ok: false, modifierId, error: `Buff ${modifierId} 已存在` };
  }

  ensureDir(modifierGraphsFsRoot());
  ensureDir(`${modifierGraphsFsRoot()}/${modifierId}`);

  try {
    await Editor.Message.request('asset-db', 'create-asset', modifierFolderDbUrl(modifierId), null);
  } catch {
    /* folder may already exist */
  }

  const index: ModifierIndexJSON = {
    modifierId,
    name: name || `Buff ${modifierId}`,
    description: opts.description || '',
    category: opts.category || '',
    exportFlag: opts.exportFlag ?? true,
  };

  const graph = buildEmptyModifierGraph(modifierId);
  graph.graphId = genId(`modifier_${modifierId}`);

  const okIndex = await writeTextAsset(indexDbUrl(modifierId), JSON.stringify(index, null, 2));
  const okGraph = await writeTextAsset(graphDbUrl(modifierId), JSON.stringify(graph, null, 2));

  if (!okIndex || !okGraph) {
    return { ok: false, modifierId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
  }

  console.log(`[modifier-editor] created ${modifierId}: ${INDEX_FILE_NAME} + ${GRAPH_FILE_NAME}`);
  return { ok: true, modifierId };
}
