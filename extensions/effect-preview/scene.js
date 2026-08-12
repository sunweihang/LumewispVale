'use strict';

/**
 * 场景脚本入口（Creator 场景进程加载）
 * 注意：仅「重载扩展」不一定会重新注入；失败时会尝试 soft-reload 场景。
 */

const { join } = require('path');

try {
    if (typeof Editor !== 'undefined' && Editor.App && Editor.App.path) {
        module.paths.push(join(Editor.App.path, 'node_modules'));
    }
} catch (e) {
    console.warn('[effect-preview] module.paths', e);
}

let impl = null;
let implError = null;
try {
    // 必须用 __dirname，场景进程里相对路径 require 可能失败
    impl = require(join(__dirname, 'scene-impl.js'));
} catch (e) {
    implError = e;
    console.error('[effect-preview] failed to load scene-impl.js', e);
}

function load() {
    console.log('[effect-preview] scene script LOAD ok, impl=', !!impl, implError ? String(implError.message) : '');
    if (impl && typeof impl.load === 'function') {
        try {
            impl.load();
        } catch (e) {
            console.error('[effect-preview] impl.load error', e);
        }
    }
}

function unload() {
    if (impl && typeof impl.unload === 'function') {
        try {
            impl.unload();
        } catch (e) {
            console.error('[effect-preview] impl.unload error', e);
        }
    }
    console.log('[effect-preview] scene script UNLOAD');
}

const methods = Object.assign({
    ping() {
        return {
            ok: true,
            version: '1.1.5',
            hasImpl: !!impl,
            implError: implError ? String(implError.message || implError) : '',
        };
    },
}, (impl && impl.methods) || {});

// CommonJS（Creator 场景脚本主要认这个）
exports.load = load;
exports.unload = unload;
exports.methods = methods;
module.exports = { load, unload, methods };
