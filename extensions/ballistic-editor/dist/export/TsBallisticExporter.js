"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportBallisticTs = exportBallisticTs;
exports.exportAllFlagged = exportAllFlagged;
const fs = __importStar(require("fs"));
const assetIo_1 = require("../assetIo");
const browseBallistics_1 = require("../browseBallistics");
const ballisticNodes_1 = require("../nodes/ballisticNodes");
const paths_1 = require("../paths");
const validateBallisticGraph_1 = require("../validateBallisticGraph");
const ExportContext_1 = require("./ExportContext");
const lifecycle_1 = require("./lifecycle");
const TemplateRenderer_1 = require("./TemplateRenderer");
const ClassMapGenerator_1 = require("./ClassMapGenerator");
function exportBallisticTs(ballisticId) {
    const graphText = (0, assetIo_1.readFsText)((0, paths_1.graphFsPath)(ballisticId));
    if (!graphText) {
        return { ok: false, ballisticId, error: `找不到图: ${(0, paths_1.graphFsPath)(ballisticId)}` };
    }
    let graph;
    try {
        graph = JSON.parse(graphText);
    }
    catch (e) {
        return { ok: false, ballisticId, error: `图 JSON 解析失败: ${e}` };
    }
    const validation = (0, validateBallisticGraph_1.validateGraphJSON)(graph, ballisticId);
    if (!validation.ok) {
        return { ok: false, ballisticId, error: validation.errors.join('; '), warnings: validation.warnings };
    }
    const entrance = graph.nodes.find((n) => n.typeName === ballisticNodes_1.ENTRANCE_TYPE);
    if (!entrance) {
        return { ok: false, ballisticId, error: `缺少 ${ballisticNodes_1.ENTRANCE_TYPE}` };
    }
    const ctx = new ExportContext_1.ExportContext(graph, ballisticId);
    ctx.collectReachable(entrance);
    const classTpl = (0, TemplateRenderer_1.loadTemplate)('BallisticClass.ts.tpl');
    const entranceTpl = (0, TemplateRenderer_1.loadTemplate)('BallisticEntranceBlueprint.ts.tpl');
    if (!classTpl || !entranceTpl) {
        return {
            ok: false,
            ballisticId,
            error: '缺少模板 BallisticClass.ts.tpl 或 BallisticEntranceBlueprint.ts.tpl',
        };
    }
    const fields = writeFields(ctx);
    const lifecycle = writeLifecycle(ctx, entranceTpl);
    if (lifecycle == null) {
        return { ok: false, ballisticId, error: '生命周期模板渲染失败' };
    }
    const methods = writeNodeMethods(ctx);
    const className = `${paths_1.CLASS_PREFIX}${ballisticId}`;
    const code = (0, TemplateRenderer_1.renderTemplate)(classTpl, {
        CLASS_NAME: className,
        BALLISTIC_ID: String(ballisticId),
        FIELDS: fields,
        LIFECYCLE_METHODS: lifecycle,
        BLUEPRINT_METHODS: methods,
    });
    (0, paths_1.ensureDir)((0, paths_1.generatedDirFs)());
    const outPath = (0, paths_1.generatedClassFsPath)(ballisticId);
    if (fs.existsSync(outPath)) {
        try {
            fs.unlinkSync(outPath);
        }
        catch {
            /* overwrite below */
        }
    }
    (0, assetIo_1.writeFsText)(outPath, code);
    touchExportFlag(ballisticId);
    (0, ClassMapGenerator_1.regenerateClassMap)();
    return {
        ok: true,
        ballisticId,
        path: outPath,
        warnings: validation.warnings,
    };
}
function exportAllFlagged() {
    const items = (0, browseBallistics_1.listLocalBallistics)().filter((s) => s.exportFlag !== false);
    const results = [];
    let ok = 0;
    let fail = 0;
    for (const s of items) {
        const r = exportBallisticTs(s.ballisticId);
        results.push(r);
        if (r.ok)
            ok++;
        else
            fail++;
    }
    (0, ClassMapGenerator_1.regenerateClassMap)();
    return { ok, fail, results };
}
function touchExportFlag(ballisticId) {
    const p = (0, paths_1.indexFsPath)(ballisticId);
    if (!fs.existsSync(p))
        return;
    try {
        const index = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (index.exportFlag == null) {
            index.exportFlag = true;
            fs.writeFileSync(p, JSON.stringify(index, null, 2), 'utf8');
        }
    }
    catch {
        /* ignore */
    }
}
function writeFields(ctx) {
    if (ctx.dataVariables.size === 0)
        return '';
    const lines = [''];
    for (const v of ctx.dataVariables.values()) {
        lines.push(`    private ${v.fieldName}: ${v.tsType}${fieldInit(v.tsType)};`);
    }
    lines.push('');
    return lines.join('\n');
}
function fieldInit(tsType) {
    switch (tsType) {
        case 'number':
            return ' = 0';
        case 'boolean':
            return ' = false';
        case 'string':
            return " = ''";
        case 'Node[]':
            return ' = []';
        case 'Vec3':
            return ' = new Vec3()';
        case 'Node | null':
        case 'AbsLinearBallistic | null':
            return ' = null';
        default:
            return ' = null as any';
    }
}
function writeLifecycle(ctx, entranceTpl) {
    const blocks = (0, TemplateRenderer_1.splitLifecycleMethodBlocks)(entranceTpl);
    if (blocks.length === 0)
        return null;
    const specs = (0, lifecycle_1.getLifecycleSpecs)();
    const parts = [];
    for (const spec of specs) {
        const calls = ctx.getFlowCallsFromEntrance(spec.portIndex);
        if (!spec.alwaysEmit && calls.length === 0)
            continue;
        const block = (0, TemplateRenderer_1.findLifecycleBlock)(blocks, spec.methodName);
        if (!block) {
            console.error(`[ballistic-editor] missing lifecycle block: ${spec.methodName}`);
            return null;
        }
        const flowBody = calls.length === 0
            ? '        // (empty)\n'
            : calls.map((l) => `        ${l}`).join('\n') + '\n';
        parts.push((0, TemplateRenderer_1.renderTemplate)(block, { FLOW_0: flowBody }));
    }
    return parts.join('\n');
}
function writeNodeMethods(ctx) {
    const parts = [];
    for (const info of ctx.visitedNodes) {
        if (info.node.typeName === ballisticNodes_1.ENTRANCE_TYPE)
            continue;
        const tpl = (0, TemplateRenderer_1.findNodeTemplate)(info.node.typeName);
        const ph = ctx.buildNodePlaceholders(info);
        if (tpl && tpl.includes('{{METHOD_NAME}}')) {
            parts.push('\n' + (0, TemplateRenderer_1.renderTemplate)(tpl, ph));
            continue;
        }
        parts.push('');
        parts.push(`    private ${info.methodName}(): void {`);
        if (tpl) {
            const body = (0, TemplateRenderer_1.renderTemplate)(tpl, ph);
            for (const line of body.split(/\r?\n/)) {
                if (line.trim().length === 0)
                    parts.push('');
                else
                    parts.push(`        ${line}`);
            }
        }
        else {
            parts.push(`        // TODO: unknown node type ${info.node.typeName}`);
            const abs = ctx.flowOutAbsoluteIndex(info.node, 0);
            if (abs >= 0) {
                const flow = ctx.formatFlowCalls(info.node.id, abs, '        ');
                if (flow)
                    parts.push(flow.replace(/\n$/, ''));
            }
        }
        parts.push('    }');
    }
    return parts.join('\n') + '\n';
}
//# sourceMappingURL=TsBallisticExporter.js.map