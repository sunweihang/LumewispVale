import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import { ENTRANCE_TYPE, SKILL_NODE_DEFS } from './nodes/skillNodes';
import {
  GRAPH_FILE_NAME,
  INDEX_FILE_NAME,
  SkillIndexJSON,
  ensureDir,
  graphDbUrl,
  indexDbUrl,
  indexFsPath,
  skillFolderDbUrl,
  skillGraphsFsRoot,
} from './paths';
import { buildSkillGraphProfile } from './profile';
import { NodeGraphJSON, genId } from './graphTypes';

function entranceDef() {
  return SKILL_NODE_DEFS.find((d) => d.typeName === ENTRANCE_TYPE)!;
}

export function buildEmptySkillGraph(skillId: number): NodeGraphJSON {
  const def = entranceDef();
  const nodeId = 'node_entrance';
  return {
    version: 1,
    graphId: `skill_${skillId}`,
    profile: buildSkillGraphProfile(),
    nodes: [
      {
        id: nodeId,
        typeName: def.typeName,
        title: def.title,
        position: { x: 100, y: 80, w: def.minWidth ?? 220, h: def.minHeight ?? 320 },
        minWidth: def.minWidth ?? 220,
        minHeight: def.minHeight ?? 320,
        inputs: def.inputs.map((p) => ({ ...p })),
        outputs: def.outputs.map((p) => ({ ...p })),
        customData: {},
      },
    ],
    connections: [],
  };
}

export function nextSkillId(): number {
  const root = skillGraphsFsRoot();
  if (!fs.existsSync(root)) return 9001;
  let max = 9000;
  for (const name of fs.readdirSync(root)) {
    const n = Number(name);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export async function createSkillAssets(opts: {
  skillId: number;
  name: string;
  description?: string;
  exportFlag?: boolean;
}): Promise<{ ok: boolean; skillId: number; error?: string }> {
  const { skillId, name } = opts;
  if (!Number.isFinite(skillId) || skillId <= 0) {
    return { ok: false, skillId, error: '无效的 skillId' };
  }
  if (fs.existsSync(indexFsPath(skillId))) {
    return { ok: false, skillId, error: `技能 ${skillId} 已存在` };
  }

  ensureDir(skillGraphsFsRoot());
  ensureDir(`${skillGraphsFsRoot()}/${skillId}`);

  // ensure folder visible to asset-db
  try {
    await Editor.Message.request('asset-db', 'create-asset', skillFolderDbUrl(skillId), null);
  } catch {
    /* folder may already exist */
  }

  const index: SkillIndexJSON = {
    skillId,
    name: name || `Skill ${skillId}`,
    description: opts.description || '',
    exportFlag: opts.exportFlag ?? true,
  };

  const graph = buildEmptySkillGraph(skillId);
  // unique graph id
  graph.graphId = genId(`skill_${skillId}`);

  const okIndex = await writeTextAsset(indexDbUrl(skillId), JSON.stringify(index, null, 2));
  const okGraph = await writeTextAsset(graphDbUrl(skillId), JSON.stringify(graph, null, 2));

  if (!okIndex || !okGraph) {
    return { ok: false, skillId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
  }

  console.log(`[skill-editor] created skill ${skillId}: ${INDEX_FILE_NAME} + ${GRAPH_FILE_NAME}`);
  return { ok: true, skillId };
}
