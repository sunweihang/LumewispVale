'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_REL = 'assets/resources/json/effect_preview.json';
const CONFIG_DB = 'db://assets/resources/json/effect_preview.json';
const RES_JSON_REL = 'assets/resources/json/res.json';

function configPath() {
    return path.join(Editor.Project.path, CONFIG_REL);
}

/** 按 PoolSystem 名查 res.json url（特效迁移后多为 effects/{id}/Output/{id}） */
function resolveSfxUrlByName(name) {
    if (!name) return '';
    if (name.indexOf('/') >= 0) return name;
    try {
        const file = path.join(Editor.Project.path, RES_JSON_REL);
        if (!fs.existsSync(file)) return `effects/${name}`;
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const table = (data && data.prefab) || {};
        for (const key of Object.keys(table)) {
            const row = table[key];
            if (row && row.name === name && row.url) return String(row.url);
        }
    } catch (_) {
        /* ignore */
    }
    return name;
}

/**
 * 读取项目内 effect_preview.json
 * @returns {object|null}
 */
function loadConfig() {
    try {
        const file = configPath();
        if (!fs.existsSync(file)) {
            console.warn('[effect-preview] config not found:', file);
            return null;
        }
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error('[effect-preview] load config failed', e);
        return null;
    }
}

/**
 * 深拷贝 JSON 可序列化对象
 * @param {any} obj
 */
function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * 按节点名匹配角色配置（节点名包含 characters[].id）
 * @param {object} config
 * @param {string} nodeName
 */
function matchCharacter(config, nodeName) {
    if (!config || !nodeName) {
        return null;
    }
    const list = config.characters || [];
    // 优先精确 / 更长 id 匹配，避免 Enemy0 误伤 Enemy00
    const sorted = [...list].sort((a, b) => (b.id || '').length - (a.id || '').length);
    for (const ch of sorted) {
        if (ch.id && nodeName.indexOf(ch.id) >= 0) {
            return ch;
        }
    }
    return null;
}

/**
 * 合并事件绑定与动作上的时间点
 * @param {object} character
 * @param {object} anim
 * @param {Record<string, {x:number,y:number,z:number}>} offsetOverrides
 */
function getAnimEvents(character, anim, offsetOverrides) {
    if (!character || !anim) {
        return [];
    }
    const names = anim.frameEvents || [];
    const eventMap = {};
    for (const e of character.events || []) {
        eventMap[e.name] = e;
    }
    return names.map((name) => {
        const base = eventMap[name] || { name, sfx: '', attach: '', offset: { x: 0, y: 0, z: 0 } };
        const ov = offsetOverrides && offsetOverrides[name];
        return {
            name,
            sfx: base.sfx || '',
            attach: base.attach || '',
            time: (anim.eventTimes && typeof anim.eventTimes[name] === 'number')
                ? anim.eventTimes[name]
                : 0,
            offset: ov
                ? { ...ov }
                : (base.offset ? { ...base.offset } : { x: 0, y: 0, z: 0 }),
        };
    });
}

/**
 * 把会话中的 offsetOverrides 合并进 events
 * @param {object} character
 * @param {Record<string, {x:number,y:number,z:number}>} offsetOverrides
 */
function applyOffsetOverrides(character, offsetOverrides) {
    if (!character) {
        return;
    }
    if (!character.events) {
        character.events = [];
    }
    const map = {};
    for (const e of character.events) {
        map[e.name] = e;
    }
    const ov = offsetOverrides || {};
    for (const name of Object.keys(ov)) {
        if (!map[name]) {
            map[name] = {
                name,
                sfx: '',
                attach: '',
                offset: { x: 0, y: 0, z: 0 },
            };
            character.events.push(map[name]);
        }
        const o = ov[name];
        map[name].offset = {
            x: +Number(o.x || 0).toFixed(3),
            y: +Number(o.y || 0).toFixed(3),
            z: +Number(o.z || 0).toFixed(3),
        };
    }
}

/**
 * 从会话角色生成可写入 JSON 的角色块（保留原有字段，更新全部动作帧事件与特效绑定）
 * @param {object} character
 * @param {Record<string, {x:number,y:number,z:number}>} offsetOverrides
 * @param {object} [sessionSfxUrls] 会话里临时补的 sfxUrls
 */
function buildCharacterSavePayload(character, offsetOverrides, sessionSfxUrls) {
    const src = cloneJson(character);
    applyOffsetOverrides(src, offsetOverrides);

    const usedNames = new Set();
    const anims = (src.anims || []).map((a) => {
        const out = { ...a };
        if (Array.isArray(a.frameEvents)) {
            out.frameEvents = a.frameEvents.slice();
            a.frameEvents.forEach((n) => usedNames.add(n));
        } else {
            delete out.frameEvents;
        }
        if (a.eventTimes && typeof a.eventTimes === 'object') {
            out.eventTimes = { ...a.eventTimes };
        } else {
            delete out.eventTimes;
        }
        return out;
    });

    // 只保留本角色动作里用到的 + 仍有 sfx/attach/offset 的事件
    const events = (src.events || [])
        .filter((e) => {
            if (!e || !e.name) {
                return false;
            }
            if (usedNames.has(e.name)) {
                return true;
            }
            return !!(e.sfx || e.attach
                || (e.offset && (e.offset.x || e.offset.y || e.offset.z)));
        })
        .map((e) => ({
            name: e.name,
            sfx: e.sfx || '',
            attach: e.attach || '',
            offset: {
                x: +Number((e.offset && e.offset.x) || 0).toFixed(3),
                y: +Number((e.offset && e.offset.y) || 0).toFixed(3),
                z: +Number((e.offset && e.offset.z) || 0).toFixed(3),
            },
        }));

    const sfxNames = [];
    for (const e of events) {
        if (e.sfx && sfxNames.indexOf(e.sfx) < 0) {
            sfxNames.push(e.sfx);
        }
    }

    return {
        character: {
            id: src.id,
            prefabUrl: src.prefabUrl || '',
            animMode: src.animMode || 'clips',
            anims,
            events,
        },
        sfxNames,
        sessionSfxUrls: sessionSfxUrls || {},
    };
}

/**
 * 按角色单位写入 effect_preview.json（合并进 characters[]，并补全 sfxList/sfxUrls）
 * @param {object} character 会话中的角色对象（含全部动作编辑）
 * @param {Record<string, {x:number,y:number,z:number}>} offsetOverrides
 * @param {object} [sessionSfxUrls]
 * @returns {{ ok: boolean, path?: string, characterId?: string, eventCount?: number, animCount?: number, reason?: string }}
 */
function saveCharacterConfig(character, offsetOverrides, sessionSfxUrls) {
    if (!character || !character.id) {
        return { ok: false, reason: 'no-character' };
    }
    const file = configPath();
    let root = loadConfig();
    if (!root || typeof root !== 'object') {
        root = { characters: [], sfxList: [], sfxUrls: {} };
    }
    if (!Array.isArray(root.characters)) {
        root.characters = [];
    }
    if (!Array.isArray(root.sfxList)) {
        root.sfxList = [];
    }
    if (!root.sfxUrls || typeof root.sfxUrls !== 'object') {
        root.sfxUrls = {};
    }

    const payload = buildCharacterSavePayload(character, offsetOverrides, sessionSfxUrls);
    const next = payload.character;

    // 保留磁盘上同角色未在会话里出现的基础字段（若会话缺 prefabUrl 等）
    const idx = root.characters.findIndex((c) => c && c.id === next.id);
    if (idx >= 0) {
        const prev = root.characters[idx];
        if (!next.prefabUrl && prev.prefabUrl) {
            next.prefabUrl = prev.prefabUrl;
        }
        if (!next.animMode && prev.animMode) {
            next.animMode = prev.animMode;
        }
        // 合并 anim：按 label 对齐，会话覆盖 frameEvents/eventTimes，保留 clipUuid 等
        const prevAnims = prev.anims || [];
        next.anims = (next.anims || []).map((a) => {
            const old = prevAnims.find((x) => x.label === a.label || (x.clip && x.clip === a.clip));
            if (!old) {
                return a;
            }
            return {
                ...old,
                ...a,
                frameEvents: a.frameEvents,
                eventTimes: a.eventTimes,
            };
        });
        root.characters[idx] = next;
    } else {
        root.characters.push(next);
    }

    for (const name of payload.sfxNames) {
        if (root.sfxList.indexOf(name) < 0) {
            root.sfxList.push(name);
        }
        if (!root.sfxUrls[name]) {
            const fromSession = sessionSfxUrls && sessionSfxUrls[name];
            root.sfxUrls[name] = fromSession || resolveSfxUrlByName(name);
        }
    }

    try {
        fs.writeFileSync(file, `${JSON.stringify(root, null, 2)}\n`, 'utf8');
    } catch (e) {
        console.error('[effect-preview] save config failed', e);
        return { ok: false, reason: e && e.message ? e.message : 'write-failed' };
    }

    // 通知资源库刷新
    try {
        if (Editor.Message && typeof Editor.Message.request === 'function') {
            Editor.Message.request('asset-db', 'refresh-asset', CONFIG_DB).catch(() => {});
        }
    } catch (_) {
        // ignore
    }

    const animWithEvents = (next.anims || []).filter((a) => (a.frameEvents || []).length).length;
    return {
        ok: true,
        path: CONFIG_REL,
        characterId: next.id,
        eventCount: (next.events || []).length,
        animCount: animWithEvents,
        animTotal: (next.anims || []).length,
    };
}

/**
 * 从磁盘读取指定角色的完整配置（深拷贝，可安全改会话）
 * @param {string} characterId
 * @returns {{ ok: boolean, character?: object, config?: object, reason?: string }}
 */
function loadCharacterConfig(characterId) {
    const config = loadConfig();
    if (!config) {
        return { ok: false, reason: 'config-missing' };
    }
    if (!characterId) {
        return { ok: false, reason: 'no-id', config };
    }
    const found = (config.characters || []).find((c) => c && c.id === characterId);
    if (!found) {
        return { ok: false, reason: 'character-not-found', config };
    }
    return {
        ok: true,
        character: cloneJson(found),
        config,
    };
}

module.exports = {
    loadConfig,
    matchCharacter,
    getAnimEvents,
    saveCharacterConfig,
    loadCharacterConfig,
};
