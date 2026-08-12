/**
 * 场景脚本：在打开的 Prefab 编辑模式中挂上 Decorator / 碰撞范围组件。
 * 由 execute-scene-script 调用。
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
function load() {
    console.log('[unit-editor] scene script load');
}
function unload() {
    console.log('[unit-editor] scene script unload');
}
function findUnitRoot() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cc = require('cc');
    const { director } = cc;
    const scene = director.getScene();
    if (!scene)
        return null;
    let root = null;
    const walk = (n) => {
        if (root)
            return;
        const name = n.name || '';
        if (name === 'Player' ||
            name.startsWith('Hero') ||
            name.includes('Enemy') ||
            n.getComponent('PlayerController') ||
            n.getComponent('HeroController') ||
            n.getComponent('EnemyController') ||
            n.getComponent('BossController') ||
            n.getComponent('UnitCollisionVolume') ||
            n.getComponent('EntityAttachmentSlotDecorator')) {
            root = n;
            return;
        }
        for (const c of n.children)
            walk(c);
    };
    walk(scene);
    if (!root) {
        for (const c of scene.children) {
            if (c.name && !c.name.startsWith('__')) {
                root = c;
                break;
            }
        }
    }
    return root;
}
async function applyDecoratorToRoot() {
    var _a, _b;
    const root = findUnitRoot();
    if (!root)
        return { ok: false, reason: 'unit root not found' };
    let dec = root.getComponent('EntityAttachmentSlotDecorator');
    if (!dec) {
        dec = root.addComponent('EntityAttachmentSlotDecorator');
    }
    if (dec && typeof dec.ensureNecessaryBones === 'function') {
        dec.ensureNecessaryBones();
        dec.autoScanBones();
    }
    const mapped = (_b = (_a = dec === null || dec === void 0 ? void 0 : dec.slotMappings) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
    return { ok: true, mapped };
}
async function applyCollisionVolumeToRoot(args) {
    var _a;
    const root = findUnitRoot();
    if (!root)
        return { ok: false, reason: 'unit root not found' };
    let vol = root.getComponent('UnitCollisionVolume');
    if (!vol) {
        vol = root.addComponent('UnitCollisionVolume');
    }
    if (!vol)
        return { ok: false, reason: 'UnitCollisionVolume missing (script not compiled?)' };
    const unitId = ((_a = args === null || args === void 0 ? void 0 : args.unitId) !== null && _a !== void 0 ? _a : 0) | 0;
    if (unitId > 0)
        vol.unitId = unitId;
    if (typeof (args === null || args === void 0 ? void 0 : args.collisionRadius) === 'number') {
        vol.collisionRadius = Math.max(0.05, args.collisionRadius);
    }
    if (typeof (args === null || args === void 0 ? void 0 : args.collisionHeight) === 'number') {
        vol.collisionHeight = Math.max(0.1, args.collisionHeight);
    }
    if (typeof (args === null || args === void 0 ? void 0 : args.collisionCenterY) === 'number') {
        vol.collisionCenterY = args.collisionCenterY;
    }
    vol.showInEditor = true;
    if (typeof vol.applyFromIndex === 'function' && unitId > 0) {
        vol.applyFromIndex({
            unitId,
            collisionRadius: vol.collisionRadius,
            collisionHeight: vol.collisionHeight,
            collisionCenterY: vol.collisionCenterY,
        });
    }
    return {
        ok: true,
        volume: {
            unitId: vol.unitId || unitId,
            collisionRadius: vol.collisionRadius,
            collisionHeight: vol.collisionHeight,
            collisionCenterY: vol.collisionCenterY,
        },
    };
}
async function readCollisionVolumeFromRoot() {
    const root = findUnitRoot();
    if (!root)
        return { ok: false, reason: 'unit root not found' };
    const vol = root.getComponent('UnitCollisionVolume');
    if (!vol)
        return { ok: false, reason: 'UnitCollisionVolume not on root' };
    return {
        ok: true,
        volume: {
            unitId: vol.unitId | 0,
            collisionRadius: vol.collisionRadius,
            collisionHeight: vol.collisionHeight,
            collisionCenterY: vol.collisionCenterY,
        },
    };
}
exports.methods = {
    async applyDecorator() {
        try {
            return await applyDecoratorToRoot();
        }
        catch (e) {
            return { ok: false, reason: String(e) };
        }
    },
    async applyCollisionVolume(args) {
        try {
            return await applyCollisionVolumeToRoot(args);
        }
        catch (e) {
            return { ok: false, reason: String(e) };
        }
    },
    async readCollisionVolume() {
        try {
            return await readCollisionVolumeFromRoot();
        }
        catch (e) {
            return { ok: false, reason: String(e) };
        }
    },
};
//# sourceMappingURL=scene.js.map