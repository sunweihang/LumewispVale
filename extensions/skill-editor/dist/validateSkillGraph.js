"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGraphJSON = validateGraphJSON;
exports.validateSkillOnDisk = validateSkillOnDisk;
const assetIo_1 = require("./assetIo");
const skillNodes_1 = require("./nodes/skillNodes");
const paths_1 = require("./paths");
const tbAbilityTable_1 = require("./tbAbilityTable");
function validateGraphJSON(graph, skillId) {
    const errors = [];
    const warnings = [];
    if (!graph) {
        errors.push(skillId != null ? `技能 ${skillId} 图不存在或无法解析` : '图为空');
        return { ok: false, errors, warnings };
    }
    if (skillId != null && !(0, tbAbilityTable_1.findTbAbilityRowForGraphId)(skillId)) {
        warnings.push(`仅有图、未入 TbAbility（请在 assets/resources/config/luban/tbability.json 增加 id/templete=${skillId}）`);
    }
    const entrances = graph.nodes.filter((n) => n.typeName === skillNodes_1.ENTRANCE_TYPE);
    if (entrances.length === 0) {
        errors.push(`缺少入口节点 ${skillNodes_1.ENTRANCE_TYPE}`);
    }
    else if (entrances.length > 1) {
        warnings.push(`存在多个入口节点（${entrances.length}），导出仅使用第一个`);
    }
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const c of graph.connections) {
        if (!nodeIds.has(c.fromNodeId) || !nodeIds.has(c.toNodeId)) {
            errors.push(`悬空连线: ${c.fromNodeId} -> ${c.toNodeId}`);
            continue;
        }
        const from = graph.nodes.find((n) => n.id === c.fromNodeId);
        const to = graph.nodes.find((n) => n.id === c.toNodeId);
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
            if (hasOutgoing(graph.connections, e.id, i))
                anyFlow = true;
        }
        if (!anyFlow) {
            warnings.push('入口节点没有任何 Flow 连线（仅 OnUninstall 仍会导出）');
        }
    }
    return { ok: errors.length === 0, errors, warnings };
}
function hasOutgoing(conns, nodeId, portIndex) {
    return conns.some((c) => c.fromNodeId === nodeId && c.fromPortIndex === portIndex);
}
function validateSkillOnDisk(skillId) {
    const text = (0, assetIo_1.readFsText)((0, paths_1.graphFsPath)(skillId));
    if (!text)
        return validateGraphJSON(null, skillId);
    try {
        return validateGraphJSON(JSON.parse(text), skillId);
    }
    catch (e) {
        return { ok: false, errors: [`解析失败: ${e}`], warnings: [] };
    }
}
//# sourceMappingURL=validateSkillGraph.js.map