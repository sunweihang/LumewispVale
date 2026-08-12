import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import { ENTRANCE_TYPE, findBallisticNodeDef } from './nodes/ballisticNodes';
import {
  GRAPH_FILE_NAME,
  INDEX_FILE_NAME,
  BallisticIndexJSON,
  ballisticFolderDbUrl,
  ballisticGraphsFsRoot,
  ensureDir,
  graphDbUrl,
  indexDbUrl,
  indexFsPath,
} from './paths';
import { buildBallisticGraphProfile } from './profile';
import { NodeGraphJSON, genId } from './graphTypes';

function entranceDef() {
  return findBallisticNodeDef(ENTRANCE_TYPE)!;
}

export function buildEmptyBallisticGraph(ballisticId: number): NodeGraphJSON {
  const def = entranceDef();
  return {
    version: 1,
    graphId: `ballistic_${ballisticId}`,
    profile: buildBallisticGraphProfile(),
    nodes: [
      {
        id: 'node_entrance',
        typeName: def.typeName,
        title: def.title,
        position: { x: 100, y: 80, w: def.minWidth ?? 200, h: def.minHeight ?? 160 },
        minWidth: def.minWidth ?? 200,
        minHeight: def.minHeight ?? 160,
        inputs: def.inputs.map((p) => ({ ...p })),
        outputs: def.outputs.map((p) => ({ ...p })),
        customData: {},
      },
    ],
    connections: [],
  };
}

/** Unity 弹道 Id 习惯 9 位，从 100000000 起 */
export function nextBallisticId(): number {
  const root = ballisticGraphsFsRoot();
  if (!fs.existsSync(root)) return 100000000;
  let max = 99999999;
  for (const name of fs.readdirSync(root)) {
    const n = Number(name);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export async function createBallisticAssets(opts: {
  ballisticId: number;
  name: string;
  description?: string;
  category?: string;
  exportFlag?: boolean;
}): Promise<{ ok: boolean; ballisticId: number; error?: string }> {
  const { ballisticId, name } = opts;
  if (!Number.isFinite(ballisticId) || ballisticId <= 0) {
    return { ok: false, ballisticId, error: '无效的 ballisticId' };
  }
  if (fs.existsSync(indexFsPath(ballisticId))) {
    return { ok: false, ballisticId, error: `弹道 ${ballisticId} 已存在` };
  }

  ensureDir(ballisticGraphsFsRoot());
  ensureDir(`${ballisticGraphsFsRoot()}/${ballisticId}`);

  try {
    await Editor.Message.request('asset-db', 'create-asset', ballisticFolderDbUrl(ballisticId), null);
  } catch {
    /* folder may already exist */
  }

  const index: BallisticIndexJSON = {
    ballisticId,
    name: name || `Ballistic ${ballisticId}`,
    description: opts.description || '',
    category: opts.category || '',
    exportFlag: opts.exportFlag ?? true,
  };

  const graph = buildEmptyBallisticGraph(ballisticId);
  graph.graphId = genId(`ballistic_${ballisticId}`);

  const okIndex = await writeTextAsset(indexDbUrl(ballisticId), JSON.stringify(index, null, 2));
  const okGraph = await writeTextAsset(graphDbUrl(ballisticId), JSON.stringify(graph, null, 2));

  if (!okIndex || !okGraph) {
    return { ok: false, ballisticId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
  }

  console.log(`[ballistic-editor] created ballistic ${ballisticId}: ${INDEX_FILE_NAME} + ${GRAPH_FILE_NAME}`);
  return { ok: true, ballisticId };
}
