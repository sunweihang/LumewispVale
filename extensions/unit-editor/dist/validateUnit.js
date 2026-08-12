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
exports.validateUnitOnDisk = validateUnitOnDisk;
const fs = __importStar(require("fs"));
const paths_1 = require("./paths");
function collectNodeNames(prefabJson) {
    const names = new Set();
    for (const obj of prefabJson) {
        if (!obj || typeof obj !== 'object')
            continue;
        const o = obj;
        if (o.__type__ === 'cc.Node' && typeof o._name === 'string') {
            names.add(o._name);
        }
    }
    return names;
}
function hasDecorator(prefabJson) {
    for (const obj of prefabJson) {
        if (!obj || typeof obj !== 'object')
            continue;
        const t = String(obj.__type__ || '');
        // compressed uuid for EntityAttachmentSlotDecorator or class name fallback
        // EntityAttachmentSlotDecorator script uuid a8c3e1f2-… → compressed a8c3e…
        if (t.includes('EntityAttachmentSlotDecorator') || t.startsWith('a8c3e')) {
            return true;
        }
    }
    return false;
}
function resolveSlotFromNames(names, slot) {
    if (slot === 1)
        return true; // Root = entity itself
    for (const [nodeName, mapped] of Object.entries(paths_1.NODE_NAME_TO_SLOT)) {
        if (mapped === slot && names.has(nodeName))
            return true;
    }
    const fallbacks = paths_1.SLOT_FALLBACK_NAMES[slot];
    if (fallbacks) {
        for (const n of fallbacks) {
            if (names.has(n))
                return true;
        }
    }
    return false;
}
function validateUnitOnDisk(unitId) {
    var _a;
    const errors = [];
    const warnings = [];
    const foundSlots = [];
    const indexPath = (0, paths_1.indexFsPath)(unitId);
    if (!fs.existsSync(indexPath)) {
        return { ok: false, errors: [`缺少 index.json`], warnings, foundSlots };
    }
    let index;
    try {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    }
    catch (e) {
        return { ok: false, errors: [`index.json 解析失败: ${e}`], warnings, foundSlots };
    }
    if (!index.prefab) {
        errors.push('index.prefab 为空');
        return { ok: false, errors, warnings, foundSlots };
    }
    const prefabPath = (0, paths_1.prefabFsPath)(index.prefab);
    if (!fs.existsSync(prefabPath)) {
        errors.push(`Prefab 不存在: ${index.prefab}`);
        return { ok: false, errors, warnings, foundSlots };
    }
    let prefabJson;
    try {
        prefabJson = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    }
    catch (e) {
        return { ok: false, errors: [`Prefab 解析失败: ${e}`], warnings, foundSlots };
    }
    if (!hasDecorator(prefabJson)) {
        warnings.push('Prefab 根上未见 EntityAttachmentSlotDecorator（运行时 UnitManager 会自动补）');
    }
    const names = collectNodeNames(prefabJson);
    const required = (0, paths_1.resolveRequiredSlots)(index);
    for (const slot of required) {
        if (resolveSlotFromNames(names, slot)) {
            foundSlots.push(slot);
        }
        else {
            errors.push(`缺少挂点 ${(_a = paths_1.SLOT_LABELS[slot]) !== null && _a !== void 0 ? _a : slot}（slot=${slot}）`);
        }
    }
    // 扫描到的全部已知槽
    for (const [nodeName, slot] of Object.entries(paths_1.NODE_NAME_TO_SLOT)) {
        if (names.has(nodeName) && !foundSlots.includes(slot)) {
            foundSlots.push(slot);
        }
    }
    return { ok: errors.length === 0, errors, warnings, foundSlots };
}
//# sourceMappingURL=validateUnit.js.map