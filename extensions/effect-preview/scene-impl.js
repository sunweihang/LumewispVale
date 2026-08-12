'use strict';

const { join } = require('path');

// 让场景脚本能 require('cc')（必须容错，否则整个 scene 脚本注册失败）
try {
    if (typeof Editor !== 'undefined' && Editor.App && Editor.App.path) {
        module.paths.push(join(Editor.App.path, 'node_modules'));
    }
} catch (e) {
    console.warn('[effect-preview] push module.paths failed', e);
}

const TEMP_ROOT = '__EffectPreviewTemp';
const STAGE_ROOT = '__EffectPreviewStage';
const SCRUB_COMP_FLAG = '__effectPreviewScrub';

/** @type {Map<string, any>} */
const clipCache = new Map();

exports.load = function () {
    console.log('[effect-preview] scene script loaded');
};
exports.unload = function () {
    clipCache.clear();
    console.log('[effect-preview] scene script unloaded');
};

function getCC() {
    return require('cc');
}

function findNodeByUuid(uuid) {
    const { director } = getCC();
    const scene = director.getScene();
    if (!scene || !uuid) {
        return null;
    }
    return findDeepByUuid(scene, uuid);
}

function findDeepByUuid(node, uuid) {
    if (node.uuid === uuid) {
        return node;
    }
    for (const child of node.children) {
        const found = findDeepByUuid(child, uuid);
        if (found) {
            return found;
        }
    }
    return null;
}

function walkComponents(root, fn) {
    const comps = root.components || [];
    for (const c of comps) {
        if (c) {
            fn(c, root);
        }
    }
    for (const child of root.children) {
        walkComponents(child, fn);
    }
}

function findAnimController(root) {
    let found = null;
    walkComponents(root, (c) => {
        if (found) {
            return;
        }
        if (typeof c.setValue === 'function'
            && ((c.constructor.name || '').indexOf('AnimationController') >= 0)) {
            found = c;
        }
    });
    return found;
}

function findClipAnim(root) {
    const { SkeletalAnimation, Animation } = getCC();
    return root.getComponentInChildren(SkeletalAnimation)
        || root.getComponent(SkeletalAnimation)
        || root.getComponentInChildren(Animation)
        || root.getComponent(Animation)
        || null;
}

function listClipNames(animComp) {
    if (!animComp || !animComp.clips) {
        return [];
    }
    return animComp.clips.filter(Boolean).map((c) => c.name);
}

function findDeepByName(root, name) {
    if (!name) {
        return null;
    }
    if (root.name === name) {
        return root;
    }
    for (const child of root.children) {
        const found = findDeepByName(child, name);
        if (found) {
            return found;
        }
    }
    return null;
}

function resolveAttachNode(root, attach) {
    if (!root || !attach) {
        return null;
    }
    const byName = findDeepByName(root, attach);
    if (byName) {
        return byName;
    }
    let found = null;
    walkComponents(root, (c) => {
        if (found) {
            return;
        }
        try {
            const prop = c[attach];
            if (prop && prop.isValid !== undefined && prop.worldPosition) {
                found = prop;
            }
        } catch (_) {
            // ignore
        }
    });
    return found;
}

const MOUNT_GIZMO = 'EffectMount';
const MOUNT_GIZMO_OLD = '__EffectPreviewMount';
const MOUNT_GIZMO_OLD2 = 'EffectMount_CN_OLD';

function computeMountWorldPos(charNode, attach, offset) {
    const { Vec3 } = getCC();
    const off = offset || { x: 0, y: 0, z: 0 };
    const attachNode = resolveAttachNode(charNode, attach || '') || charNode;
    const pos = attachNode.worldPosition.clone();
    if (off.x || off.y || off.z) {
        const worldOff = new Vec3();
        Vec3.transformQuat(worldOff, new Vec3(off.x, off.y, off.z), attachNode.worldRotation);
        pos.add(worldOff);
    }
    return {
        pos,
        rot: attachNode.worldRotation.clone(),
        attachNode,
        attachFound: !!(attach && attachNode !== charNode),
    };
}

function worldPosToLocalOffset(attachNode, worldPos) {
    const { Vec3, Quat } = getCC();
    if (!attachNode) {
        return { x: 0, y: 0, z: 0 };
    }
    const delta = new Vec3();
    Vec3.subtract(delta, worldPos, attachNode.worldPosition);
    const inv = new Quat();
    Quat.invert(inv, attachNode.worldRotation);
    const local = new Vec3();
    Vec3.transformQuat(local, delta, inv);
    return {
        x: +local.x.toFixed(3),
        y: +local.y.toFixed(3),
        z: +local.z.toFixed(3),
    };
}

/** 去掉挂点上的调试网格（红轴/黄球），只留空节点供选中拖拽 */
function stripMountVisual(node) {
    if (!node) {
        return;
    }
    try {
        const { MeshRenderer } = getCC();
        if (MeshRenderer) {
            const mrs = node.getComponents(MeshRenderer) || [];
            for (const mr of mrs) {
                try {
                    mr.destroy();
                } catch (_) {
                    // ignore
                }
            }
        }
    } catch (_) {
        // ignore
    }
    for (const child of node.children.slice()) {
        const n = child.name || '';
        if (n.indexOf('__m') === 0) {
            child.destroy();
        }
    }
    try {
        node.setScale(1, 1, 1);
    } catch (_) {
        // ignore
    }
}

function isUnderNode(node, ancestor) {
    let p = node;
    while (p) {
        if (p === ancestor) {
            return true;
        }
        p = p.parent;
    }
    return false;
}

function findMountGizmo() {
    const { director } = getCC();
    const scene = director.getScene();
    if (!scene) {
        return null;
    }
    return findDeepByName(scene, MOUNT_GIZMO)
        || findDeepByName(scene, MOUNT_GIZMO_OLD)
        || findDeepByName(scene, MOUNT_GIZMO_OLD2);
}

/**
 * 挂点节点：可挂在任意骨骼下，本地坐标即 offset
 * @param {any} [parentNode] 目标父节点（骨骼 / 角色根）；省略则放 TEMP
 */
function ensureMountGizmoNode(parentNode) {
    const { Node } = getCC();
    const temp = ensureTempRoot();
    if (!temp && !parentNode) {
        return null;
    }
    if (temp) {
        for (const child of temp.children.slice()) {
            const n = child.name || '';
            if (n === MOUNT_GIZMO_OLD || n === MOUNT_GIZMO_OLD2) {
                child.destroy();
            }
        }
    }
    let g = findMountGizmo();
    if (g && (g.name === MOUNT_GIZMO_OLD || g.name === MOUNT_GIZMO_OLD2)) {
        g.name = MOUNT_GIZMO;
    }
    if (!g) {
        g = new Node(MOUNT_GIZMO);
    }
    const wantParent = parentNode || temp;
    if (wantParent && g.parent !== wantParent) {
        // 保世界坐标再改父，避免跳一下
        const wp = g.worldPosition.clone();
        g.parent = wantParent;
        g.setWorldPosition(wp);
    }
    stripMountVisual(g);
    g[SCRUB_COMP_FLAG + 'HasVisual'] = false;
    g.active = true;
    g.layer = 1073741824; // DEFAULT
    return g;
}

function ensureTempRoot() {
    const { director, Node } = getCC();
    const scene = director.getScene();
    if (!scene) {
        return null;
    }
    let root = findDeepByName(scene, TEMP_ROOT);
    if (!root) {
        root = new Node(TEMP_ROOT);
        root.parent = scene;
    } else if (root.parent !== scene) {
        // 误挂到模型/骨骼下时拉回场景根
        root.parent = scene;
    }
    // 场景下可能有重名：只保留场景直接子节点那个
    const direct = scene.getChildByName(TEMP_ROOT);
    if (direct && direct !== root) {
        root = direct;
    }
    return root;
}

function focusSceneOnNode(node) {
    if (!node) {
        return;
    }
    try {
        Editor.Selection.select('node', [node.uuid]);
    } catch (_) {
        // ignore
    }
    // 编辑器聚焦
    const tryFocus = async (msg) => {
        try {
            await Editor.Message.request('scene', msg, node.uuid);
            return true;
        } catch (_) {
            try {
                await Editor.Message.request('scene', msg, [node.uuid]);
                return true;
            } catch (__) {
                return false;
            }
        }
    };
    Promise.resolve()
        .then(() => tryFocus('focus-camera'))
        .then((ok) => (ok ? true : tryFocus('focus-node')))
        .catch(() => {});

    // 兜底：把场景主相机挪到挂点附近
    try {
        const { director, Vec3 } = getCC();
        const scene = director.getScene();
        if (!scene) {
            return;
        }
        let camNode = scene.getChildByName('Main Camera');
        if (!camNode) {
            walkComponents(scene, (c, n) => {
                if (!camNode && ((c.constructor.name || '') === 'Camera')) {
                    camNode = n;
                }
            });
        }
        if (camNode) {
            const p = node.worldPosition;
            camNode.setWorldPosition(p.x + 2.5, p.y + 1.8, p.z + 5);
            if (typeof camNode.lookAt === 'function') {
                camNode.lookAt(new Vec3(p.x, p.y, p.z));
            }
        }
    } catch (_) {
        // ignore
    }
}

function forceSceneRepaint() {
    try {
        const { director } = getCC();
        const root = director && director.root;
        if (root && typeof root.frameMove === 'function') {
            // 多刷几帧，蒙皮有时第一帧不更新
            root.frameMove(0);
            root.frameMove(0);
        }
    } catch (_) {
        // ignore
    }
    try {
        if (typeof cce !== 'undefined' && cce.Engine) {
            if (typeof cce.Engine.repaintInEditMode === 'function') {
                cce.Engine.repaintInEditMode();
            } else if (typeof cce.Engine.repaint === 'function') {
                cce.Engine.repaint();
            }
        }
    } catch (_) {
        // ignore
    }
}

/**
 * 编辑器非 Play 模式下粒子不会自己推进；play() 之后要用非 0 dt 推几帧才看得见。
 */
function simulateParticlesBriefly(seconds) {
    const dt = 1 / 30;
    const frames = Math.max(4, Math.ceil((seconds || 0.2) / dt));
    try {
        const { director } = getCC();
        const root = director && director.root;
        if (root && typeof root.frameMove === 'function') {
            for (let i = 0; i < frames; i++) {
                root.frameMove(dt);
            }
        }
    } catch (_) {
        // ignore
    }
    forceSceneRepaint();
}

function findSkeletonHost(root, ctrl) {
    const { SkinnedMeshRenderer } = getCC();
    if (ctrl && ctrl.node && ctrl.node.isValid) {
        return ctrl.node;
    }
    let skinNode = null;
    walkComponents(root, (c, n) => {
        if (!skinNode && ((c.constructor.name || '') === 'SkinnedMeshRenderer')) {
            skinNode = n;
        }
    });
    if (skinNode) {
        // FBX 根通常是蒙皮节点的父级
        return skinNode.parent && skinNode.parent.isValid ? skinNode.parent : skinNode;
    }
    return root;
}

function disableAnimControllers(root) {
    const toRemove = [];
    walkComponents(root, (c, n) => {
        if (typeof c.setValue === 'function'
            && ((c.constructor.name || '').indexOf('AnimationController') >= 0)) {
            toRemove.push({ c, n });
        }
    });
    // 必须删掉 Marionette，否则会继续占用骨骼，SkeletalAnimation 采样无效
    for (const { c, n } of toRemove) {
        try {
            c.enabled = false;
            n.removeComponent(c);
        } catch (_) {
            try {
                c.destroy();
            } catch (__) {
                // ignore
            }
        }
    }
}

function forceCompLifecycle(comp) {
    if (!comp) {
        return;
    }
    try {
        if (typeof comp.onLoad === 'function') {
            comp.onLoad();
        }
    } catch (_) {
        // ignore
    }
    try {
        if (typeof comp.onEnable === 'function') {
            comp.onEnable();
        }
    } catch (_) {
        // ignore
    }
}

function diagnoseNode(root) {
    const ctrl = findAnimController(root);
    const host = findSkeletonHost(root, ctrl);
    const anim = host
        ? (host.getComponent(getCC().SkeletalAnimation) || host.getComponent(getCC().Animation))
        : null;
    const skins = [];
    walkComponents(root, (c, n) => {
        if ((c.constructor.name || '') === 'SkinnedMeshRenderer') {
            skins.push(n.name);
        }
    });
    const comps = [];
    walkComponents(root, (c, n) => {
        comps.push(`${n.name}:${c.constructor.name}`);
    });
    return {
        root: root.name,
        host: host ? host.name : '',
        hasController: !!ctrl,
        hasScrubAnim: !!anim,
        scrubClips: anim ? listClipNames(anim) : [],
        skins,
        comps: comps.slice(0, 40),
    };
}

function loadClipByUuid(uuid) {
    if (!uuid) {
        return Promise.resolve(null);
    }
    if (clipCache.has(uuid)) {
        return Promise.resolve(clipCache.get(uuid));
    }
    const { assetManager, AnimationClip } = getCC();

    const once = (spec) => new Promise((resolve) => {
        try {
            assetManager.loadAny(spec, (err, asset) => {
                if (!err && asset instanceof AnimationClip) {
                    resolve(asset);
                } else {
                    resolve(null);
                }
            });
        } catch (_) {
            resolve(null);
        }
    });

    return (async () => {
        let clip = await once({ uuid });
        if (!clip) {
            clip = await once(uuid);
        }
        if (!clip) {
            try {
                const cached = assetManager.assets.get(uuid);
                if (cached instanceof AnimationClip) {
                    clip = cached;
                }
            } catch (_) {
                // ignore
            }
        }
        if (clip) {
            clipCache.set(uuid, clip);
        } else {
            console.warn('[effect-preview] load clip failed', uuid);
        }
        return clip;
    })();
}

/**
 * 让蒙皮走「节点骨骼」实时路径（不要 baked，也不要挂着抢骨骼的 SkeletalAnimation）
 */
function prepareRealtimeSkinning(root, skinningRoot) {
    // 关掉/移除可能抢骨骼的 SkeletalAnimation（我们自己采样时不需要它）
    walkComponents(root, (c, n) => {
        const name = c.constructor.name || '';
        if (name === 'SkeletalAnimation' || name === 'Animation') {
            try {
                c.enabled = false;
            } catch (_) {
                // ignore
            }
        }
    });

    walkComponents(root, (c) => {
        if ((c.constructor.name || '') !== 'SkinnedMeshRenderer') {
            return;
        }
        try {
            if ('skinningRoot' in c && skinningRoot) {
                c.skinningRoot = skinningRoot;
            }
            if (typeof c.setUseBakedAnimation === 'function') {
                c.setUseBakedAnimation(false);
            }
        } catch (_) {
            // ignore
        }
        try {
            // 触发重新绑定
            c.enabled = false;
            c.enabled = true;
        } catch (_) {
            // ignore
        }
    });
}

/**
 * 编辑器最稳方案：AnimationClip.createEvaluator 直接写骨骼节点。
 * 配合 setUseBakedAnimation(false)，蒙皮会读节点矩阵。
 */
function applyClipPoseDirect(root, clip, time) {
    if (!root || !clip || typeof clip.createEvaluator !== 'function') {
        return { ok: false, reason: 'no-evaluator-api' };
    }
    try {
        prepareRealtimeSkinning(root, root);
        if (!root.__epClipEvals) {
            root.__epClipEvals = Object.create(null);
        }
        const key = clip._uuid || clip.uuid || clip.name || 'clip';
        let evaluation = root.__epClipEvals[key];
        if (!evaluation) {
            // 目标必须是骨骼根（track path 相对此节点）
            evaluation = clip.createEvaluator({ target: root });
            root.__epClipEvals[key] = evaluation;
        }
        const dur = clip.duration || 1;
        const t = Math.min(Math.max(0, Number(time) || 0), Math.max(0.001, dur));
        evaluation.evaluate(t);
        forceSceneRepaint();
        return {
            ok: true,
            mode: 'direct-eval',
            host: root.name,
            clipName: clip.name,
            time: t,
            duration: dur,
            tracks: typeof clip.tracksCount === 'number' ? clip.tracksCount : -1,
        };
    } catch (e) {
        return { ok: false, reason: `direct-eval-error:${e && e.message ? e.message : e}` };
    }
}

/**
 * 编辑器非 Play 时动画系统不 tick，必须手动采样。
 * 优先 direct-eval；失败再回退 SkeletalAnimation。
 */
function applyClipPose(host, clip, time) {
    // 1) 首选：clip 评估器直接写节点（对 FBX exotic 骨骼也有效）
    const direct = applyClipPoseDirect(host, clip, time);
    if (direct.ok) {
        return direct;
    }

    const { AnimationClip, SkeletalAnimation, Animation } = getCC();
    if (!host || !clip) {
        return { ok: false, reason: 'no-host-or-clip', directFail: direct.reason };
    }

    let anim = host.getComponent(SkeletalAnimation) || host.getComponent(Animation);
    if (!anim) {
        anim = host.addComponent(SkeletalAnimation);
        anim[SCRUB_COMP_FLAG] = true;
        forceCompLifecycle(anim);
        host.active = false;
        host.active = true;
        forceCompLifecycle(anim);
    }
    anim.enabled = true;
    if ('useBakedAnimation' in anim) {
        try {
            anim.useBakedAnimation = false;
        } catch (_) {
            // ignore
        }
    }

    const stateName = clip.name || 'preview';
    const list = (anim.clips || []).filter(Boolean);
    if (!list.includes(clip)) {
        anim.clips = list.concat([clip]);
    }

    let state = anim.getState(stateName);
    if (!state && typeof anim.createState === 'function') {
        try {
            state = anim.createState(clip, stateName) || anim.getState(stateName);
        } catch (_) {
            // ignore
        }
    }
    if (!state) {
        try {
            anim.play(stateName);
            state = anim.getState(stateName);
        } catch (_) {
            // ignore
        }
    }
    if (!state) {
        return {
            ok: false,
            reason: 'no-state',
            stateName,
            clipName: clip.name,
            clipNames: (anim.clips || []).filter(Boolean).map((c) => c.name),
            host: host.name,
            directFail: direct.reason,
        };
    }

    const dur = state.duration || clip.duration || 1;
    const t = Math.min(Math.max(0, Number(time) || 0), Math.max(0.001, dur));
    try {
        state.wrapMode = AnimationClip.WrapMode.Normal;
        state.speed = 0;
        if (!state.isPlaying) {
            try {
                anim.play(state.name || stateName);
            } catch (_) {
                if (typeof state.play === 'function') {
                    state.play();
                }
            }
        }
        state.speed = 0;
        if (typeof state.setTime === 'function') {
            state.setTime(t);
        } else {
            state.time = t;
        }
        if (typeof state.sample === 'function') {
            state.sample();
            state.sample();
        }
        if (typeof anim.update === 'function') {
            anim.update(0);
        }
    } catch (e) {
        return { ok: false, reason: `sample-error:${e && e.message ? e.message : e}`, directFail: direct.reason };
    }

    forceSceneRepaint();
    return {
        ok: true,
        mode: 'skeletal-fallback',
        host: host.name,
        stateName: state.name || stateName,
        clipName: clip.name,
        time: t,
        duration: dur,
    };
}

function playParticlesUnder(node) {
    if (!node) {
        return 0;
    }
    let count = 0;
    const tryPlay = (c) => {
        if (!isParticleSystemComp(c)) {
            return;
        }
        try {
            if (typeof c.stop === 'function') {
                c.stop();
            }
            if (typeof c.clear === 'function') {
                c.clear();
            }
            c.enabled = true;
            if (c.node) {
                c.node.active = true;
            }
            if (typeof c.play === 'function') {
                c.play();
                count += 1;
            }
        } catch (_) {
            // ignore
        }
    };
    walkComponents(node, tryPlay);
    // 兜底：有的环境 walk 拿不到组件，再用引擎 API
    if (count === 0) {
        try {
            const { ParticleSystem } = getCC();
            if (ParticleSystem && typeof node.getComponentsInChildren === 'function') {
                const list = node.getComponentsInChildren(ParticleSystem) || [];
                for (let i = 0; i < list.length; i++) {
                    tryPlay(list[i]);
                }
            }
        } catch (_) {
            // ignore
        }
    }
    return count;
}

function isParticleSystemComp(c) {
    if (!c) {
        return false;
    }
    try {
        const { ParticleSystem } = getCC();
        if (ParticleSystem && c instanceof ParticleSystem) {
            return true;
        }
    } catch (_) {
        // ignore
    }
    const cn = (c.constructor && c.constructor.name) || '';
    const cls = String(c.__classname__ || '');
    // 只认真正的 ParticleSystem，排除 Renderer，绝不用 play/stop 兜底（会误伤 SkeletalAnimation）
    if (cn === 'ParticleSystem' || cls === 'cc.ParticleSystem') {
        return true;
    }
    return false;
}

function nodeHasCriticalRenderOrAnim(node) {
    if (!node || !node.components) {
        return false;
    }
    const comps = node.components;
    for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        if (!c) {
            continue;
        }
        const cn = (c.constructor && c.constructor.name) || '';
        const cls = String(c.__classname__ || '');
        if (cn.indexOf('SkinnedMesh') >= 0 || cls.indexOf('SkinnedMesh') >= 0) {
            return true;
        }
        if (cn.indexOf('MeshRenderer') >= 0 || cls.indexOf('MeshRenderer') >= 0) {
            return true;
        }
        if (cn === 'SkeletalAnimation' || cls.indexOf('SkeletalAnimation') >= 0) {
            return true;
        }
        if (cn === 'Animation' || cls === 'cc.Animation') {
            return true;
        }
        if (cn.indexOf('AnimationController') >= 0 || cls.indexOf('AnimationController') >= 0) {
            return true;
        }
    }
    return false;
}

function walkNodes(root, fn) {
    if (!root) {
        return;
    }
    fn(root);
    const children = root.children || [];
    for (let i = 0; i < children.length; i++) {
        walkNodes(children[i], fn);
    }
}

/**
 * 预览挂点 / 临时根下的特效，绝不能被「关粒子 ICON」误伤
 */
function isPreviewEffectSubtree(node) {
    let cur = node;
    while (cur) {
        const n = cur.name || '';
        if (n === MOUNT_GIZMO
            || n === MOUNT_GIZMO_OLD
            || n === MOUNT_GIZMO_OLD2
            || n === TEMP_ROOT) {
            return true;
        }
        cur = cur.parent;
    }
    return false;
}

/**
 * 只关「纯粒子叶子节点」，绝不动骨骼/蒙皮/动画节点。
 * 误关会导致姿势采样失效。
 */
function setCharacterParticleMarkersVisible(root, visible, opts) {
    opts = opts || {};
    if (!root) {
        return { ok: false, count: 0, names: [] };
    }
    const host = findSkeletonHost(root, null);
    let count = 0;
    const names = [];
    const visited = new Set();

    const hideOne = (node, comp) => {
        if (!node || !node.isValid || visited.has(node.uuid)) {
            return;
        }
        // 保护：角色根、骨骼宿主、带网格/动画的节点一律不动
        if (node === root || node === host) {
            return;
        }
        // 保护：EffectMount 下刚刷出的预览特效
        if (isPreviewEffectSubtree(node)) {
            return;
        }
        if (nodeHasCriticalRenderOrAnim(node)) {
            return;
        }
        if (!comp || !isParticleSystemComp(comp)) {
            return;
        }
        visited.add(node.uuid);
        names.push(node.name || '(unnamed)');
        if (!visible) {
            if (node[SCRUB_COMP_FLAG + 'MarkerPrev'] === undefined) {
                node[SCRUB_COMP_FLAG + 'MarkerPrev'] = {
                    active: node.active,
                    enabled: !!comp.enabled,
                };
            }
            try {
                if (typeof comp.stop === 'function') {
                    comp.stop();
                }
                if (typeof comp.clear === 'function') {
                    comp.clear();
                }
                comp.enabled = false;
            } catch (_) {
                // ignore
            }
            // 叶子粒子节点才关 active（去掉星形 ICON）
            node.active = false;
            count += 1;
        } else {
            const prev = node[SCRUB_COMP_FLAG + 'MarkerPrev'];
            if (prev) {
                node.active = !!prev.active;
                comp.enabled = !!prev.enabled;
                delete node[SCRUB_COMP_FLAG + 'MarkerPrev'];
                count += 1;
            }
        }
    };

    walkComponents(root, (c, node) => {
        if (isParticleSystemComp(c)) {
            hideOne(node, c);
        }
    });

    // 名字兜底：必须真有 ParticleSystem，禁止裸关节点
    walkNodes(root, (node) => {
        const n = (node.name || '').toLowerCase();
        if (!/blackwatereffect|watereffect/.test(n)) {
            return;
        }
        const comps = node.components || [];
        for (let i = 0; i < comps.length; i++) {
            if (isParticleSystemComp(comps[i])) {
                hideOne(node, comps[i]);
                break;
            }
        }
    });

    try {
        const { ParticleSystem } = getCC();
        if (ParticleSystem && typeof root.getComponentsInChildren === 'function') {
            const list = root.getComponentsInChildren(ParticleSystem) || [];
            for (let i = 0; i < list.length; i++) {
                const c = list[i];
                if (c && c.node) {
                    hideOne(c.node, c);
                }
            }
        }
    } catch (_) {
        // ignore
    }

    if (opts.changeSelection && !visible) {
        preferCleanSceneSelection();
    }
    forceSceneRepaint();
    return { ok: true, count, names };
}

/** 拖拽预览时：取消选中角色，避免粒子组件图标强制显示 */
function preferCleanSceneSelection() {
    try {
        const { director } = getCC();
        const scene = director.getScene();
        const stage = scene && scene.getChildByName(STAGE_ROOT);
        if (stage && Editor.Selection && typeof Editor.Selection.select === 'function') {
            Editor.Selection.select('node', [stage.uuid]);
            return { ok: true, selected: stage.name };
        }
        if (Editor.Selection && typeof Editor.Selection.clear === 'function') {
            Editor.Selection.clear('node');
            return { ok: true, selected: '' };
        }
    } catch (_) {
        // ignore
    }
    return { ok: false };
}

function loadPrefabByUuid(uuid) {
    if (!uuid) {
        return Promise.resolve(null);
    }
    const { assetManager, Prefab } = getCC();
    return new Promise((resolve) => {
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !asset) {
                console.warn('[effect-preview] load prefab failed', uuid, err);
                resolve(null);
                return;
            }
            if (asset instanceof Prefab) {
                resolve(asset);
                return;
            }
            resolve(null);
        });
    });
}

function resolvePreviewTarget(node) {
    if (!node) {
        return null;
    }
    const name = node.name || '';
    const { director } = getCC();
    const scene = director.getScene();

    // 选中舞台根：取下面的角色（跳过灯光等 __ 节点）
    if (name === STAGE_ROOT) {
        for (const child of node.children || []) {
            const cn = child.name || '';
            if (cn && cn.indexOf('__') !== 0) {
                return child;
            }
        }
        return node;
    }

    // 选中临时特效根 / 挂点 / 其它预览辅助节点：回到舞台上的角色
    // EffectMount 在 TEMP_ROOT 下（不在 STAGE 下），否则会被当成新角色把会话事件冲掉
    if (name === TEMP_ROOT
        || name === MOUNT_GIZMO
        || name === MOUNT_GIZMO_OLD
        || name === MOUNT_GIZMO_OLD2
        || name.indexOf('__EffectPreview') === 0) {
        const stage = scene && scene.getChildByName(STAGE_ROOT);
        if (stage) {
            return resolvePreviewTarget(stage);
        }
    }

    // 选中特效实例（挂在 EffectMount / TEMP 下）：同样回到角色
    let p = node.parent;
    while (p) {
        const pn = p.name || '';
        if (pn === TEMP_ROOT || pn === MOUNT_GIZMO) {
            const stage = scene && scene.getChildByName(STAGE_ROOT);
            if (stage) {
                return resolvePreviewTarget(stage);
            }
            break;
        }
        if (pn === STAGE_ROOT) {
            // node 若是舞台直接子节点就是角色根；否则向上找到舞台的直接子节点
            let cur = node;
            while (cur.parent && cur.parent !== p) {
                cur = cur.parent;
            }
            if (cur.parent === p && (cur.name || '').indexOf('__') !== 0) {
                return cur;
            }
            return resolvePreviewTarget(p);
        }
        p = p.parent;
    }
    return node;
}

exports.methods = {
    getSelectionInfo(nodeUuid) {
        let uuid = nodeUuid;
        if (!uuid) {
            const sel = Editor.Selection.getSelected('node');
            uuid = sel && sel[0];
        }
        if (!uuid) {
            return { ok: false, reason: 'no-selection' };
        }
        let node = findNodeByUuid(uuid);
        if (!node) {
            return { ok: false, reason: 'node-not-found', uuid };
        }
        const selectedName = node.name;
        node = resolvePreviewTarget(node) || node;
        const ctrl = findAnimController(node);
        const clipAnim = findClipAnim(node);
        return {
            ok: true,
            uuid: node.uuid,
            name: node.name,
            selectedName,
            hasController: !!ctrl,
            hasClipAnim: !!clipAnim,
            clipNames: listClipNames(clipAnim),
            ctrlNode: ctrl && ctrl.node ? ctrl.node.name : '',
        };
    },

    /**
     * 跳到指定时间并采样姿势（编辑器 scrub / 伪播放都靠这个）
     */
    async seekPose(opts) {
        const node = findNodeByUuid(opts && opts.nodeUuid);
        if (!node) {
            return { ok: false, reason: 'node-not-found' };
        }
        // 注意：这里不要关粒子/改节点 active，否则会打断姿势采样

        const time = Math.max(0, Number(opts.time) || 0);
        const clipUuid = opts.clipUuid || '';
        const clipName = opts.clipName || '';

        // 1) 删掉 Marionette，否则骨骼被占用
        disableAnimControllers(node);

        if (!clipUuid) {
            return {
                ok: false,
                reason: 'no-clipUuid',
                tip: '配置里该动作没有 clipUuid',
                clipName,
                diag: diagnoseNode(node),
            };
        }

        const clip = await loadClipByUuid(clipUuid);
        if (!clip) {
            return { ok: false, reason: 'clip-load-failed', clipUuid, diag: diagnoseNode(node) };
        }

        // 2) 骨骼根 + 实时蒙皮
        const host = findSkeletonHost(node, null);
        prepareRealtimeSkinning(node, host);
        const result = applyClipPose(host, clip, time);
        return Object.assign({
            mode: result.mode || 'scrub',
            wantClip: clipName,
            loadedClip: clip.name,
            clipUuid,
            diag: diagnoseNode(node),
        }, result);
    },

    async spawnSfx(opts) {
        const { instantiate } = getCC();
        const node = findNodeByUuid(opts && opts.nodeUuid);
        if (!node) {
            return { ok: false, reason: 'node-not-found' };
        }
        const prefab = await loadPrefabByUuid(opts.prefabUuid);
        if (!prefab) {
            return { ok: false, reason: 'prefab-load-failed', prefabUuid: opts.prefabUuid };
        }

        const off = opts.offset || { x: 0, y: 0, z: 0 };
        const attachName = opts.attach || '';
        const attachNode = resolveAttachNode(node, attachName) || node;
        const computed = computeMountWorldPos(node, attachName, off);
        const resetTransform = !!opts.resetTransform;

        const existing = findMountGizmo();
        const parentChanged = !existing || existing.parent !== attachNode;

        // 挂点挂在骨骼下，特效挂在挂点下 → 拖挂点 / 播动画都会跟着骨骼走
        const mount = ensureMountGizmoNode(attachNode);
        if (!mount) {
            return { ok: false, reason: 'no-scene' };
        }
        // 默认保留场景里已拖好的本地坐标；只有明确 reset 或换了父节点才套配置 offset
        if (resetTransform || parentChanged) {
            mount.parent = attachNode;
            mount.setPosition(off.x || 0, off.y || 0, off.z || 0);
        }
        const resolvedAttach = attachName || (attachNode === node ? '' : (attachNode.name || ''));
        mount[SCRUB_COMP_FLAG + 'MountMeta'] = {
            charUuid: node.uuid,
            attach: resolvedAttach,
            eventName: opts.eventName || '',
        };

        const inst = instantiate(prefab);
        inst.parent = mount;
        inst.setPosition(0, 0, 0);
        try {
            if (computed.rot) {
                inst.setWorldRotation(computed.rot);
            }
        } catch (_) {
            // ignore
        }
        inst.active = true;
        // 确保特效节点也在 DEFAULT 层，避免相机看不到
        try {
            walkNodes(inst, (n) => {
                if (n) {
                    n.layer = 1073741824;
                }
            });
        } catch (_) {
            // ignore
        }
        const particleCount = playParticlesUnder(inst);
        simulateParticlesBriefly(0.25);

        const wp = mount.worldPosition;
        return {
            ok: true,
            uuid: inst.uuid,
            particleCount,
            pos: { x: wp.x, y: wp.y, z: wp.z },
            attachFound: !!computed.attachFound,
            attach: mount[SCRUB_COMP_FLAG + 'MountMeta'].attach,
        };
    },

    /** 把当前挂在挂点球下的特效，对齐到挂点球当前位置（拖拽时实时跟） */
    followMountSfx() {
        const g = findMountGizmo();
        if (!g || !g.active) {
            return { ok: false, reason: 'no-gizmo' };
        }
        // 若误选了特效子节点，拉回挂点
        try {
            const sel = Editor.Selection.getSelected('node');
            const su = sel && sel[0];
            const sn = su && findNodeByUuid(su);
            if (sn && sn !== g && isUnderNode(sn, g)) {
                Editor.Selection.select('node', [g.uuid]);
            }
        } catch (_) {
            // ignore
        }
        let n = 0;
        for (const child of g.children) {
            if ((child.name || '').indexOf('__m') === 0) {
                continue;
            }
            child.setPosition(0, 0, 0);
            n += 1;
        }
        forceSceneRepaint();
        const wp = g.worldPosition;
        return { ok: true, count: n, pos: { x: wp.x, y: wp.y, z: wp.z } };
    },

    showMountGizmo(opts) {
        const node = findNodeByUuid(opts && opts.nodeUuid);
        if (!node) {
            return { ok: false, reason: 'node-not-found' };
        }
        const attachName = opts.attach || '';
        const attachNode = resolveAttachNode(node, attachName) || node;
        const off = opts.offset || { x: 0, y: 0, z: 0 };
        const g = ensureMountGizmoNode(attachNode);
        if (!g) {
            return { ok: false, reason: 'no-scene' };
        }
        g.setPosition(off.x || 0, off.y || 0, off.z || 0);
        const resolvedAttach = attachName || (attachNode === node ? '' : (attachNode.name || ''));
        g[SCRUB_COMP_FLAG + 'MountMeta'] = {
            charUuid: node.uuid,
            attach: resolvedAttach,
            eventName: opts.eventName || '',
        };
        focusSceneOnNode(g);
        forceSceneRepaint();
        const wp = g.worldPosition;
        return {
            ok: true,
            uuid: g.uuid,
            attachFound: !!(attachName && attachNode !== node),
            attach: resolvedAttach,
            parent: (g.parent && g.parent.name) || '',
            hasVisual: false,
            pos: { x: wp.x, y: wp.y, z: wp.z },
        };
    },

    readMountGizmo(opts) {
        const g = findMountGizmo();
        if (!g || !g.active) {
            return { ok: false, reason: 'no-gizmo' };
        }
        const meta = g[SCRUB_COMP_FLAG + 'MountMeta'] || {};
        const charUuid = (opts && opts.nodeUuid) || meta.charUuid;
        const charNode = findNodeByUuid(charUuid);
        if (!charNode) {
            return { ok: false, reason: 'no-character' };
        }

        // 支持在层级里把 EffectMount 拖到任意骨骼：父节点即挂点
        let attach = (opts && opts.attach != null) ? opts.attach : (meta.attach || '');
        const parent = g.parent;
        if (parent && parent !== charNode && isUnderNode(parent, charNode)) {
            const pn = parent.name || '';
            if (pn && pn !== TEMP_ROOT && pn !== STAGE_ROOT && pn.indexOf('__EffectPreview') !== 0) {
                attach = pn;
            }
        } else if (parent === charNode) {
            attach = '';
        }

        const lp = g.position;
        const offset = {
            x: +Number(lp.x).toFixed(3),
            y: +Number(lp.y).toFixed(3),
            z: +Number(lp.z).toFixed(3),
        };
        g[SCRUB_COMP_FLAG + 'MountMeta'] = Object.assign({}, meta, {
            charUuid: charNode.uuid,
            attach,
        });
        const wp = g.worldPosition;
        return {
            ok: true,
            offset,
            attachFound: !!attach,
            attach,
            eventName: meta.eventName || '',
            parent: (parent && parent.name) || '',
            pos: { x: wp.x, y: wp.y, z: wp.z },
            uuid: g.uuid,
        };
    },

    hideMountGizmo() {
        const g = findMountGizmo();
        if (g) {
            g.destroy();
        }
        return { ok: true };
    },

    /** 取层级当前选中节点名（作骨骼挂点） */
    getSelectedAttachHint(charUuid) {
        const sel = Editor.Selection.getSelected('node');
        const uuid = sel && sel[0];
        if (!uuid) {
            return { ok: false, reason: 'no-selection' };
        }
        const node = findNodeByUuid(uuid);
        if (!node) {
            return { ok: false, reason: 'node-not-found' };
        }
        const name = node.name || '';
        if (name === MOUNT_GIZMO || name === TEMP_ROOT || name === STAGE_ROOT
            || name.indexOf('__EffectPreview') === 0) {
            return { ok: false, reason: 'invalid-node', name };
        }
        const charNode = findNodeByUuid(charUuid);
        if (charNode && !isUnderNode(node, charNode) && node !== charNode) {
            return {
                ok: false,
                reason: 'not-under-character',
                name,
                tip: '请选角色骨骼树里的节点',
            };
        }
        return {
            ok: true,
            name: node === charNode ? '' : name,
            uuid: node.uuid,
            isCharacterRoot: node === charNode,
        };
    },

    clearTempSfx() {
        const { director } = getCC();
        const scene = director.getScene();
        if (!scene) {
            return { ok: false };
        }
        const mount = findMountGizmo();
        if (mount) {
            for (const child of mount.children.slice()) {
                if ((child.name || '').indexOf('__m') === 0) {
                    continue;
                }
                child.destroy();
            }
        }
        const root = ensureTempRoot();
        if (root) {
            for (const child of root.children.slice()) {
                if ((child.name || '') !== MOUNT_GIZMO) {
                    child.destroy();
                }
            }
        }
        return { ok: true };
    },

    setEffectMarkersVisible(opts) {
        const visible = !!(opts && opts.visible);
        let target = findNodeByUuid(opts && opts.nodeUuid);
        if (!target) {
            const { director } = getCC();
            const scene = director.getScene();
            const stage = scene && scene.getChildByName(STAGE_ROOT);
            target = stage && resolvePreviewTarget(stage);
        }
        if (!target) {
            return { ok: false, reason: 'no-character' };
        }
        // 对舞台根也扫一遍，避免漏掉
        const { director } = getCC();
        const scene = director.getScene();
        const stage = scene && scene.getChildByName(STAGE_ROOT);
        const r1 = setCharacterParticleMarkersVisible(target, visible, { changeSelection: !visible });
        const r2 = stage && stage !== target
            ? setCharacterParticleMarkersVisible(stage, visible, { changeSelection: false })
            : { count: 0, names: [] };
        return {
            ok: true,
            count: (r1.count || 0) + (r2.count || 0),
            names: [].concat(r1.names || [], r2.names || []),
        };
    },

    preferCleanView() {
        return preferCleanSceneSelection();
    },

    async setupPreview(opts) {
        const {
            instantiate, Vec3, director, Node, Camera, DirectionalLight,
        } = getCC();
        const scene = director.getScene();
        if (!scene) {
            return { ok: false, reason: 'no-scene' };
        }
        if (!opts || !opts.prefabUuid) {
            return { ok: false, reason: 'no-prefab' };
        }

        const oldTemp = scene.getChildByName(TEMP_ROOT);
        if (oldTemp) {
            oldTemp.destroy();
        }
        const oldMount = findMountGizmo();
        if (oldMount && oldMount.isValid) {
            oldMount.destroy();
        }
        const oldStage = scene.getChildByName(STAGE_ROOT);
        if (oldStage) {
            oldStage.destroy();
        }

        const prefab = await loadPrefabByUuid(opts.prefabUuid);
        if (!prefab) {
            return { ok: false, reason: 'prefab-load-failed', prefabUuid: opts.prefabUuid };
        }

        const stage = new Node(STAGE_ROOT);
        stage.parent = scene;

        const node = instantiate(prefab);
        if (opts.characterId) {
            node.name = opts.characterId;
        }
        node.parent = stage;
        node.setWorldPosition(0, 0, 0);
        node.setRotationFromEuler(0, 180, 0);
        node.active = true;

        // 关掉角色自带粒子节点，去掉场景里白色星形组件图标
        setCharacterParticleMarkersVisible(node, false, { changeSelection: true });

        walkComponents(node, (c) => {
            try {
                const n = c.constructor.name || '';
                if (n.indexOf('RigidBody') >= 0
                    || n.indexOf('Collider') >= 0
                    || n.indexOf('CharacterController') >= 0) {
                    c.enabled = false;
                }
                if ((n.indexOf('Controller') >= 0 || n.indexOf('Player') >= 0)
                    && n.indexOf('Animation') < 0) {
                    c.enabled = false;
                }
            } catch (_) {
                // ignore
            }
        });

        let hasLight = false;
        walkComponents(scene, (c) => {
            if ((c.constructor.name || '') === 'DirectionalLight') {
                hasLight = true;
                c.enabled = true;
            }
        });
        if (!hasLight) {
            const lightNode = new Node('__EffectPreviewLight');
            lightNode.parent = stage;
            lightNode.setRotationFromEuler(-40, 30, 0);
            const light = lightNode.addComponent(DirectionalLight);
            light.illuminance = 65000;
        }

        let camNode = scene.getChildByName('Main Camera');
        if (!camNode) {
            walkComponents(scene, (c, n) => {
                if (!camNode && ((c.constructor.name || '') === 'Camera')) {
                    camNode = n;
                }
            });
        }
        if (camNode) {
            camNode.setWorldPosition(0, 2.2, 7);
            if (typeof camNode.lookAt === 'function') {
                camNode.lookAt(new Vec3(0, 1.4, 0));
            } else {
                camNode.setRotationFromEuler(-8, 0, 0);
            }
        }

        const ground = scene.getChildByName('Ground') || scene.getChildByName('ground');
        if (ground) {
            ground.active = false;
        }

        // 预热：删掉 Marionette；不要依赖 SkeletalAnimation 播姿势
        disableAnimControllers(node);
        const host = findSkeletonHost(node, null);
        prepareRealtimeSkinning(node, host);

        const clipUuids = opts.clipUuids || [];
        if (clipUuids.length && host) {
            const loaded = [];
            for (const u of clipUuids) {
                const clip = await loadClipByUuid(u);
                if (clip) {
                    loaded.push(clip);
                }
            }
            if (loaded.length) {
                // 用中间帧测试，idle 第0帧看不出变化
                const testClip = loaded.find((c) => /shoot|appear|attack/i.test(c.name)) || loaded[0];
                const mid = Math.max(0.1, (testClip.duration || 1) * 0.5);
                const test = applyClipPoseDirect(host, testClip, mid);
                forceSceneRepaint();
                return {
                    ok: true,
                    uuid: node.uuid,
                    name: node.name,
                    characterId: opts.characterId || node.name,
                    hasController: false,
                    preloadClips: loaded.map((c) => c.name),
                    poseTest: test,
                    diag: diagnoseNode(node),
                };
            }
        }

        forceSceneRepaint();
        return {
            ok: true,
            uuid: node.uuid,
            name: node.name,
            characterId: opts.characterId || node.name,
            diag: diagnoseNode(node),
        };
    },

};
