'use strict';
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
exports.listProjectExtensions = listProjectExtensions;
exports.checkBuildToolchain = checkBuildToolchain;
exports.formatBuildFailureHint = formatBuildFailureHint;
exports.buildOne = buildOne;
exports.reloadOne = reloadOne;
exports.recoverSceneHierarchy = recoverSceneHierarchy;
exports.sceneRecoverFlagPath = sceneRecoverFlagPath;
exports.markNeedSceneRecover = markNeedSceneRecover;
exports.consumeNeedSceneRecover = consumeNeedSceneRecover;
exports.hostRestoreFlagPath = hostRestoreFlagPath;
exports.markHostRestore = markHostRestore;
exports.consumeHostRestore = consumeHostRestore;
exports.rebuildAndReloadAll = rebuildAndReloadAll;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 重载顺序：图引擎先，宿主最后（避免中途把自己卸掉） */
const RELOAD_PRIORITY = {
    'node-graph': 10,
    'skill-editor': 20,
    'ballistic-editor': 21,
    'modifier-editor': 22,
    'story-editor': 23,
    'unit-editor': 24,
    'effect-preview': 30,
    'battle-manager': 100,
};
function projectExtensionsRoot() {
    var _a;
    const project = (_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
    if (project)
        return path.join(project, 'extensions');
    // dist/ → battle-manager → extensions
    return path.resolve(__dirname, '../..');
}
function listProjectExtensions() {
    var _a;
    const root = projectExtensionsRoot();
    if (!fs.existsSync(root))
        return [];
    const out = [];
    for (const name of fs.readdirSync(root)) {
        const dir = path.join(root, name);
        const pkgPath = path.join(dir, 'package.json');
        if (!fs.statSync(dir).isDirectory() || !fs.existsSync(pkgPath))
            continue;
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const pkgName = pkg.name || name;
            out.push({
                name: pkgName,
                root: dir,
                hasBuild: typeof ((_a = pkg.scripts) === null || _a === void 0 ? void 0 : _a.build) === 'string' && pkg.scripts.build.length > 0,
            });
        }
        catch {
            /* skip broken package.json */
        }
    }
    return out;
}
const NODE_INSTALL_HINT = '请安装 Node.js（LTS，官网 https://nodejs.org ），安装时勾选 “Add to PATH”。\n' +
    '装好后关闭并重新打开 Cocos Creator，再点「一键编译并刷新」。\n' +
    '验证：在系统命令行执行 node -v 与 npm -v 应能输出版本号。';
/** 异步跑子进程，避免 execSync 卡死主进程导致进度面板不刷新 */
function runCommand(command, args, cwd, shell = process.platform === 'win32') {
    return new Promise((resolve) => {
        var _a, _b;
        const child = (0, child_process_1.spawn)(command, args, {
            cwd,
            shell,
            windowsHide: true,
            env: process.env,
        });
        let out = '';
        (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (d) => {
            out += String(d);
        });
        (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (d) => {
            out += String(d);
        });
        child.on('error', (err) => {
            resolve({ ok: false, log: err.message });
        });
        child.on('close', (code) => {
            resolve({ ok: code === 0, log: out.trim() });
        });
    });
}
function looksLikeMissingCmd(log) {
    const s = (log || '').toLowerCase();
    return (s.includes('enoent') ||
        s.includes('not recognized') ||
        s.includes('不是内部或外部命令') ||
        s.includes('无法识别') ||
        s.includes('系统找不到指定的文件') ||
        s.includes('command not found') ||
        s.includes('spawn npm') ||
        s.includes('spawn node'));
}
/** 编译前检查本机是否有 node / npm，缺则返回友好说明 */
async function checkBuildToolchain() {
    const node = await runCommand('node', ['-v'], process.cwd(), true);
    if (!node.ok || looksLikeMissingCmd(node.log)) {
        return {
            ok: false,
            message: '未检测到 Node.js，无法编译扩展。\n\n' +
                NODE_INSTALL_HINT +
                (node.log ? `\n\n详情：${node.log.slice(0, 200)}` : ''),
        };
    }
    const npm = await runCommand('npm', ['-v'], process.cwd(), true);
    if (!npm.ok || looksLikeMissingCmd(npm.log)) {
        return {
            ok: false,
            message: '已找到 node，但未检测到 npm。\n\n' +
                '请重新安装 Node.js（官网安装包自带 npm），并确保已加入 PATH。\n' +
                '装好后重启 Cocos Creator。\n' +
                (npm.log ? `\n详情：${npm.log.slice(0, 200)}` : ''),
        };
    }
    return { ok: true };
}
/** 把原始编译/安装失败日志转成用户可读提示 */
function formatBuildFailureHint(extName, log) {
    const raw = (log || '').trim();
    if (looksLikeMissingCmd(raw) || (/\bnode\b/i.test(raw) && /not found|找不到|ENOENT/i.test(raw))) {
        return (`编译 ${extName} 失败：本机缺少 Node.js / npm。\n\n` + NODE_INSTALL_HINT);
    }
    if (/npm ERR!|ECONNREFUSED|ENOTFOUND|network|ETIMEDOUT|certificate/i.test(raw)) {
        return (`编译 ${extName} 失败：安装依赖时网络出错。\n\n` +
            '请检查网络/代理后重试；也可在该扩展目录手动执行：\n' +
            `  cd extensions/${extName}\n  npm install\n\n` +
            `详情：\n${raw.slice(0, 500)}`);
    }
    if (/Cannot find module ['"]typescript['"]|typescript/i.test(raw) && /ERR|error TS|找不到/i.test(raw)) {
        return (`编译 ${extName} 失败：缺少 TypeScript。\n\n` +
            `请在扩展目录执行：\n  cd extensions/${extName}\n  npm install\n\n` +
            '然后重新「一键编译并刷新」。');
    }
    return `编译 ${extName} 失败。\n\n${raw.slice(0, 800) || '（无详细日志）'}`;
}
async function ensureNpmDeps(extRoot, onInstall) {
    const tscJs = path.join(extRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(tscJs))
        return { ok: true, log: '' };
    onInstall === null || onInstall === void 0 ? void 0 : onInstall();
    const r = await runCommand('npm', ['install', '--no-fund', '--no-audit'], extRoot);
    if (!r.ok) {
        const name = path.basename(extRoot);
        return {
            ok: false,
            log: formatBuildFailureHint(name, [`npm install @ ${name}`, r.log].filter(Boolean).join('\n')),
        };
    }
    return r;
}
/**
 * Creator/Electron 里 process.execPath 是编辑器 exe，不能当 node 用。
 * 统一走 npm run build（会把 node_modules/.bin 加进 PATH）。
 */
async function buildOne(ext, onPhase) {
    if (!ext.hasBuild)
        return { ok: true, log: 'skip (no build script)' };
    try {
        const install = await ensureNpmDeps(ext.root, () => {
            onPhase === null || onPhase === void 0 ? void 0 : onPhase(`安装依赖 ${ext.name}…`, `npm install @ ${ext.name}`);
        });
        if (!install.ok)
            return install;
        onPhase === null || onPhase === void 0 ? void 0 : onPhase(`编译 ${ext.name}…`, `npm run build @ ${ext.name}`);
        const build = await runCommand('npm', ['run', 'build'], ext.root, true);
        if (!build.ok) {
            return { ok: false, log: formatBuildFailureHint(ext.name, build.log) };
        }
        const parts = [install.log, build.log].filter(Boolean);
        return { ok: true, log: parts.join('\n') };
    }
    catch (e) {
        return { ok: false, log: formatBuildFailureHint(ext.name, String(e)) };
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function reloadOne(ext) {
    const attempts = [
        () => Editor.Message.request('extension', 'reload', ext.root),
        () => Editor.Message.request('extension', 'reload', ext.name),
    ];
    const pkgApi = Editor.Package;
    if (typeof (pkgApi === null || pkgApi === void 0 ? void 0 : pkgApi.reload) === 'function') {
        attempts.push(async () => pkgApi.reload(ext.name));
    }
    const errors = [];
    for (const run of attempts) {
        try {
            await run();
            return;
        }
        catch (e) {
            errors.push(String(e));
        }
    }
    throw new Error(errors.join(' | ') || 'reload failed');
}
function isSceneWebviewNotReady(err) {
    const msg = String(err !== null && err !== void 0 ? err : '');
    return msg.includes('WebView must be attached') || msg.includes('dom-ready');
}
/**
 * 等场景 WebView：只听 scene:ready / 延时，不主动打场景 IPC
 * （query/soft-reload 在未挂载时同样会刷 Window 报错）。
 */
async function waitForSceneWebview(timeoutMs = 2500) {
    return new Promise((resolve) => {
        var _a;
        let done = false;
        const bus = Editor.Message;
        const finish = (ok) => {
            var _a;
            if (done)
                return;
            done = true;
            try {
                (_a = bus.removeBroadcastListener) === null || _a === void 0 ? void 0 : _a.call(bus, 'scene:ready', onReady);
            }
            catch {
                /* ignore */
            }
            resolve(ok);
        };
        const onReady = () => finish(true);
        try {
            (_a = bus.addBroadcastListener) === null || _a === void 0 ? void 0 : _a.call(bus, 'scene:ready', onReady);
        }
        catch {
            /* ignore */
        }
        // 未收到 ready 也允许继续试（面板已开但广播丢失的情况）；真正失败靠下方 catch
        setTimeout(() => finish(true), timeoutMs);
    });
}
/**
 * 扩展连刷后 Hierarchy 常报「场景返回了空数据」。
 * soft-reload 让场景进程与节点树重新对齐（对齐 effect-preview 做法）。
 * 必须等 WebView 挂上 DOM，否则会刷 Window: WebView must be attached…
 */
async function recoverSceneHierarchy() {
    await sleep(600);
    const ready = await waitForSceneWebview(7000);
    if (!ready) {
        console.warn('[battle-manager] scene webview not ready, skip soft-reload');
        return '';
    }
    const tries = ['soft-reload', 'reload-scene', 'refresh-scene'];
    for (let round = 0; round < 3; round++) {
        if (round > 0)
            await sleep(700);
        for (const msg of tries) {
            try {
                await Editor.Message.request('scene', msg);
                console.log(`[battle-manager] scene ${msg} ok`);
                return msg;
            }
            catch (e) {
                if (isSceneWebviewNotReady(e)) {
                    console.warn(`[battle-manager] scene ${msg}: webview not ready, retry…`);
                    break;
                }
            }
        }
    }
    return '';
}
/** 跨扩展 reload 持久化：宿主 unload 后内存标志会丢 */
function sceneRecoverFlagPath() {
    var _a;
    const project = (_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
    const base = project ? path.join(project, 'temp') : path.resolve(__dirname, '../../../temp');
    return path.join(base, 'battle-manager-need-scene-recover');
}
function markNeedSceneRecover() {
    try {
        const p = sceneRecoverFlagPath();
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, String(Date.now()), 'utf8');
    }
    catch (e) {
        console.warn('[battle-manager] markNeedSceneRecover failed', e);
    }
}
function consumeNeedSceneRecover() {
    const p = sceneRecoverFlagPath();
    try {
        if (!fs.existsSync(p))
            return false;
        const age = Date.now() - Number(fs.readFileSync(p, 'utf8') || 0);
        fs.unlinkSync(p);
        // 仅认 2 分钟内的标记，避免陈旧标志乱刷场景
        return Number.isFinite(age) && age >= 0 && age < 120000;
    }
    catch {
        return false;
    }
}
function hostRestoreFlagPath() {
    var _a;
    const project = (_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path;
    const base = project ? path.join(project, 'temp') : path.resolve(__dirname, '../../../temp');
    return path.join(base, 'battle-manager-host-restore.json');
}
function markHostRestore(state) {
    try {
        const p = hostRestoreFlagPath();
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const payload = {
            open: state.open !== false,
            moduleId: state.moduleId || undefined,
            at: Date.now(),
        };
        fs.writeFileSync(p, JSON.stringify(payload), 'utf8');
    }
    catch (e) {
        console.warn('[battle-manager] markHostRestore failed', e);
    }
}
function consumeHostRestore() {
    const p = hostRestoreFlagPath();
    try {
        if (!fs.existsSync(p))
            return null;
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        fs.unlinkSync(p);
        const age = Date.now() - Number((raw === null || raw === void 0 ? void 0 : raw.at) || 0);
        if (!Number.isFinite(age) || age < 0 || age >= 120000)
            return null;
        return (raw === null || raw === void 0 ? void 0 : raw.open) ? raw : null;
    }
    catch {
        try {
            fs.unlinkSync(p);
        }
        catch {
            /* ignore */
        }
        return null;
    }
}
function sortForReload(list) {
    return [...list].sort((a, b) => {
        var _a, _b;
        const pa = (_a = RELOAD_PRIORITY[a.name]) !== null && _a !== void 0 ? _a : 50;
        const pb = (_b = RELOAD_PRIORITY[b.name]) !== null && _b !== void 0 ? _b : 50;
        if (pa !== pb)
            return pa - pb;
        return a.name.localeCompare(b.name);
    });
}
/**
 * 先全部编译，再按序重载除宿主外的扩展。
 * 宿主（battle-manager）返回给调用方，避免弹窗前被卸载。
 */
async function rebuildAndReloadAll(opts = { build: true, hostPackageName: 'battle-manager' }) {
    var _a;
    const all = listProjectExtensions();
    if (all.length === 0) {
        return { ok: false, lines: ['未找到 extensions/ 下的扩展'] };
    }
    const lines = [];
    const report = (p) => {
        var _a, _b;
        (_a = opts.onProgress) === null || _a === void 0 ? void 0 : _a.call(opts, { ...p, lines: (_b = p.lines) !== null && _b !== void 0 ? _b : lines.slice() });
    };
    const buildTargets = opts.build ? all.filter((e) => e.hasBuild) : [];
    const ordered = sortForReload(all);
    const others = ordered.filter((e) => e.name !== opts.hostPackageName);
    const host = ordered.find((e) => e.name === opts.hostPackageName);
    const total = buildTargets.length + others.length + 1 /* scene */ + (host ? 1 : 0);
    let current = 0;
    report({
        phase: opts.build ? 'build' : 'reload',
        current: 0,
        total,
        label: opts.build ? '准备编译…' : '准备刷新…',
    });
    // 让进度面板有机会完成首帧渲染（勿用同步阻塞）
    await sleep(160);
    if (opts.build) {
        report({
            phase: 'build',
            current: 0,
            total,
            label: '检查 Node.js / npm…',
            detail: 'node -v && npm -v',
        });
        const tool = await checkBuildToolchain();
        if (!tool.ok) {
            lines.push(tool.message);
            report({
                phase: 'done',
                current: 0,
                total,
                label: '缺少 Node.js / npm',
                detail: tool.message.slice(0, 400),
                done: true,
                ok: false,
            });
            return { ok: false, lines };
        }
    }
    if (opts.build) {
        for (const ext of all) {
            if (!ext.hasBuild) {
                lines.push(`· ${ext.name}: 跳过编译`);
                continue;
            }
            report({
                phase: 'build',
                current,
                total,
                label: `编译 ${ext.name}…`,
                detail: `npm run build @ ${ext.name}`,
            });
            await sleep(50);
            console.log(`[battle-manager] building ${ext.name}…`);
            const r = await buildOne(ext, (label, detail) => {
                report({
                    phase: 'build',
                    current,
                    total,
                    label,
                    detail,
                });
            });
            current += 1;
            if (!r.ok) {
                lines.push(`· ${ext.name}: 编译失败`);
                lines.push(r.log);
                report({
                    phase: 'done',
                    current,
                    total,
                    label: `${ext.name} 编译失败`,
                    detail: r.log.slice(0, 400),
                    done: true,
                    ok: false,
                });
                return { ok: false, lines };
            }
            lines.push(`· ${ext.name}: 编译 OK`);
            report({
                phase: 'build',
                current,
                total,
                label: `${ext.name} 编译完成`,
            });
            await sleep(40);
        }
    }
    let anyFail = false;
    for (const ext of others) {
        report({
            phase: 'reload',
            current,
            total,
            label: `刷新 ${ext.name}…`,
        });
        try {
            console.log(`[battle-manager] reloading ${ext.name}…`);
            await reloadOne(ext);
            lines.push(`· ${ext.name}: 刷新 OK`);
            // 给 Hierarchy / 场景进程一点喘息，降低「场景返回了空数据」竞态
            await sleep(180);
        }
        catch (e) {
            anyFail = true;
            lines.push(`· ${ext.name}: 刷新失败 — ${e}`);
        }
        current += 1;
        report({
            phase: 'reload',
            current,
            total,
            label: anyFail && ((_a = lines[lines.length - 1]) === null || _a === void 0 ? void 0 : _a.includes(ext.name))
                ? `${ext.name} 刷新失败`
                : `${ext.name} 已刷新`,
        });
    }
    report({
        phase: 'scene',
        current,
        total,
        label: '恢复场景层级…',
    });
    const recovered = await recoverSceneHierarchy();
    current += 1;
    if (recovered) {
        lines.push(`· 场景: ${recovered}（修复层级空数据）`);
        await sleep(400);
    }
    else {
        lines.push('· 场景: 未能 soft-reload（若层级为空请手动重新打开场景）');
    }
    report({
        phase: 'scene',
        current,
        total,
        label: recovered ? `场景: ${recovered}` : '场景 soft-reload 未就绪',
    });
    if (host) {
        lines.push(`· ${host.name}: 待刷新宿主`);
        report({
            phase: 'host',
            current,
            total,
            label: `即将刷新宿主 ${host.name}…`,
        });
        current += 1;
    }
    report({
        phase: 'done',
        current: total,
        total,
        label: anyFail ? '部分失败，即将刷新宿主…' : '完成，即将刷新宿主…',
        done: true,
        ok: !anyFail,
    });
    return { ok: !anyFail, lines, host };
}
//# sourceMappingURL=rebuildAllExtensions.js.map