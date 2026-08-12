"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateGraphJSON = validateGraphJSON;
exports.validateStoryOnDisk = validateStoryOnDisk;
const assetIo_1 = require("./assetIo");
const storyNodes_1 = require("./nodes/storyNodes");
const paths_1 = require("./paths");
function validateGraphJSON(graph, storyId) {
    const errors = [];
    const warnings = [];
    if (!graph) {
        errors.push(storyId != null ? `剧情 ${storyId} 图不存在或无法解析` : '图为空');
        return { ok: false, errors, warnings };
    }
    const entrances = graph.nodes.filter((n) => n.typeName === storyNodes_1.ENTRANCE_TYPE);
    if (entrances.length === 0) {
        errors.push(`缺少入口节点 ${storyNodes_1.ENTRANCE_TYPE}`);
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
    return { ok: errors.length === 0, errors, warnings };
}
function validateStoryOnDisk(storyId) {
    const text = (0, assetIo_1.readFsText)((0, paths_1.graphFsPath)(storyId));
    if (!text) {
        return { ok: false, errors: [`找不到图: ${(0, paths_1.graphFsPath)(storyId)}`], warnings: [] };
    }
    try {
        return validateGraphJSON(JSON.parse(text), storyId);
    }
    catch (e) {
        return { ok: false, errors: [`图 JSON 解析失败: ${e}`], warnings: [] };
    }
}
//# sourceMappingURL=validateStoryGraph.js.map