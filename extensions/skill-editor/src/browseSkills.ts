import * as fs from 'fs';
import * as path from 'path';
import { SkillIndexJSON, skillGraphsFsRoot } from './paths';
import { findTbAbilityRowForGraphId, formatTbAbilityHint } from './tbAbilityTable';

export interface SkillListItem extends SkillIndexJSON {
  hasGraph: boolean;
  /** 是否在 TbAbility 中有对应行（id 或 templete） */
  inTbAbility: boolean;
  abilityRowId?: number;
  abilityTemplete?: number;
  tbAbilityHint: string;
}

export function listLocalSkills(): SkillListItem[] {
  const root = skillGraphsFsRoot();
  if (!fs.existsSync(root)) return [];

  const items: SkillListItem[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const id = Number(name);
    if (!Number.isFinite(id)) continue;

    const indexPath = path.join(dir, 'index.json');
    const graphPath = path.join(dir, 'graph.graph.json');
    let index: SkillIndexJSON = {
      skillId: id,
      name: `Skill ${id}`,
      exportFlag: false,
    };
    if (fs.existsSync(indexPath)) {
      try {
        index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
        index.skillId = id;
      } catch (e) {
        console.warn('[skill-editor] bad index.json', indexPath, e);
      }
    }
    const abilityRow = findTbAbilityRowForGraphId(id);
    items.push({
      ...index,
      hasGraph: fs.existsSync(graphPath),
      inTbAbility: !!abilityRow,
      abilityRowId: abilityRow?.id,
      abilityTemplete: abilityRow?.templete,
      tbAbilityHint: formatTbAbilityHint(id),
    });
  }

  items.sort((a, b) => a.skillId - b.skillId);
  return items;
}
