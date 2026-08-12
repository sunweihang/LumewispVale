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
exports.PAN_ROLE_DEFAULT = void 0;
exports.bindResultFromCdeConfig = bindResultFromCdeConfig;
exports.scanCdePrefabFile = scanCdePrefabFile;
exports.scanPrefabFile = scanPrefabFile;
exports.renderComponentTableTs = renderComponentTableTs;
exports.writeGenerated = writeGenerated;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 默认：Role 面板约定（装备格已交给 Item_EquipSlot 本地 CDE） */
exports.PAN_ROLE_DEFAULT = {
    panelName: 'Pan_Role',
    components: [
        { name: 'u_ComPack', path: 'Pack', typeName: 'UISlotGrid' },
        { name: 'u_ComDragEquip', path: 'DragEquip', typeName: 'cc.Sprite' },
        { name: 'u_ComBtnExit', path: 'BTN_Exit', typeName: 'cc.Button' },
    ],
    events: [{ eventName: 'u_EventClose', path: 'BTN_Exit' }],
    data: [],
};
function walkNodes(arr, id, parentPath, out) {
    const n = arr[id];
    if (!n || n.__type__ !== 'cc.Node')
        return;
    const name = n._name || '';
    const p = parentPath ? `${parentPath}/${name}` : name;
    const rel = p.includes('/') ? p.slice(p.indexOf('/') + 1) : '';
    out.push({ path: rel, name, id });
    for (const c of n._children || []) {
        walkNodes(arr, c.__id__, p, out);
    }
}
function inferBindKind(dataName, typeName) {
    if (typeName) {
        if (/ProgressBar/i.test(typeName))
            return 'progress';
        if (/Label/i.test(typeName))
            return 'label';
        if (/Sprite/i.test(typeName))
            return 'sprite';
    }
    if (/Progress/i.test(dataName))
        return 'progress';
    if (/Percent|Label|Text|Num/i.test(dataName))
        return 'label';
    if (/Active|Visible|Show/i.test(dataName))
        return 'active';
    return 'sprite';
}
function resolveDataBind(d, components) {
    const dataName = d.dataName || d.name;
    let path = d.path || '';
    let bindKind = d.bindKind || undefined;
    if (/Progress/i.test(dataName)) {
        const pb = components.find((c) => /ProgressBar/i.test(c.typeName || ''));
        if (pb) {
            path = path || pb.path || dataName;
            bindKind = bindKind || 'progress';
        }
    }
    if (/Percent|Label|Text|Num/i.test(dataName)) {
        const lb = components.find((c) => /Label/i.test(c.typeName || '') || c.path === dataName);
        if (lb) {
            path = path || lb.path || dataName;
            bindKind = bindKind || 'label';
        }
        else {
            bindKind = bindKind || 'label';
        }
    }
    return {
        dataName,
        path: path || dataName,
        bindKind: bindKind || inferBindKind(dataName),
    };
}
/** 从 CDE 配置对象生成绑定结果（真源：*_CDE.prefab 的 C/D/E 表） */
function bindResultFromCdeConfig(payload) {
    const panelName = (payload.panelName || payload.name || 'UI').replace(/_CDE$/i, '');
    const components = (payload.components || [])
        .filter((c) => !!(c === null || c === void 0 ? void 0 : c.name))
        .map((c) => ({
        name: c.name,
        path: c.path || '',
        ...(c.typeName ? { typeName: c.typeName } : {}),
    }));
    const events = (payload.events || [])
        .filter((e) => !!((e === null || e === void 0 ? void 0 : e.eventName) || (e === null || e === void 0 ? void 0 : e.name)))
        .map((e) => ({
        eventName: e.eventName || e.name,
        path: e.path || '',
    }));
    const data = (payload.data || [])
        .filter((d) => !!((d === null || d === void 0 ? void 0 : d.dataName) || (d === null || d === void 0 ? void 0 : d.name)))
        .map((d) => resolveDataBind(d, components));
    return { panelName, components, events, data };
}
/** 从 *_CDE.prefab JSON 解析 ConfigAsset 行 */
function scanCdePrefabFile(prefabFsPath, panelNameHint) {
    const arr = JSON.parse(fs.readFileSync(prefabFsPath, 'utf8'));
    const asset = arr.find((o) => o &&
        Array.isArray(o.components) &&
        Array.isArray(o.data) &&
        Array.isArray(o.events) &&
        (o.resName != null || o.pkgName != null));
    if (!asset) {
        throw new Error(`未找到 UIBindCDEConfigAsset: ${prefabFsPath}`);
    }
    return bindResultFromCdeConfig({
        panelName: panelNameHint || asset.resName || asset.pkgName || path.basename(prefabFsPath, '.prefab'),
        name: asset.resName || asset.pkgName,
        components: asset.components || [],
        data: asset.data || [],
        events: asset.events || [],
    });
}
/** 扫描 UI prefab：u_ 前缀节点；Role 合并默认表中仍存在的路径 */
function scanPrefabFile(prefabFsPath, panelNameHint) {
    const norm = prefabFsPath.replace(/\\/g, '/');
    if (/_CDE\.prefab$/i.test(norm)) {
        return scanCdePrefabFile(prefabFsPath, panelNameHint);
    }
    const arr = JSON.parse(fs.readFileSync(prefabFsPath, 'utf8'));
    const root = arr[1];
    const panelName = panelNameHint || (root === null || root === void 0 ? void 0 : root._name) || path.basename(prefabFsPath, '.prefab');
    const nodes = [];
    walkNodes(arr, 1, '', nodes);
    const pathSet = new Set(nodes.map((n) => n.path).filter(Boolean));
    const components = [];
    const events = [];
    const data = [];
    for (const n of nodes) {
        if (!n.path || !n.name.startsWith('u_'))
            continue;
        if (n.name.startsWith('u_Event')) {
            events.push({ eventName: n.name, path: n.path });
        }
        else if (n.name.startsWith('u_Data')) {
            data.push({ dataName: n.name, path: n.path, bindKind: 'sprite' });
        }
        else {
            components.push({
                name: n.name.startsWith('u_Com') ? n.name : `u_Com${n.name.slice(2)}`,
                path: n.path,
            });
        }
    }
    if (panelName === 'Pan_Role' || norm.includes('Pan_Role')) {
        for (const e of exports.PAN_ROLE_DEFAULT.components) {
            if (pathSet.has(e.path) && !components.some((c) => c.name === e.name)) {
                components.push(e);
            }
        }
        for (const e of exports.PAN_ROLE_DEFAULT.events) {
            if (pathSet.has(e.path) && !events.some((x) => x.eventName === e.eventName)) {
                events.push(e);
            }
        }
        for (const e of exports.PAN_ROLE_DEFAULT.data) {
            if (pathSet.has(e.path) && !data.some((x) => x.dataName === e.dataName)) {
                data.push(e);
            }
        }
    }
    return { panelName, components, events, data };
}
function renderComponentTableTs(result) {
    const className = `${result.panelName}_ComponentTable`;
    const fields = result.components
        .map((c) => `    /** ${c.path} */\n    ${c.name}: Node | null = null;`)
        .join('\n');
    const bindLines = result.components
        .map((c) => `        this.${c.name} = UIBindComponentTable.findByPath(root, ${JSON.stringify(c.path)});`)
        .join('\n');
    const entriesJson = JSON.stringify(result.components.map((c) => ({
        name: c.name,
        path: c.path,
        ...(c.typeName ? { typeName: c.typeName } : {}),
    })), null, 4);
    const eventsJson = JSON.stringify(result.events, null, 4);
    const dataJson = JSON.stringify(result.data, null, 4);
    return `/*
 * 由 ui-bind 从 CDE 自动生成，请勿手改
 * panel: ${result.panelName}
 */

import { Node } from 'cc';
import { UIBindComponentTable } from '../bind/UIBindComponentTable';
import type { UIBindComponentEntry } from '../bind/UIBindComponentTable';

export const ${result.panelName}_COMPONENT_ENTRIES: UIBindComponentEntry[] = ${entriesJson};

export const ${result.panelName}_EVENT_BINDS = ${eventsJson} as const;

export const ${result.panelName}_DATA_BINDS = ${dataJson} as const;

export class ${className} {
${fields || '    // empty'}

    bind(root: Node): void {
${bindLines || '        // empty'}
    }
}
`;
}
function writeGenerated(projectRoot, result) {
    const dir = path.join(projectRoot, 'assets/Scripts/src/gui/generated');
    fs.mkdirSync(dir, { recursive: true });
    const tsPath = path.join(dir, `${result.panelName}_ComponentTable.ts`);
    const jsonPath = path.join(dir, `${result.panelName}_BindManifest.json`);
    fs.writeFileSync(tsPath, renderComponentTableTs(result), 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    return { tsPath, jsonPath };
}
//# sourceMappingURL=generateFromPrefab.js.map