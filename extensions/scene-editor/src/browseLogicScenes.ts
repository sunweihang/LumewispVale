import * as fs from 'fs';
import * as path from 'path';
import { listLocalScenes } from './browseScenes';
import { countSpawnItems, countSpawnLayers } from './monsterSpawnUtil';
import { LogicSceneIndexJSON, scenesFsRoot } from './paths';

export interface LogicSceneListItem extends LogicSceneIndexJSON {
  subtitle?: string;
  hasResource?: boolean;
  spawnItemCount?: number;
  spawnLayerCount?: number;
}

export function listLocalLogicScenes(): LogicSceneListItem[] {
  const root = scenesFsRoot();
  if (!fs.existsSync(root)) return [];

  const resourceIds = new Set(listLocalScenes().map((s) => s.sceneId));
  const items: LogicSceneListItem[] = [];

  for (const sceneName of fs.readdirSync(root)) {
    const sceneDir = path.join(root, sceneName);
    if (!fs.statSync(sceneDir).isDirectory()) continue;
    const assetsSceneId = Number(sceneName);
    if (!Number.isFinite(assetsSceneId)) continue;

    const logicRoot = path.join(sceneDir, 'logic');
    if (!fs.existsSync(logicRoot)) continue;

    for (const logicName of fs.readdirSync(logicRoot)) {
      const logicDir = path.join(logicRoot, logicName);
      if (!fs.statSync(logicDir).isDirectory()) continue;
      const logicId = Number(logicName);
      if (!Number.isFinite(logicId)) continue;

      const indexPath = path.join(logicDir, 'index.json');
      let index: LogicSceneIndexJSON = {
        logicId,
        name: `Logic ${logicId}`,
        assetsSceneId,
      };
      if (fs.existsSync(indexPath)) {
        try {
          index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
          index.logicId = logicId;
          index.assetsSceneId = index.assetsSceneId || assetsSceneId;
        } catch (e) {
          console.warn('[scene-editor] bad logic index.json', indexPath, e);
        }
      }

      const layerCount = countSpawnLayers(index.monsterSpawn);
      const itemCount =
        countSpawnItems(index.monsterSpawn) || (index.spawnPoints?.length ?? 0);
      const hasResource = resourceIds.has(index.assetsSceneId);
      items.push({
        ...index,
        hasResource,
        spawnLayerCount: layerCount,
        spawnItemCount: itemCount,
        subtitle: `资源 ${index.assetsSceneId} · ${layerCount}层/${itemCount}项${
          hasResource ? '' : ' · 缺资源场景'
        }`,
      });
    }
  }

  items.sort((a, b) => a.logicId - b.logicId || a.assetsSceneId - b.assetsSceneId);
  return items;
}
