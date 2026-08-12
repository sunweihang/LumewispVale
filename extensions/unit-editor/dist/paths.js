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
exports.DEFAULT_COLLISION_CENTER_Y = exports.DEFAULT_COLLISION_HEIGHT = exports.DEFAULT_COLLISION_RADIUS = exports.SLOT_FALLBACK_NAMES = exports.NODE_NAME_TO_SLOT = exports.NECESSARY_BONE_NAMES = exports.SLOT_LABELS = exports.DEFAULT_REQUIRED_SLOTS = exports.INDEX_FILE_NAME = exports.UNITS_DB_ROOT = void 0;
exports.getProjectRoot = getProjectRoot;
exports.unitsFsRoot = unitsFsRoot;
exports.unitFolderDbUrl = unitFolderDbUrl;
exports.unitFolderFsPath = unitFolderFsPath;
exports.unitResFsPath = unitResFsPath;
exports.unitOutputFsPath = unitOutputFsPath;
exports.unitOutputPrefabRel = unitOutputPrefabRel;
exports.unitOutputPrefabDbUrl = unitOutputPrefabDbUrl;
exports.unitOutputPrefabFsPath = unitOutputPrefabFsPath;
exports.indexDbUrl = indexDbUrl;
exports.indexFsPath = indexFsPath;
exports.prefabDbUrl = prefabDbUrl;
exports.prefabFsPath = prefabFsPath;
exports.ensureDir = ensureDir;
exports.resolveRequiredSlots = resolveRequiredSlots;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.UNITS_DB_ROOT = 'db://assets/resources/units';
exports.INDEX_FILE_NAME = 'index.json';
/** 与运行时 EnumSlot / DEFAULT_REQUIRED_SLOTS 对齐 */
exports.DEFAULT_REQUIRED_SLOTS = [1, 17, 2, 0]; // Root, FirePoint, HitBone, Hud
exports.SLOT_LABELS = {
    0: 'Hud',
    1: 'Root',
    2: 'HitBone',
    17: 'FirePoint',
};
exports.NECESSARY_BONE_NAMES = [
    'bone_hud',
    'bone_hit',
    'bone_root',
    'bone_forward',
    'mainBody',
    'fire_point',
];
/** 节点名 → slot（与 runtime SlotNameMap 保持同步） */
exports.NODE_NAME_TO_SLOT = {
    head: 6,
    Head: 6,
    headPoint: 6,
    mainbody: 22,
    mainBody: 22,
    bone_root: 1,
    bone_hud: 0,
    bone_hit: 2,
    helm: 5,
    gun: 14,
    gun01: 16,
    gun02: 19,
    gun03: 20,
    fire_point: 17,
    FirePoint: 17,
    ShootPoint: 17,
    shootPoint: 17,
    weapon_L: 3,
    weapon_R: 4,
    levelCard: 18,
    bone_forward: 21,
    'Bip001 Pelvis': 10,
    'Bip001 L Hand': 11,
    'Bip001 R Hand': 12,
    Dummy001: 13,
    'Dummy001 Socket': 13,
    turret_point: 15,
    BloodHUD: 0,
    HitBone: 2,
};
exports.SLOT_FALLBACK_NAMES = {
    17: ['shootPoint', 'ShootPoint', 'fire_point', 'FirePoint', 'gun01'],
    2: ['bone_hit', 'HitBone'],
    0: ['bone_hud', 'BloodHUD'],
    1: ['bone_root'],
};
/** 与运行时 UnitCollisionVolume 默认一致 */
exports.DEFAULT_COLLISION_RADIUS = 0.5;
exports.DEFAULT_COLLISION_HEIGHT = 1.5;
exports.DEFAULT_COLLISION_CENTER_Y = 0.75;
function getProjectRoot() {
    var _a;
    if (typeof Editor !== 'undefined' && ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path)) {
        return Editor.Project.path;
    }
    return path.resolve(__dirname, '../../..');
}
function unitsFsRoot() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'units');
}
function unitFolderDbUrl(unitId) {
    return `${exports.UNITS_DB_ROOT}/${unitId}`;
}
function unitFolderFsPath(unitId) {
    return path.join(unitsFsRoot(), String(unitId));
}
/** 对齐 GameAsset Unit/{id}/Res */
function unitResFsPath(unitId) {
    return path.join(unitFolderFsPath(unitId), 'Res');
}
/** 对齐 GameAsset Unit/{id}/Output */
function unitOutputFsPath(unitId) {
    return path.join(unitFolderFsPath(unitId), 'Output');
}
/** resources 相对路径：units/{id}/Output/{id}（无 .prefab） */
function unitOutputPrefabRel(unitId) {
    return `units/${unitId}/Output/${unitId}`;
}
function unitOutputPrefabDbUrl(unitId) {
    return prefabDbUrl(unitOutputPrefabRel(unitId));
}
function unitOutputPrefabFsPath(unitId) {
    return prefabFsPath(unitOutputPrefabRel(unitId));
}
function indexDbUrl(unitId) {
    return `${unitFolderDbUrl(unitId)}/${exports.INDEX_FILE_NAME}`;
}
function indexFsPath(unitId) {
    return path.join(unitFolderFsPath(unitId), exports.INDEX_FILE_NAME);
}
function prefabDbUrl(prefabRel) {
    const rel = prefabRel.replace(/^\/+/, '').replace(/\.prefab$/, '');
    return `db://assets/resources/${rel}.prefab`;
}
function prefabFsPath(prefabRel) {
    const rel = prefabRel.replace(/^\/+/, '').replace(/\.prefab$/, '');
    return path.join(getProjectRoot(), 'assets', 'resources', `${rel}.prefab`);
}
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function resolveRequiredSlots(index) {
    if (index.requiredSlots && index.requiredSlots.length > 0)
        return index.requiredSlots;
    return exports.DEFAULT_REQUIRED_SLOTS.slice();
}
//# sourceMappingURL=paths.js.map