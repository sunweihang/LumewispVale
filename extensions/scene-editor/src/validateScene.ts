import * as fs from 'fs';
import { listLocalLogicScenes } from './browseLogicScenes';
import { listLocalScenes } from './browseScenes';
import {
  LogicSceneIndexJSON,
  SceneIndexJSON,
  indexFsPath,
  logicIndexFsPath,
  prefabFsPath,
  resJsonFsPath,
} from './paths';
import { listSpawnConfigsForLogic } from './spawnConfigIO';

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function loadResPrefabTable(): Record<string, { id?: number; name?: string; url?: string }> {
  const p = resJsonFsPath();
  if (!fs.existsSync(p)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      prefab?: Record<string, { id?: number; name?: string; url?: string }>;
    };
    return data.prefab || {};
  } catch {
    return {};
  }
}

export function findResEntry(resId: number): { name?: string; url?: string } | null {
  const table = loadResPrefabTable();
  return table[String(resId)] || null;
}

export function validateSceneOnDisk(sceneId: number): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const item = listLocalScenes().find((s) => s.sceneId === sceneId);
  if (!item) {
    return { ok: false, errors: [`场景 ${sceneId} 不存在`], warnings };
  }

  const indexPath = indexFsPath(sceneId);
  if (!fs.existsSync(indexPath)) {
    errors.push('缺少 index.json');
  } else {
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as SceneIndexJSON;
      if (!index.poolName) warnings.push('未配置 poolName');
      if (!index.prefab) errors.push('未配置 prefab');
      else if (!fs.existsSync(prefabFsPath(index.prefab))) {
        errors.push(`Prefab 不存在: ${index.prefab}`);
      }
      const resId = index.resId ?? sceneId;
      const entry = findResEntry(resId);
      if (!entry) {
        warnings.push(`res.json 无 id=${resId} 条目（运行时可能加载不到）`);
      } else {
        if (entry.name && index.poolName && entry.name !== index.poolName) {
          warnings.push(`res.json name=${entry.name} 与 poolName=${index.poolName} 不一致`);
        }
        const expectUrl = index.prefab.replace(/\.prefab$/, '');
        if (entry.url && entry.url !== expectUrl) {
          warnings.push(`res.json url=${entry.url} 与 prefab=${expectUrl} 不一致`);
        }
      }
    } catch (e) {
      errors.push(`index.json 解析失败: ${e}`);
    }
  }

  const logics = listLocalLogicScenes().filter((l) => l.assetsSceneId === sceneId);
  if (logics.length === 0) {
    warnings.push('无绑定逻辑场景');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateLogicSceneOnDisk(logicId: number): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const item = listLocalLogicScenes().find((l) => l.logicId === logicId);
  if (!item) {
    return { ok: false, errors: [`逻辑场景 ${logicId} 不存在`], warnings };
  }

  const indexPath = logicIndexFsPath(item.assetsSceneId, logicId);
  if (!fs.existsSync(indexPath)) {
    errors.push('缺少 logic index.json');
  } else {
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as LogicSceneIndexJSON;
      if (!index.assetsSceneId) errors.push('缺少 assetsSceneId');
      else {
        const res = listLocalScenes().find((s) => s.sceneId === index.assetsSceneId);
        if (!res) errors.push(`绑定资源场景 ${index.assetsSceneId} 不存在`);
        else if (!res.hasPrefab) warnings.push(`资源场景 ${index.assetsSceneId} 缺 Prefab`);
      }
      const layers = index.monsterSpawn?.layers ?? [];
      const spawnItems = layers.reduce((n, l) => n + (l.items?.length ?? 0), 0);
      if (spawnItems === 0 && (!index.spawnPoints || index.spawnPoints.length === 0)) {
        warnings.push('尚无种植数据（在逻辑场景点「编辑种植」，或「从Prefab导入」）');
      }
      const configs = listSpawnConfigsForLogic(logicId);
      const cfgLayers = new Set(configs.map((c) => c.layer_id));
      for (const layer of layers) {
        if (!cfgLayers.has(layer.layerId)) {
          warnings.push(
            `种植 #ID ${layer.layerId} 在 tbspawnconfig 无行（logic_scene_id=${logicId}, layer_id=${layer.layerId}）；请在 Excel/Luban 节奏表补齐后导出`
          );
        }
      }
    } catch (e) {
      errors.push(`logic index 解析失败: ${e}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
