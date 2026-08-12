import { readFsText } from './assetIo';
import { ENTRANCE_TYPE } from './nodes/skillNodes';
import { graphFsPath } from './paths';
import { ConnectionJSON, NodeGraphJSON } from './graphTypes';
import { findTbAbilityRowForGraphId } from './tbAbilityTable';

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGraphJSON(graph: NodeGraphJSON | null, skillId?: number): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!graph) {
    errors.push(skillId != null ? `技能 ${skillId} 图不存在或无法解析` : '图为空');
    return { ok: false, errors, warnings };
  }

  if (skillId != null && !findTbAbilityRowForGraphId(skillId)) {
    warnings.push(`仅有图、未入 TbAbility（请在 assets/resources/config/luban/tbability.json 增加 id/templete=${skillId}）`);
  }

  const entrances = graph.nodes.filter((n) => n.typeName === ENTRANCE_TYPE);
  if (entrances.length === 0) {
    errors.push(`缺少入口节点 ${ENTRANCE_TYPE}`);
  } else if (entrances.length > 1) {
    warnings.push(`存在多个入口节点（${entrances.length}），导出仅使用第一个`);
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const c of graph.connections) {
    if (!nodeIds.has(c.fromNodeId) || !nodeIds.has(c.toNodeId)) {
      errors.push(`悬空连线: ${c.fromNodeId} -> ${c.toNodeId}`);
      continue;
    }
    const from = graph.nodes.find((n) => n.id === c.fromNodeId)!;
    const to = graph.nodes.find((n) => n.id === c.toNodeId)!;
    if (c.fromPortIndex < 0 || c.fromPortIndex >= from.outputs.length) {
      errors.push(`无效输出端口: ${from.typeName}.${c.fromPortIndex}`);
    }
    if (c.toPortIndex < 0 || c.toPortIndex >= to.inputs.length) {
      errors.push(`无效输入端口: ${to.typeName}.${c.toPortIndex}`);
    }
  }

  // dangling flow outputs (informational)
  if (entrances[0]) {
    const e = entrances[0];
    let anyFlow = false;
    for (let i = 0; i < e.outputs.length; i++) {
      if (hasOutgoing(graph.connections, e.id, i)) anyFlow = true;
    }
    if (!anyFlow) {
      warnings.push('入口节点没有任何 Flow 连线（仅 OnUninstall 仍会导出）');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function hasOutgoing(conns: ConnectionJSON[], nodeId: string, portIndex: number): boolean {
  return conns.some((c) => c.fromNodeId === nodeId && c.fromPortIndex === portIndex);
}

export function validateSkillOnDisk(skillId: number): ValidateResult {
  const text = readFsText(graphFsPath(skillId));
  if (!text) return validateGraphJSON(null, skillId);
  try {
    return validateGraphJSON(JSON.parse(text) as NodeGraphJSON, skillId);
  } catch (e) {
    return { ok: false, errors: [`解析失败: ${e}`], warnings: [] };
  }
}
