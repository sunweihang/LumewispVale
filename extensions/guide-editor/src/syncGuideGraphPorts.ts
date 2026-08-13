import * as fs from 'fs';
import { allGuideRegisterNodes } from './nodes/guideNodes';
import { graphFsPath } from './paths';
import { buildGuideGraphProfile } from './profile';
import { ConnectionJSON, NodeGraphJSON } from './graphTypes';

/**
 * 按当前节点定义刷新图上端口，并按「端口名」重映射连线索引。
 */
export function syncGraphPortsFromDefs(graph: NodeGraphJSON): boolean {
  let changed = false;
  const defByType = new Map(allGuideRegisterNodes().map((d) => [d.typeName, d]));

  for (const node of graph.nodes) {
    const def = defByType.get(node.typeName);
    if (!def) continue;

    const oldInNames = node.inputs.map((p) => p.name);
    const oldOutNames = node.outputs.map((p) => p.name);
    const newInNames = def.inputs.map((p) => p.name);
    const newOutNames = def.outputs.map((p) => p.name);

    const portsChanged =
      oldInNames.join('\0') !== newInNames.join('\0') ||
      oldOutNames.join('\0') !== newOutNames.join('\0') ||
      node.inputs.some((p, i) => p.portType !== def.inputs[i]?.portType) ||
      node.outputs.some((p, i) => p.portType !== def.outputs[i]?.portType);

    if (!portsChanged) continue;

    const inMap = buildIndexMap(oldInNames, newInNames);
    const outMap = buildIndexMap(oldOutNames, newOutNames);

    node.inputs = def.inputs.map((p) => ({ name: p.name, portType: p.portType }));
    node.outputs = def.outputs.map((p) => ({ name: p.name, portType: p.portType }));
    if (def.minWidth != null) node.minWidth = def.minWidth;
    if (def.minHeight != null) node.minHeight = def.minHeight;
    if (def.title) node.title = def.title;

    graph.connections = remapConnections(graph.connections, node.id, inMap, outMap);
    changed = true;
  }

  return changed;
}

function buildIndexMap(oldNames: string[], newNames: string[]): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < oldNames.length; i++) {
    const j = newNames.indexOf(oldNames[i]);
    if (j >= 0) map.set(i, j);
  }
  return map;
}

function remapConnections(
  conns: ConnectionJSON[],
  nodeId: string,
  inMap: Map<number, number>,
  outMap: Map<number, number>
): ConnectionJSON[] {
  const next: ConnectionJSON[] = [];
  for (const c of conns) {
    let fromPort = c.fromPortIndex;
    let toPort = c.toPortIndex;
    if (c.fromNodeId === nodeId) {
      const mapped = outMap.get(c.fromPortIndex);
      if (mapped == null) continue;
      fromPort = mapped;
    }
    if (c.toNodeId === nodeId) {
      const mapped = inMap.get(c.toPortIndex);
      if (mapped == null) continue;
      toPort = mapped;
    }
    next.push({ ...c, fromPortIndex: fromPort, toPortIndex: toPort });
  }
  return next;
}

export function syncGraphProfileFromDefs(graph: NodeGraphJSON): boolean {
  const desired = buildGuideGraphProfile();
  const before = JSON.stringify(graph.profile ?? null);
  graph.profile = {
    name: desired.name,
    useLightTheme: desired.useLightTheme,
    nodeFilter: desired.nodeFilter
      ? {
          allowAll: desired.nodeFilter.allowAll,
          whitelist: desired.nodeFilter.whitelist ? [...desired.nodeFilter.whitelist] : [],
          blacklist: desired.nodeFilter.blacklist ? [...desired.nodeFilter.blacklist] : [],
        }
      : undefined,
  };
  return JSON.stringify(graph.profile) !== before;
}

export function syncGuideGraphOnDisk(guideId: number): NodeGraphJSON | null {
  const p = graphFsPath(guideId);
  if (!fs.existsSync(p)) return null;
  let graph: NodeGraphJSON;
  try {
    graph = JSON.parse(fs.readFileSync(p, 'utf8')) as NodeGraphJSON;
  } catch {
    return null;
  }
  const portsChanged = syncGraphPortsFromDefs(graph);
  const profileChanged = syncGraphProfileFromDefs(graph);
  if (portsChanged || profileChanged) {
    fs.writeFileSync(p, JSON.stringify(graph, null, 2), 'utf8');
  }
  return graph;
}
