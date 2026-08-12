import * as fs from 'fs';
import { listLocalEffects } from './browseEffects';
import { EffectIndexJSON, indexFsPath, prefabFsPath, resJsonFsPath } from './paths';

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function loadResPrefabTable(): Record<string, { id?: number; name?: string; url?: string }> {
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

export function validateEffectOnDisk(effectId: number): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const item = listLocalEffects().find((e) => e.effectId === effectId);
  if (!item) {
    return { ok: false, errors: [`特效 ${effectId} 不存在`], warnings };
  }

  const indexPath = indexFsPath(effectId);
  if (!fs.existsSync(indexPath)) {
    errors.push('缺少 index.json');
  } else {
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as EffectIndexJSON;
      if (!index.poolName) warnings.push('未配置 poolName');
      if (!index.prefab) errors.push('未配置 prefab');
      else if (!fs.existsSync(prefabFsPath(index.prefab))) {
        errors.push(`Prefab 不存在: ${index.prefab}`);
      }
      const resId = index.resId ?? effectId;
      const entry = loadResPrefabTable()[String(resId)];
      if (!entry) {
        warnings.push(`res.json 无 id=${resId} 条目（运行时可能加载不到）`);
      } else {
        if (entry.name && index.poolName && entry.name !== index.poolName) {
          warnings.push(`res.json name=${entry.name} 与 poolName=${index.poolName} 不一致`);
        }
        const expectUrl = (index.prefab || '').replace(/\.prefab$/, '');
        if (entry.url && entry.url !== expectUrl) {
          warnings.push(`res.json url=${entry.url} 期望 ${expectUrl}`);
        }
      }
    } catch (e) {
      errors.push(`index.json 解析失败: ${e}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
