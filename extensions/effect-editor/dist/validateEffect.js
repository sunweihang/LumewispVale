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
exports.validateEffectOnDisk = validateEffectOnDisk;
const fs = __importStar(require("fs"));
const browseEffects_1 = require("./browseEffects");
const paths_1 = require("./paths");
function loadResPrefabTable() {
    const p = (0, paths_1.resJsonFsPath)();
    if (!fs.existsSync(p))
        return {};
    try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        return data.prefab || {};
    }
    catch {
        return {};
    }
}
function validateEffectOnDisk(effectId) {
    var _a;
    const errors = [];
    const warnings = [];
    const item = (0, browseEffects_1.listLocalEffects)().find((e) => e.effectId === effectId);
    if (!item) {
        return { ok: false, errors: [`特效 ${effectId} 不存在`], warnings };
    }
    const indexPath = (0, paths_1.indexFsPath)(effectId);
    if (!fs.existsSync(indexPath)) {
        errors.push('缺少 index.json');
    }
    else {
        try {
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            if (!index.poolName)
                warnings.push('未配置 poolName');
            if (!index.prefab)
                errors.push('未配置 prefab');
            else if (!fs.existsSync((0, paths_1.prefabFsPath)(index.prefab))) {
                errors.push(`Prefab 不存在: ${index.prefab}`);
            }
            const resId = (_a = index.resId) !== null && _a !== void 0 ? _a : effectId;
            const entry = loadResPrefabTable()[String(resId)];
            if (!entry) {
                warnings.push(`res.json 无 id=${resId} 条目（运行时可能加载不到）`);
            }
            else {
                if (entry.name && index.poolName && entry.name !== index.poolName) {
                    warnings.push(`res.json name=${entry.name} 与 poolName=${index.poolName} 不一致`);
                }
                const expectUrl = (index.prefab || '').replace(/\.prefab$/, '');
                if (entry.url && entry.url !== expectUrl) {
                    warnings.push(`res.json url=${entry.url} 期望 ${expectUrl}`);
                }
            }
        }
        catch (e) {
            errors.push(`index.json 解析失败: ${e}`);
        }
    }
    return { ok: errors.length === 0, errors, warnings };
}
//# sourceMappingURL=validateEffect.js.map