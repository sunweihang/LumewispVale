'use strict';
function numsOrDash(arr, empty = '—') {
    return (arr || []).length ? (arr || []).join(', ') : empty;
}
function triggerLabel(raw) {
    const s = String(raw || '').trim();
    if (!s)
        return '—';
    const name = s.split(',')[0];
    const map = {
        ImmediateStart: '立刻刷',
        Immediate: '立刻刷',
        AfterLayerStart: '等某条清完',
        RangeStart: '靠近范围',
        ManualStart: '手动激活',
        OnHpBelowStart: '血量触发',
        EndAction: '结束',
        End: '结束',
        RespawnAction: '复活再刷',
        TriggerLayerAction: '激活另一条',
        LoopBackAction: '跳回',
    };
    const zh = map[name] || name;
    const rest = s.includes(',') ? s.slice(s.indexOf(',') + 1) : '';
    return rest ? `${zh}（${rest}）` : zh;
}
function isAreaItem(item) {
    var _a, _b, _c;
    if (item.spawnShape === 'area')
        return true;
    if (item.spawnShape === 'point')
        return false;
    return ((_a = item.enemyCount) !== null && _a !== void 0 ? _a : 0) > 0 || ((_c = (_b = item.enemyKeys) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0) > 0;
}
function kindZh(kind) {
    return kind === 'monster' ? '怪物' : '英雄';
}
function formatPickLabel(avatar, config) {
    return `${config.name}（${kindZh(config.kind)} ${config.id}）· 模型 ${avatar.model}`;
}
module.exports = Editor.Panel.define({
    listeners: {},
    template: `
    <div class="wrap">
      <div class="head">
        <div>
          <div class="title">逻辑场景种植</div>
          <div id="meta" class="meta">加载中…</div>
        </div>
        <div class="head-actions">
          <ui-button id="btn-preview">场景预览</ui-button>
          <ui-button id="btn-import">从Prefab导入</ui-button>
          <ui-button id="btn-save" class="green">保存</ui-button>
          <ui-button id="btn-close">关闭</ui-button>
        </div>
      </div>
      <div class="toolbar">
        <ui-button id="btn-reload">重新加载</ui-button>
        <ui-button id="btn-add-area">加区域</ui-button>
        <ui-button id="btn-add-point">加点位</ui-button>
        <span class="hint">可拖 Area/Point 改位置（自动回写）。青盒=区域 · 模型=子节点</span>
      </div>
      <div id="list" class="list"></div>
      <div id="picker" class="picker hidden">
        <div class="picker-panel">
          <div class="picker-head">
            <div>
              <div class="picker-title">选择种植单位</div>
              <div class="picker-sub">模型来自 Avatar 表；同一模型可对应多条怪物/英雄配置</div>
            </div>
            <ui-button id="picker-close">关闭</ui-button>
          </div>
          <input id="picker-search" type="text" placeholder="搜索 模型 / 配置名 / id…" />
          <div class="picker-cols">
            <span class="col-id">模型</span>
            <span class="col-name">描述</span>
            <span class="col-cat">配置</span>
          </div>
          <div id="picker-list" class="picker-list"></div>
        </div>
      </div>
    </div>
  `,
    style: `
    .wrap { position: relative; padding: 12px; display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box; }
    .head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .title { font-weight: 700; font-size: 14px; }
    .meta { opacity: 0.75; font-size: 12px; margin-top: 4px; line-height: 1.4; white-space: pre-line; }
    .head-actions, .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .hint { opacity: 0.65; font-size: 11px; }
    .list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
    .card {
      border: 1px solid #3a5a3a; border-radius: 6px; padding: 10px; background: #1a221a;
      display: flex; flex-direction: column; gap: 6px;
    }
    .c-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .c-title { font-weight: 600; font-size: 13px; }
    .badge { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: #2d5a2d; color: #b8e0b8; }
    .badge.warn { background: #5a4a2d; color: #e0d0a0; }
    .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .tag { font-size: 11px; opacity: 0.7; min-width: 48px; }
    input[type="text"], input[type="number"] {
      height: 26px; padding: 0 6px; border: 1px solid #555; border-radius: 3px;
      background: #2a2a2a; color: #ddd; outline: none; box-sizing: border-box;
    }
    input.num { width: 72px; }
    input.wide { flex: 1; min-width: 100px; }
    .pick-val {
      flex: 1; min-width: 160px; height: 26px; padding: 0 8px; border: 1px solid #555; border-radius: 3px;
      background: #243024; color: #d8f0d8; font-size: 12px; display: flex; align-items: center;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .pick-val.empty { color: #888; background: #2a2a2a; }
    .c-actions { margin-left: auto; }
    .sep { height: 1px; background: #333; margin: 4px 0; }
    .rhythm-ro { display: flex; flex-direction: column; gap: 4px; padding-top: 2px; }
    .rhythm-ro .rh-grid {
      display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 4px 10px; align-items: baseline;
    }
    .rhythm-ro .rh-lab { font-size: 11px; opacity: 0.5; min-width: 28px; }
    .rhythm-ro .rh-val { font-size: 12px; color: #ccc; }
    .rhythm-ro .rh-val.muted { opacity: 0.45; }
    .rhythm-ro .rh-tip { font-size: 11px; color: #c9a86a; line-height: 1.4; }

    .picker {
      position: absolute; inset: 0; background: rgba(0,0,0,0.55); z-index: 20;
      display: flex; align-items: stretch; justify-content: center; padding: 16px; box-sizing: border-box;
    }
    .picker.hidden { display: none; }
    .picker-panel {
      width: min(560px, 100%); background: #1e1e1e; border: 1px solid #444; border-radius: 8px;
      display: flex; flex-direction: column; gap: 8px; padding: 12px; box-sizing: border-box;
    }
    .picker-head { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .picker-title { font-weight: 700; font-size: 14px; }
    .picker-sub { opacity: 0.65; font-size: 11px; margin-top: 2px; line-height: 1.35; }
    #picker-search { width: 100%; height: 28px; }
    .picker-cols {
      display: grid; grid-template-columns: 72px 1fr 1.2fr; gap: 8px; padding: 0 8px;
      font-size: 11px; color: #8a8a8a;
    }
    .picker-list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 4px; min-height: 240px; }
    .p-avatar {
      border: 1px solid #333; border-radius: 4px; background: #252525; overflow: hidden;
    }
    .p-avatar-row {
      display: grid; grid-template-columns: 72px 1fr 1.2fr; gap: 8px; padding: 8px;
      align-items: center; cursor: pointer;
    }
    .p-avatar-row:hover { background: #2e3a2e; }
    .p-avatar-row .id { color: #9ad; font-variant-numeric: tabular-nums; }
    .p-avatar-row .name { color: #ddd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .p-avatar-row .meta { color: #aaa; font-size: 11px; }
    .p-configs { display: flex; flex-direction: column; border-top: 1px solid #333; }
    .p-config {
      display: grid; grid-template-columns: 72px 1fr auto; gap: 8px; padding: 6px 8px 6px 20px;
      align-items: center; cursor: pointer; font-size: 12px;
    }
    .p-config:hover { background: #2a402a; }
    .p-config.selected { background: #2d5a2d; }
    .p-config .kind { color: #c9a86a; font-size: 11px; }
    .p-empty { opacity: 0.6; padding: 24px; text-align: center; font-size: 12px; }
  `,
    $: {
        meta: '#meta',
        list: '#list',
        picker: '#picker',
        pickerList: '#picker-list',
        pickerSearch: '#picker-search',
        pickerClose: '#picker-close',
        btnPreview: '#btn-preview',
        btnImport: '#btn-import',
        btnSave: '#btn-save',
        btnClose: '#btn-close',
        btnReload: '#btn-reload',
        btnAddArea: '#btn-add-area',
        btnAddPoint: '#btn-add-point',
    },
    ready() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const metaEl = this.$.meta;
        const listEl = this.$.list;
        const pickerEl = this.$.picker;
        const pickerListEl = this.$.pickerList;
        const pickerSearchEl = this.$.pickerSearch;
        if (this._spawnEditorBound) {
            (_a = this._reloadSpawnEditor) === null || _a === void 0 ? void 0 : _a.call(this);
            return;
        }
        this._spawnEditorBound = true;
        let logicId = 0;
        let assetsSceneId = 0;
        let logicName = '';
        let bundle = { layers: [] };
        let layerConfigs = [];
        let missingLayerIds = new Set();
        let previewTimer = null;
        let dragSyncTimer = null;
        let plantables = [];
        let pickerTarget = null;
        let pickerExpanded = new Set();
        /** 正在把场景拖拽坐标写回面板，避免触发重建预览 */
        let applyingScenePos = false;
        const close = () => {
            var _a, _b;
            try {
                (_b = (_a = Editor.Panel).close) === null || _b === void 0 ? void 0 : _b.call(_a, 'scene-editor.spawn-editor');
            }
            catch {
                /* ignore */
            }
        };
        const num = (v, d = 0) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : d;
        };
        const configOf = (layerId) => layerConfigs.find((c) => c.layer_id === layerId) || null;
        const nextId = () => bundle.layers.reduce((m, l) => Math.max(m, l.layerId), 0) + 1 || 1;
        const loadPlantables = async () => {
            try {
                plantables = (await Editor.Message.request('scene-editor', 'list-plantables')) || [];
            }
            catch (e) {
                console.warn('[spawn-editor] list-plantables failed', e);
                plantables = [];
            }
        };
        const findResolved = (item) => {
            var _a;
            if (item.unitKind && item.unitConfigId) {
                for (const avatar of plantables) {
                    const config = avatar.configs.find((c) => c.kind === item.unitKind && c.id === item.unitConfigId);
                    if (config)
                        return { avatar, config };
                }
            }
            const key = item.monsterKey || ((_a = item.enemyKeys) === null || _a === void 0 ? void 0 : _a[0]);
            if (item.unitConfigId) {
                for (const avatar of plantables) {
                    const config = avatar.configs.find((c) => c.kind === 'monster' && c.id === item.unitConfigId) ||
                        avatar.configs.find((c) => c.id === item.unitConfigId);
                    if (config)
                        return { avatar, config };
                }
            }
            if (key) {
                for (const avatar of plantables) {
                    const config = avatar.configs.find((c) => c.kind === 'monster' && (c.key === key || c.name === key));
                    if (config)
                        return { avatar, config };
                }
            }
            if (item.avatarId) {
                const avatar = plantables.find((a) => a.avatarId === item.avatarId);
                if (avatar === null || avatar === void 0 ? void 0 : avatar.configs[0])
                    return { avatar, config: avatar.configs[0] };
            }
            return null;
        };
        const defaultPick = () => {
            const preferred = plantables.find((a) => a.configs.some((c) => c.kind === 'monster' && c.key === 'Enemy00')) ||
                plantables.find((a) => a.configs.some((c) => c.kind === 'monster')) ||
                plantables[0];
            if (!(preferred === null || preferred === void 0 ? void 0 : preferred.configs[0]))
                return null;
            const config = preferred.configs.find((c) => c.kind === 'monster' && c.key === 'Enemy00') ||
                preferred.configs.find((c) => c.kind === 'monster') ||
                preferred.configs[0];
            return { avatar: preferred, config };
        };
        const applyPick = (item, avatar, config, area) => {
            var _a, _b;
            item.unitKind = config.kind;
            item.unitConfigId = config.id;
            item.avatarId = avatar.avatarId;
            item.spawnShape = area ? 'area' : 'point';
            if (config.kind === 'monster') {
                item.monsterKey = config.key;
                if (area) {
                    item.enemyKeys = [config.key];
                    item.enemyCount = Math.max(1, (_a = item.enemyCount) !== null && _a !== void 0 ? _a : 1);
                }
                else {
                    delete item.enemyKeys;
                    delete item.enemyCount;
                }
            }
            else {
                delete item.monsterKey;
                if (area) {
                    item.enemyKeys = [];
                    item.enemyCount = Math.max(1, (_b = item.enemyCount) !== null && _b !== void 0 ? _b : 1);
                }
                else {
                    delete item.enemyKeys;
                    delete item.enemyCount;
                }
            }
        };
        const hidePicker = () => {
            pickerTarget = null;
            pickerEl.classList.add('hidden');
        };
        const renderPickerList = () => {
            const q = (pickerSearchEl.value || '').trim().toLowerCase();
            pickerListEl.innerHTML = '';
            const filtered = plantables.filter((a) => {
                if (!q)
                    return true;
                const blob = [
                    a.avatarId,
                    a.model,
                    a.desc,
                    ...a.configs.map((c) => `${c.kind} ${c.id} ${c.key} ${c.name}`),
                ]
                    .join(' ')
                    .toLowerCase();
                return blob.includes(q);
            });
            if (!filtered.length) {
                pickerListEl.innerHTML = '<div class="p-empty">没有可种植配置（检查 TbAvatar / TbMonster / TbHero）</div>';
                return;
            }
            const selected = pickerTarget ? findResolved(pickerTarget) : null;
            for (const avatar of filtered) {
                const box = document.createElement('div');
                box.className = 'p-avatar';
                const row = document.createElement('div');
                row.className = 'p-avatar-row';
                const only = avatar.configs.length === 1 ? avatar.configs[0] : null;
                row.innerHTML = `
          <span class="id">${avatar.model}</span>
          <span class="name" title="${avatar.desc}">${avatar.desc}${avatar.hasPrefab ? '' : ' · 缺Prefab'}</span>
          <span class="meta">${avatar.configs.length} 条配置 · Avatar ${avatar.avatarId}</span>
        `;
                row.addEventListener('click', () => {
                    if (only && pickerTarget) {
                        const area = isAreaItem(pickerTarget);
                        applyPick(pickerTarget, avatar, only, area);
                        hidePicker();
                        renderList();
                        schedulePreview();
                        return;
                    }
                    if (pickerExpanded.has(avatar.avatarId))
                        pickerExpanded.delete(avatar.avatarId);
                    else
                        pickerExpanded.add(avatar.avatarId);
                    renderPickerList();
                });
                box.appendChild(row);
                const expanded = pickerExpanded.has(avatar.avatarId) || avatar.configs.length > 1;
                if (expanded || only) {
                    const cfgBox = document.createElement('div');
                    cfgBox.className = 'p-configs';
                    for (const config of avatar.configs) {
                        const cRow = document.createElement('div');
                        const isSel = (selected === null || selected === void 0 ? void 0 : selected.config.kind) === config.kind && (selected === null || selected === void 0 ? void 0 : selected.config.id) === config.id;
                        cRow.className = `p-config${isSel ? ' selected' : ''}`;
                        cRow.innerHTML = `
              <span class="kind">${kindZh(config.kind)}</span>
              <span>${config.id} · ${config.name} <span style="opacity:.55">(${config.key})</span></span>
              <span style="opacity:.5;font-size:11px">选用</span>
            `;
                        cRow.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            if (!pickerTarget)
                                return;
                            const area = isAreaItem(pickerTarget);
                            applyPick(pickerTarget, avatar, config, area);
                            hidePicker();
                            renderList();
                            schedulePreview();
                        });
                        cfgBox.appendChild(cRow);
                    }
                    box.appendChild(cfgBox);
                }
                pickerListEl.appendChild(box);
            }
        };
        const openPicker = (item) => {
            pickerTarget = item;
            const hit = findResolved(item);
            pickerExpanded = new Set(hit ? [hit.avatar.avatarId] : []);
            pickerSearchEl.value = '';
            pickerEl.classList.remove('hidden');
            renderPickerList();
            pickerSearchEl.focus();
        };
        const flattenToOneItemPerLayer = () => {
            var _a;
            const flat = [];
            let maxId = bundle.layers.reduce((m, l) => Math.max(m, l.layerId), 0);
            const newMissing = new Set();
            for (const layer of bundle.layers) {
                const items = ((_a = layer.items) === null || _a === void 0 ? void 0 : _a.length) ? layer.items : [];
                if (!items.length) {
                    flat.push({ layerId: layer.layerId, layerName: layer.layerName, items: [] });
                    if (!configOf(layer.layerId))
                        newMissing.add(layer.layerId);
                    continue;
                }
                items.forEach((it, i) => {
                    const layerId = i === 0 ? layer.layerId : ++maxId;
                    const name = i === 0
                        ? layer.layerName || (isAreaItem(it) ? `区域${layerId}` : `点位${layerId}`)
                        : isAreaItem(it)
                            ? `区域${layerId}`
                            : `点位${layerId}`;
                    flat.push({ layerId, layerName: name, items: [{ ...it }] });
                    if (!configOf(layerId))
                        newMissing.add(layerId);
                });
            }
            bundle.layers = flat.length ? flat : [{ layerId: 1, layerName: 'default', items: [] }];
            missingLayerIds = newMissing;
        };
        const refreshScenePreview = (openPrefab = false) => {
            if (!assetsSceneId)
                return;
            void (async () => {
                const r = (await Editor.Message.request('scene-editor', 'preview-spawn-in-scene', {
                    assetsSceneId,
                    layers: bundle.layers,
                    layerIndex: 0,
                    showAllLayers: true,
                    openPrefab,
                }));
                if (!(r === null || r === void 0 ? void 0 : r.ok))
                    console.warn('[spawn-editor] 场景预览失败:', (r === null || r === void 0 ? void 0 : r.reason) || 'unknown');
            })();
        };
        const schedulePreview = () => {
            if (applyingScenePos)
                return;
            if (previewTimer)
                clearTimeout(previewTimer);
            previewTimer = setTimeout(() => refreshScenePreview(false), 200);
        };
        const round3 = (n) => Math.round(n * 1000) / 1000;
        /** 场景拖拽 Area/Point → 回写种植 position（不重建预览，避免打断拖拽） */
        const syncPositionsFromScene = async () => {
            var _a, _b, _c;
            if (!assetsSceneId || applyingScenePos)
                return;
            try {
                const r = (await Editor.Message.request('scene-editor', 'query-spawn-preview-transforms'));
                if (!(r === null || r === void 0 ? void 0 : r.ok) || !((_a = r.items) === null || _a === void 0 ? void 0 : _a.length))
                    return;
                let changed = false;
                applyingScenePos = true;
                for (const t of r.items) {
                    const layer = bundle.layers.find((l) => l.layerId === t.layerId);
                    const item = (_b = layer === null || layer === void 0 ? void 0 : layer.items) === null || _b === void 0 ? void 0 : _b[(_c = t.itemIndex) !== null && _c !== void 0 ? _c : 0];
                    if (!item)
                        continue;
                    const pos = item.position || { x: 0, y: 0.5, z: 0 };
                    item.position = pos;
                    const nx = round3(t.x);
                    const ny = round3(t.y);
                    const nz = round3(t.z);
                    if (Math.abs(pos.x - nx) < 0.001 &&
                        Math.abs(pos.y - ny) < 0.001 &&
                        Math.abs(pos.z - nz) < 0.001) {
                        continue;
                    }
                    pos.x = nx;
                    pos.y = ny;
                    pos.z = nz;
                    changed = true;
                    for (const axis of ['x', 'y', 'z']) {
                        const inp = listEl.querySelector(`input[data-pos-layer="${t.layerId}"][data-pos-axis="${axis}"]`);
                        if (inp)
                            inp.value = String(pos[axis]);
                    }
                }
                applyingScenePos = false;
                if (changed) {
                    /* 数据已更新；保存时写入 index.json */
                }
            }
            catch {
                applyingScenePos = false;
            }
        };
        const startDragSync = () => {
            if (dragSyncTimer)
                return;
            dragSyncTimer = setInterval(() => {
                void syncPositionsFromScene();
            }, 250);
        };
        const stopDragSync = () => {
            if (dragSyncTimer) {
                clearInterval(dragSyncTimer);
                dragSyncTimer = null;
            }
        };
        const mkNum = (value) => {
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.className = 'num';
            inp.value = value;
            return inp;
        };
        const mkText = (value, ph) => {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'wide';
            inp.value = value;
            inp.placeholder = ph;
            return inp;
        };
        const appendRhythmReadonly = (host, layerId) => {
            var _a;
            const cfg = configOf(layerId);
            const box = document.createElement('div');
            box.className = 'rhythm-ro';
            if (!cfg) {
                const tip = document.createElement('div');
                tip.className = 'rh-tip';
                tip.textContent = `配置表无 layer_id=${layerId}，请在 Excel 补行后导 Luban`;
                box.appendChild(tip);
                host.appendChild(box);
                return;
            }
            const grid = document.createElement('div');
            grid.className = 'rh-grid';
            const waves = numsOrDash(cfg.gen_nums, '一次刷完');
            const gaps = numsOrDash(cfg.gen_intervals, '—');
            const cells = [
                ['开始', triggerLabel(cfg.start_trigger)],
                ['清完', triggerLabel(cfg.on_cleared)],
                ['分波', waves, waves === '一次刷完'],
                ['间隔', gaps, gaps === '—'],
                ['排序', String((_a = cfg.sort_order) !== null && _a !== void 0 ? _a : '—')],
            ];
            for (const [lab, val, muted] of cells) {
                const labEl = document.createElement('span');
                labEl.className = 'rh-lab';
                labEl.textContent = lab;
                const valEl = document.createElement('span');
                valEl.className = muted ? 'rh-val muted' : 'rh-val';
                valEl.textContent = val;
                grid.appendChild(labEl);
                grid.appendChild(valEl);
            }
            box.appendChild(grid);
            host.appendChild(box);
        };
        const ensureItem = (layer, preferArea) => {
            if (layer.items[0])
                return layer.items[0];
            const pick = defaultPick();
            const item = preferArea
                ? {
                    position: { x: 0, y: 0.5, z: 0 },
                    scale: { x: 5, y: 1, z: 5 },
                    enemyCount: 1,
                    fogOfWarName: '',
                    level: 1,
                    spawnShape: 'area',
                }
                : {
                    level: 1,
                    position: { x: 0, y: 0.5, z: 0 },
                    eulerAngles: { x: 0, y: 0, z: 0 },
                    scale: { x: 1, y: 1, z: 1 },
                    fogOfWarName: '',
                    spawnShape: 'point',
                };
            if (pick)
                applyPick(item, pick.avatar, pick.config, preferArea);
            else if (preferArea) {
                item.enemyKeys = ['Enemy00'];
            }
            else {
                item.monsterKey = 'Enemy00';
            }
            layer.items = [item];
            return item;
        };
        const renderList = () => {
            listEl.innerHTML = '';
            const usable = bundle.layers.filter((l) => l.items.length > 0);
            if (!usable.length) {
                listEl.innerHTML = '<div class="hint">还没有刷怪。点「加区域」或「加点位」。</div>';
                return;
            }
            usable.forEach((layer, i) => {
                var _a, _b;
                const item = layer.items[0];
                const area = isAreaItem(item);
                const missing = !configOf(layer.layerId) || missingLayerIds.has(layer.layerId);
                const resolved = findResolved(item);
                const card = document.createElement('div');
                card.className = 'card';
                const head = document.createElement('div');
                head.className = 'c-head';
                const title = document.createElement('span');
                title.className = 'c-title';
                title.textContent = `${area ? '区域' : '点位'} #${i + 1}`;
                const badge = document.createElement('span');
                badge.className = `badge ${missing ? 'warn' : ''}`;
                badge.textContent = missing ? '表缺节奏' : '表已关联';
                const idHint = document.createElement('span');
                idHint.className = 'hint';
                idHint.textContent = `#ID ${layer.layerId}`;
                const del = document.createElement('ui-button');
                del.textContent = '删除';
                del.className = 'c-actions';
                del.addEventListener('click', () => {
                    const idx = bundle.layers.indexOf(layer);
                    if (idx >= 0)
                        bundle.layers.splice(idx, 1);
                    missingLayerIds.delete(layer.layerId);
                    renderList();
                    schedulePreview();
                });
                head.appendChild(title);
                head.appendChild(badge);
                head.appendChild(idHint);
                head.appendChild(del);
                card.appendChild(head);
                const r = document.createElement('div');
                r.className = 'row';
                r.appendChild(Object.assign(document.createElement('span'), { className: 'tag', textContent: '单位' }));
                const val = document.createElement('div');
                val.className = `pick-val${resolved ? '' : ' empty'}`;
                val.textContent = resolved
                    ? formatPickLabel(resolved.avatar, resolved.config)
                    : '未选择（点选择）';
                val.title = resolved
                    ? `Avatar ${resolved.avatar.avatarId} → model ${resolved.avatar.model} → ${resolved.config.kind} ${resolved.config.id}`
                    : '';
                const pickBtn = document.createElement('ui-button');
                pickBtn.textContent = '选择';
                pickBtn.addEventListener('click', () => openPicker(item));
                r.appendChild(val);
                r.appendChild(pickBtn);
                if (area) {
                    const count = mkNum(String((_a = item.enemyCount) !== null && _a !== void 0 ? _a : 1));
                    count.addEventListener('change', () => {
                        item.enemyCount = Math.max(0, num(count.value, 1));
                        item.spawnShape = 'area';
                    });
                    r.appendChild(Object.assign(document.createElement('span'), { className: 'tag', textContent: '数量' }));
                    r.appendChild(count);
                }
                card.appendChild(r);
                const level = mkNum(String((_b = item.level) !== null && _b !== void 0 ? _b : 1));
                level.addEventListener('change', () => {
                    item.level = Math.max(1, num(level.value, 1));
                });
                const fog = mkText(item.fogOfWarName || '', 'Fog0 可空');
                fog.addEventListener('change', () => {
                    item.fogOfWarName = fog.value.trim();
                });
                const meta = document.createElement('div');
                meta.className = 'row';
                meta.appendChild(Object.assign(document.createElement('span'), { className: 'tag', textContent: '等级' }));
                meta.appendChild(level);
                meta.appendChild(Object.assign(document.createElement('span'), { className: 'tag', textContent: '迷雾' }));
                meta.appendChild(fog);
                card.appendChild(meta);
                const pos = item.position || { x: 0, y: 0.5, z: 0 };
                item.position = pos;
                const posRow = document.createElement('div');
                posRow.className = 'row';
                posRow.appendChild(Object.assign(document.createElement('span'), { className: 'tag', textContent: '位置' }));
                ['x', 'y', 'z'].forEach((k) => {
                    const inp = mkNum(String(pos[k]));
                    inp.step = '0.1';
                    inp.dataset.posLayer = String(layer.layerId);
                    inp.dataset.posAxis = k;
                    inp.addEventListener('change', () => {
                        if (applyingScenePos)
                            return;
                        pos[k] = num(inp.value);
                        schedulePreview();
                    });
                    posRow.appendChild(inp);
                });
                card.appendChild(posRow);
                if (area) {
                    const scale = item.scale || { x: 5, y: 1, z: 5 };
                    item.scale = scale;
                    const scaleRow = document.createElement('div');
                    scaleRow.className = 'row';
                    scaleRow.appendChild(Object.assign(document.createElement('span'), { className: 'tag', textContent: '区域XZ' }));
                    ['x', 'z'].forEach((k) => {
                        const inp = mkNum(String(scale[k]));
                        inp.step = '0.1';
                        inp.addEventListener('change', () => {
                            scale[k] = num(inp.value, 1);
                            schedulePreview();
                        });
                        scaleRow.appendChild(inp);
                    });
                    card.appendChild(scaleRow);
                }
                card.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
                appendRhythmReadonly(card, layer.layerId);
                listEl.appendChild(card);
            });
        };
        const addEntry = (kind) => {
            bundle.layers = bundle.layers.filter((l) => l.items.length > 0);
            const id = bundle.layers.length === 0 ? 1 : nextId();
            const layer = {
                layerId: id,
                layerName: kind === 'area' ? `区域${id}` : `点位${id}`,
                items: [],
            };
            ensureItem(layer, kind === 'area');
            bundle.layers.push(layer);
            if (!configOf(id))
                missingLayerIds.add(id);
            renderList();
            schedulePreview();
        };
        const loadFromDisk = async (opts) => {
            var _a, _b, _c;
            await loadPlantables();
            const ctx = (await Editor.Message.request('scene-editor', 'query-spawn-editor-context'));
            if (!(ctx === null || ctx === void 0 ? void 0 : ctx.logicId) || ctx.error) {
                metaEl.textContent = (ctx === null || ctx === void 0 ? void 0 : ctx.error) || '未指定逻辑场景';
                return;
            }
            logicId = ctx.logicId;
            assetsSceneId = ctx.assetsSceneId || 0;
            logicName = ctx.name || '';
            bundle = ((_b = (_a = ctx.monsterSpawn) === null || _a === void 0 ? void 0 : _a.layers) === null || _b === void 0 ? void 0 : _b.length)
                ? {
                    formatVersion: (_c = ctx.monsterSpawn.formatVersion) !== null && _c !== void 0 ? _c : 1,
                    logicSceneId: logicId,
                    resourceSceneId: String(assetsSceneId),
                    layers: ctx.monsterSpawn.layers.map((l) => ({
                        layerId: l.layerId,
                        layerName: l.layerName,
                        items: Array.isArray(l.items) ? l.items.map((it) => ({ ...it })) : [],
                    })),
                }
                : { formatVersion: 1, logicSceneId: logicId, resourceSceneId: String(assetsSceneId), layers: [] };
            layerConfigs = Array.isArray(ctx.layerConfigs)
                ? ctx.layerConfigs.map((c) => ({
                    ...c,
                    gen_intervals: [...(c.gen_intervals || [])],
                    gen_nums: [...(c.gen_nums || [])],
                }))
                : [];
            missingLayerIds = new Set(ctx.missingLayerIds || []);
            flattenToOneItemPerLayer();
            metaEl.textContent = `逻辑 ${logicId}「${logicName}」· 资源 ${assetsSceneId}\n种植 → index.json；模型 → TbAvatar；节奏 → Excel / tbspawnconfig\n场景中拖 Area/Point 可改位置（需点保存落盘）`;
            renderList();
            startDragSync();
            const openPrefab = (opts === null || opts === void 0 ? void 0 : opts.openPrefab) === true;
            setTimeout(() => refreshScenePreview(openPrefab), openPrefab ? 400 : 200);
        };
        (_b = this.$.pickerClose) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => hidePicker());
        pickerEl.addEventListener('click', (ev) => {
            if (ev.target === pickerEl)
                hidePicker();
        });
        pickerSearchEl.addEventListener('input', () => renderPickerList());
        (_c = this.$.btnReload) === null || _c === void 0 ? void 0 : _c.addEventListener('click', () => {
            void loadFromDisk({ openPrefab: false });
        });
        (_d = this.$.btnAddArea) === null || _d === void 0 ? void 0 : _d.addEventListener('click', () => addEntry('area'));
        (_e = this.$.btnAddPoint) === null || _e === void 0 ? void 0 : _e.addEventListener('click', () => addEntry('point'));
        (_f = this.$.btnPreview) === null || _f === void 0 ? void 0 : _f.addEventListener('click', () => refreshScenePreview(true));
        (_g = this.$.btnSave) === null || _g === void 0 ? void 0 : _g.addEventListener('click', () => {
            void (async () => {
                flattenToOneItemPerLayer();
                bundle.layers = bundle.layers.filter((l) => l.items.length > 0);
                if (!bundle.layers.length) {
                    bundle.layers = [{ layerId: 1, layerName: 'default', items: [] }];
                }
                const result = (await Editor.Message.request('scene-editor', 'save-logic-spawn', {
                    logicId,
                    assetsSceneId,
                    monsterSpawn: bundle,
                }));
                if (!(result === null || result === void 0 ? void 0 : result.ok)) {
                    await Editor.Dialog.error((result === null || result === void 0 ? void 0 : result.error) || '保存失败', {
                        title: '种植编辑',
                        buttons: ['确定'],
                        default: 0,
                    });
                    return;
                }
                const missing = bundle.layers
                    .filter((l) => l.items.length && !configOf(l.layerId))
                    .map((l) => l.layerId);
                const tip = missing.length > 0
                    ? `种植已保存（${bundle.layers.filter((l) => l.items.length).length} 条）。\n配置表缺 layer_id: ${missing.join(', ')}，请在 Excel 补行后导 Luban。`
                    : `种植已保存（${bundle.layers.filter((l) => l.items.length).length} 条）。节奏仍以配置表为准。`;
                await Editor.Dialog.info(tip, { title: '种植编辑', buttons: ['确定'], default: 0 });
                await loadFromDisk({ openPrefab: false });
                try {
                    await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'logic-scene' });
                }
                catch {
                    /* ignore */
                }
            })();
        });
        (_h = this.$.btnImport) === null || _h === void 0 ? void 0 : _h.addEventListener('click', () => {
            void (async () => {
                const confirmed = await Editor.Dialog.warn(`将用资源场景 ${assetsSceneId} 的 Prefab EnemyBornInfo 覆盖当前种植，是否继续？`, { title: '从Prefab导入', buttons: ['取消', '导入'], default: 0, cancel: 0 });
                const response = typeof confirmed === 'number'
                    ? confirmed
                    : confirmed === null || confirmed === void 0 ? void 0 : confirmed.response;
                if (response !== 1)
                    return;
                const r = (await Editor.Message.request('scene-editor', 'sync-spawn', {
                    logicId,
                    assetsSceneId,
                }));
                if (!(r === null || r === void 0 ? void 0 : r.ok)) {
                    await Editor.Dialog.error((r === null || r === void 0 ? void 0 : r.error) || '导入失败', {
                        title: '从Prefab导入',
                        buttons: ['确定'],
                        default: 0,
                    });
                    return;
                }
                await loadFromDisk({ openPrefab: false });
            })();
        });
        (_j = this.$.btnClose) === null || _j === void 0 ? void 0 : _j.addEventListener('click', () => {
            stopDragSync();
            close();
        });
        this._stopDragSync = stopDragSync;
        this._reloadSpawnEditor = () => {
            void loadFromDisk({ openPrefab: false });
        };
        this._reloadSpawnEditor();
    },
    close() {
        var _a;
        (_a = this._stopDragSync) === null || _a === void 0 ? void 0 : _a.call(this);
    },
});
//# sourceMappingURL=spawnEditor.js.map