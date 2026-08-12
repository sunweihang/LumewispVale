import * as fs from 'fs';
import * as path from 'path';
import { NodeGraph, NodeGraphJSON } from './NodeGraph';

export function graphToString(graph: NodeGraph, pretty = true): string {
  return JSON.stringify(graph.toJSON(), null, pretty ? 2 : undefined);
}

export function graphFromString(text: string): NodeGraph {
  const json = JSON.parse(text) as NodeGraphJSON;
  return NodeGraph.fromJSON(json);
}

export function saveGraphToFile(filePath: string, graph: NodeGraph): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, graphToString(graph), 'utf8');
}

export function loadGraphFromFile(filePath: string): NodeGraph {
  const text = fs.readFileSync(filePath, 'utf8');
  return graphFromString(text);
}

export async function dbUrlToFsPath(dbUrl: string): Promise<string | null> {
  try {
    const fsPath = (await Editor.Message.request('asset-db', 'query-path', dbUrl)) as string | null;
    return fsPath || null;
  } catch {
    return null;
  }
}

export async function saveGraphToDb(dbUrl: string, graph: NodeGraph): Promise<boolean> {
  const content = graphToString(graph);
  let fsPath = await dbUrlToFsPath(dbUrl);
  if (!fsPath) {
    try {
      await Editor.Message.request('asset-db', 'create-asset', dbUrl, content);
      return true;
    } catch (e) {
      console.error('[node-graph] create-asset failed', dbUrl, e);
      return false;
    }
  }
  try {
    saveGraphToFile(fsPath, graph);
    await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
    return true;
  } catch (e) {
    console.error('[node-graph] save failed', dbUrl, e);
    return false;
  }
}

export async function loadGraphFromDb(dbUrl: string): Promise<NodeGraph | null> {
  const fsPath = await dbUrlToFsPath(dbUrl);
  if (!fsPath || !fs.existsSync(fsPath)) return null;
  try {
    return loadGraphFromFile(fsPath);
  } catch (e) {
    console.error('[node-graph] load failed', dbUrl, e);
    return null;
  }
}
