"use strict";
/** 生成空单位 Prefab（根节点 + PrefabInfo），挂点由 ensurePrefabMountNodes 补齐 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMinimalUnitPrefabJson = buildMinimalUnitPrefabJson;
function genFileId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let s = '';
    for (let i = 0; i < 22; i++)
        s += chars[(Math.random() * 62) | 0];
    return s;
}
function buildMinimalUnitPrefabJson(rootName) {
    const prefab = [
        {
            __type__: 'cc.Prefab',
            _name: rootName,
            _objFlags: 0,
            __editorExtras__: {},
            _native: '',
            data: { __id__: 1 },
            optimizationPolicy: 0,
            persistent: false,
        },
        {
            __type__: 'cc.Node',
            _name: rootName,
            _objFlags: 0,
            __editorExtras__: {},
            _parent: null,
            _children: [],
            _active: true,
            _components: [],
            _prefab: { __id__: 2 },
            _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
            _mobility: 0,
            _layer: 1073741824,
            _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
            _id: '',
        },
        {
            __type__: 'cc.PrefabInfo',
            root: { __id__: 1 },
            asset: { __id__: 0 },
            fileId: genFileId(),
            instance: null,
            targetOverrides: null,
        },
    ];
    return JSON.stringify(prefab, null, 2) + '\n';
}
//# sourceMappingURL=unitPrefabTemplate.js.map