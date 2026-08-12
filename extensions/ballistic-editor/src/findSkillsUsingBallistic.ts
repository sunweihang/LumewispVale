import * as fs from 'fs';
import * as path from 'path';
import { skillGraphsFsRoot } from './paths';

export interface SkillUsageHit {
  skillId: number;
  skillName: string;
  nodeId: string;
  typeName: string;
}

/** 扫描技能图中「发射子弹」对弹道模板 Id 的引用（字段或自定义数据）。 */
export function findSkillsUsingBallistic(ballisticId: number): SkillUsageHit[] {
  const root = skillGraphsFsRoot();
  if (!fs.existsSync(root)) return [];

  const hits: SkillUsageHit[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const skillId = Number(name);
    if (!Number.isFinite(skillId)) continue;

    let skillName = `Skill ${skillId}`;
    const indexPath = path.join(dir, 'index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { name?: string };
        if (idx.name) skillName = idx.name;
      } catch {
        /* ignore */
      }
    }

    const graphPath = path.join(dir, 'graph.graph.json');
    if (!fs.existsSync(graphPath)) continue;
    try {
      const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')) as {
        nodes?: Array<{
          id: string;
          typeName: string;
          customData?: Record<string, unknown>;
        }>;
      };
      for (const n of graph.nodes || []) {
        if (
          n.typeName !== 'BallisticFireBulletBlueprint' &&
          n.typeName !== 'FireProjectileBlueprint'
        ) {
          continue;
        }
        const cd = n.customData || {};
        const tid = Number(cd.ballisticTemplate ?? cd.templateId ?? 0);
        if (tid === ballisticId) {
          hits.push({ skillId, skillName, nodeId: n.id, typeName: n.typeName });
        }
      }
    } catch (e) {
      console.warn('[ballistic-editor] scan skill graph failed', graphPath, e);
    }
  }
  return hits;
}
