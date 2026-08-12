import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from './paths';

/** 与运行时 CAbility / tbability.json 字段对齐（编辑器侧只读）。 */
export interface TbAbilityRowJSON {
  id: number;
  note: string;
  templete: number;
  level: number;
  type: number;
  cooldown_time: number;
  range: number;
  phase_time: number;
  spell_time: number;
}

export function tbAbilityJsonFsPath(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'config', 'luban', 'tbability.json');
}

export function loadTbAbilityRows(): TbAbilityRowJSON[] {
  const p = tbAbilityJsonFsPath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? (raw as TbAbilityRowJSON[]) : [];
  } catch (e) {
    console.warn('[skill-editor] bad tbability.json', p, e);
    return [];
  }
}

/** 图 skillId 是否已挂表：行 id 或 templete 命中。 */
export function findTbAbilityRowForGraphId(graphId: number): TbAbilityRowJSON | null {
  if (!graphId) return null;
  const rows = loadTbAbilityRows();
  for (const r of rows) {
    if (r.id === graphId || r.templete === graphId) return r;
  }
  return null;
}

export function formatTbAbilityHint(graphId: number): string {
  const row = findTbAbilityRowForGraphId(graphId);
  if (!row) return '仅有图、未入 TbAbility';
  return `已挂表 id=${row.id} templete=${row.templete}`;
}
