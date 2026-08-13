import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import { listLocalGuides } from './browseGuides';
import { genId, NodeGraphJSON } from './graphTypes';
import { ENTRANCE_TYPE, findGuideNodeDef } from './nodes/guideNodes';
import {
  GRAPH_FILE_NAME,
  INDEX_FILE_NAME,
  GuideIndexJSON,
  ensureDir,
  graphDbUrl,
  indexDbUrl,
  indexFsPath,
  guideFolderDbUrl,
  guideGraphsFsRoot,
} from './paths';
import { buildGuideGraphProfile } from './profile';

function entranceDef() {
  return findGuideNodeDef(ENTRANCE_TYPE)!;
}

export function buildEmptyStoryGraph(guideId: number): NodeGraphJSON {
  const def = entranceDef();
  return {
    version: 1,
    graphId: `guide_${guideId}`,
    profile: buildGuideGraphProfile(),
    nodes: [
      {
        id: 'node_entrance',
        typeName: def.typeName,
        title: def.title,
        position: { x: 100, y: 80, w: def.minWidth ?? 220, h: def.minHeight ?? 180 },
        minWidth: def.minWidth ?? 220,
        minHeight: def.minHeight ?? 180,
        inputs: def.inputs.map((p) => ({ ...p })),
        outputs: def.outputs.map((p) => ({ ...p })),
        customData: {},
      },
    ],
    connections: [],
  };
}

export function nextGuideId(): number {
  const items = listLocalGuides();
  if (items.length === 0) return 2;
  return Math.max(...items.map((i) => i.guideId)) + 1;
}

export async function createGuideAssets(opts: {
  guideId: number;
  name: string;
  description?: string;
  category?: string;
  exportFlag?: boolean;
}): Promise<{ ok: boolean; guideId: number; error?: string }> {
  const { guideId, name } = opts;
  if (!Number.isFinite(guideId) || guideId <= 0) {
    return { ok: false, guideId, error: '无效的 guideId' };
  }
  if (fs.existsSync(indexFsPath(guideId))) {
    return { ok: false, guideId, error: `引导 ${guideId} 已存在` };
  }

  ensureDir(guideGraphsFsRoot());
  ensureDir(`${guideGraphsFsRoot()}/${guideId}`);

  try {
    await Editor.Message.request('asset-db', 'create-asset', guideFolderDbUrl(guideId), null);
  } catch {
    /* folder may already exist */
  }

  const index: GuideIndexJSON = {
    guideId,
    name: name || `Guide ${guideId}`,
    description: opts.description || '',
    category: opts.category || '',
    exportFlag: opts.exportFlag ?? true,
  };

  const graph = buildEmptyStoryGraph(guideId);
  graph.graphId = genId(`guide_${guideId}`);

  const okIndex = await writeTextAsset(indexDbUrl(guideId), JSON.stringify(index, null, 2));
  const okGraph = await writeTextAsset(graphDbUrl(guideId), JSON.stringify(graph, null, 2));

  if (!okIndex || !okGraph) {
    return { ok: false, guideId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
  }

  console.log(`[guide-editor] created ${guideId}: ${INDEX_FILE_NAME} + ${GRAPH_FILE_NAME}`);
  return { ok: true, guideId };
}
