'use strict';

exports.methods = {
    openPanel() {
        Editor.Panel.open('effect-preview');
    },

    async reloadSceneScript() {
        // 场景进程重新拉扩展场景脚本（比只重载面板有效）
        const tries = ['soft-reload', 'reload-scene', 'refresh-scene'];
        for (const msg of tries) {
            try {
                await Editor.Message.request('scene', msg);
                console.log('[effect-preview] scene', msg, 'ok');
                return { ok: true, via: msg };
            } catch (e) {
                // try next
            }
        }
        return { ok: false, tip: '请关闭 Creator 后重新打开工程' };
    },
};

exports.load = async function () {
    console.log('[effect-preview] extension main load');
    // 延后更久：扩展连刷时 WebView 常未挂上，过早 soft-reload 会刷
    // 「The WebView must be attached to the DOM and the dom-ready…」
    setTimeout(async () => {
        try {
            await new Promise((r) => setTimeout(r, 1200));
            await exports.methods.reloadSceneScript();
        } catch (e) {
            const msg = String(e || '');
            if (msg.includes('WebView must be attached') || msg.includes('dom-ready')) {
                console.warn('[effect-preview] scene webview not ready, skip soft-reload');
                return;
            }
            console.warn('[effect-preview] soft-reload after load failed', e);
        }
    }, 2000);
};

exports.unload = function () {
    console.log('[effect-preview] extension main unload');
};
