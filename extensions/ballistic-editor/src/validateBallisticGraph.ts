import { readFsText } from './assetIo';
import { ENTRANCE_TYPE } from './nodes/ballisticNodes';
import { graphFsPath } from './paths';
import { ConnectionJSON, NodeGraphJSON } from './graphTypes';

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGraphJSON(graph: NodeGraphJSON | null, ballisticId?: number): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!graph) {
    errors.push(ballisticId != null ? `弹道 ${ballisticId} 图不存在或无法解析` : '图为空');
    return { ok: false, errors, warnings };
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

  if (entrances[0]) {
    let anyFlow = false;
    for (let i = 0; i < entrances[0].outputs.length; i++) {
      if (graph.connections.some((c) => c.fromNodeId === entrances[0].id && c.fromPortIndex === i)) {
        anyFlow = true;
      }
    }
    if (!anyFlow) {
      warnings.push('入口节点没有任何 Flow 连线（仅 OnDespawn 仍会导出）');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateBallisticOnDisk(ballisticId: number): ValidateResult {
  const text = readFsText(graphFsPath(ballisticId));
  if (!text) return validateGraphJSON(null, ballisticId);
  try {
    return validateGraphJSON(JSON.parse(text) as NodeGraphJSON, ballisticId);
  } catch (e) {
    return { ok: false, errors: [`解析失败: ${e}`], warnings: [] };
  }
}

void (null as unknown as ConnectionJSON);
