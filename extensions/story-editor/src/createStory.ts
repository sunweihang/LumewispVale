import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import { listLocalStories } from './browseStories';
import { genId, NodeGraphJSON } from './graphTypes';
import { ENTRANCE_TYPE, findStoryNodeDef } from './nodes/storyNodes';
import {
  GRAPH_FILE_NAME,
  INDEX_FILE_NAME,
  StoryIndexJSON,
  ensureDir,
  graphDbUrl,
  indexDbUrl,
  indexFsPath,
  storyFolderDbUrl,
  storyGraphsFsRoot,
} from './paths';
import { buildStoryGraphProfile } from './profile';

function entranceDef() {
  return findStoryNodeDef(ENTRANCE_TYPE)!;
}

export function buildEmptyStoryGraph(storyId: number): NodeGraphJSON {
  const def = entranceDef();
  return {
    version: 1,
    graphId: `story_${storyId}`,
    profile: buildStoryGraphProfile(),
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

export function nextStoryId(): number {
  const items = listLocalStories();
  if (items.length === 0) return 10001;
  return Math.max(...items.map((i) => i.storyId)) + 1;
}

export async function createStoryAssets(opts: {
  storyId: number;
  name: string;
  description?: string;
  category?: string;
  exportFlag?: boolean;
}): Promise<{ ok: boolean; storyId: number; error?: string }> {
  const { storyId, name } = opts;
  if (!Number.isFinite(storyId) || storyId <= 0) {
    return { ok: false, storyId, error: '无效的 storyId' };
  }
  if (fs.existsSync(indexFsPath(storyId))) {
    return { ok: false, storyId, error: `剧情 ${storyId} 已存在` };
  }

  ensureDir(storyGraphsFsRoot());
  ensureDir(`${storyGraphsFsRoot()}/${storyId}`);

  try {
    await Editor.Message.request('asset-db', 'create-asset', storyFolderDbUrl(storyId), null);
  } catch {
    /* folder may already exist */
  }

  const index: StoryIndexJSON = {
    storyId,
    name: name || `Story ${storyId}`,
    description: opts.description || '',
    category: opts.category || '',
    exportFlag: opts.exportFlag ?? true,
  };

  const graph = buildEmptyStoryGraph(storyId);
  graph.graphId = genId(`story_${storyId}`);

  const okIndex = await writeTextAsset(indexDbUrl(storyId), JSON.stringify(index, null, 2));
  const okGraph = await writeTextAsset(graphDbUrl(storyId), JSON.stringify(graph, null, 2));

  if (!okIndex || !okGraph) {
    return { ok: false, storyId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
  }

  console.log(`[story-editor] created ${storyId}: ${INDEX_FILE_NAME} + ${GRAPH_FILE_NAME}`);
  return { ok: true, storyId };
}
