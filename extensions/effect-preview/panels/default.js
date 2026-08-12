'use strict';

const path = require('path');

// Creator 重载扩展时 require 缓存可能仍是旧 config.js，强制清掉再取
function loadConfigModule() {
    try {
        const id = require.resolve('../config');
        delete require.cache[id];
    } catch (_) {
        // ignore
    }
    return require('../config');
}

const {
    loadConfig,
    matchCharacter,
    getAnimEvents,
} = loadConfigModule();

const PKG = 'effect-preview';

async function sceneCall(method, ...args) {
    return Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method,
        args,
    });
}

async function queryPrefabUuid(resourcesPath) {
    // resourcesPath like effects/401/Output/401
    const dbPath = `db://assets/resources/${resourcesPath}.prefab`;
    try {
        const uuid = await Editor.Message.request('asset-db', 'query-uuid', dbPath);
        return uuid || null;
    } catch (e) {
        console.warn('[effect-preview] query-uuid failed', dbPath, e);
        return null;
    }
}

module.exports = Editor.Panel.define({
    listeners: {},

    template: `
    <div class="wrap">
      <header>
        <div class="title">特效预览 <span style="color:#7dffb0;font-size:11px">v1.1.5</span></div>
        <div class="sub">一键放入角色 → 拖时间线预览特效（无需 Play）</div>
      </header>

      <section class="setup-box">
        <div class="sec-title">① 一键准备</div>
        <div id="charPick" class="anim-list"></div>
        <ui-button id="btnSetup" class="setup-btn">一键打开预览场景并放入角色</ui-button>
        <div class="muted tip">会自动打开 EffectPreview 场景（或新建），再放入角色。不要从资源管理器拖。</div>
      </section>

      <section>
        <div class="row">
          <span class="label">节点</span>
          <span id="nodeName" class="value">—</span>
          <ui-button id="btnRefresh">刷新选中</ui-button>
        </div>
        <div class="row">
          <span class="label">配置</span>
          <span id="charId" class="value muted">未匹配</span>
        </div>
      </section>

      <section>
        <div class="sec-title">② 动作</div>
        <div id="animList" class="anim-list"></div>
      </section>

      <section>
        <div class="sec-title">③ 时间线</div>
        <div id="timeLabel" class="muted">0.00 / 0.00 s</div>
        <div id="timeline" class="timeline">
          <div id="track" class="track"></div>
          <div id="playhead" class="playhead"></div>
        </div>
        <div class="row btns">
          <ui-button id="btnPlay">▶ 预览播放</ui-button>
          <ui-button id="btnStop">■ 停止</ui-button>
          <ui-button id="btnClear">清除特效</ui-button>
        </div>
        <div class="muted tip">清除特效只删场景里的临时 SFX，不会删时间轴绿点 / 帧事件</div>
      </section>

      <section>
        <div class="sec-title">④ 在当前时间加特效</div>
        <div class="row">
          <span class="label" style="width:52px">特效名</span>
          <input id="sfxInput" class="sfx-input" type="text" placeholder="例如 SFX_WaterFlower" />
        </div>
        <ui-button id="btnAddSfx" class="setup-btn">在当前时间点添加并选中挂点</ui-button>
        <div class="muted tip">添加后时间轴出现绿色点：拖动改时间，右键删除；列表里可改秒数或点「删」</div>
      </section>

      <section>
        <div class="sec-title">⑤ 帧事件</div>
        <div id="eventList" class="event-list"></div>
      </section>

      <section>
        <div class="sec-title">⑥ 调特效位置</div>
        <div id="offsetBox" class="offset-box">
          <div class="muted">添加或点选帧事件后，选中 EffectMount 拖动</div>
        </div>
        <div class="muted tip">选中「EffectMount」后按 W 拖；也可在层级里把它拖到任意骨骼下。骨骼名会写入配置。</div>
      </section>

      <section>
        <div class="sec-title">⑦ 存储 / 读取配置</div>
        <div class="row btns">
          <ui-button id="btnSaveCfg">💾 保存当前角色</ui-button>
          <ui-button id="btnLoadCfg">📂 读取当前角色</ui-button>
        </div>
        <div class="muted tip">按角色单位写入 effect_preview.json：该模型全部动作的帧事件、特效名、挂点与偏移都会保存 / 加载。</div>
      </section>

      <section>
        <div class="sec-title">日志</div>
        <pre id="log" class="log"></pre>
      </section>
    </div>
    `,

    style: `
    .wrap { padding: 10px 12px 16px; color: #e8eaf0; font-size: 12px; }
    header { margin-bottom: 10px; }
    .title { font-size: 14px; font-weight: 600; }
    .sub { color: #9aa3b5; margin-top: 2px; }
    section { margin: 10px 0; }
    .sec-title { color: #c9d0e0; margin-bottom: 6px; font-weight: 600; }
    .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; flex-wrap: wrap; }
    .label { width: 36px; color: #9aa3b5; flex-shrink: 0; }
    .value { flex: 1; word-break: break-all; }
    .muted { color: #9aa3b5; }
    .anim-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .anim-btn {
      background: #2c3348; border: 1px solid #3d4560; color: #eef0f6;
      border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 11px;
    }
    .anim-btn.active { background: #2f6fed; border-color: #2f6fed; }
    .anim-btn.has-sfx { box-shadow: inset 0 -2px 0 #e6b84d; }
    .setup-box {
      background: rgba(47, 111, 237, 0.12);
      border: 1px solid #3d5f9e;
      border-radius: 8px;
      padding: 10px;
    }
    .setup-btn { width: 100%; margin-top: 8px; }
    .tip { margin-top: 6px; line-height: 1.4; }
    .char-pick.active { background: #2f6fed; border-color: #2f6fed; }
    .timeline {
      position: relative; height: 40px; background: #0e1018;
      border: 1px solid #3d4560; border-radius: 8px; cursor: ew-resize;
      margin: 6px 0; user-select: none; overflow: hidden;
    }
    .track {
      position: absolute; left: 0; right: 0; top: 50%; height: 4px;
      margin-top: -2px; background: #2c3348; border-radius: 2px;
    }
    .playhead {
      position: absolute; top: 2px; bottom: 2px; width: 4px; margin-left: -2px;
      background: #7dffb0; border-radius: 2px; left: 0%; z-index: 4; pointer-events: none;
    }
    .marker {
      position: absolute; top: 8px; width: 10px; height: 10px; border-radius: 50%;
      background: #e6b84d; border: 1px solid #000; z-index: 3; cursor: pointer;
    }
    .marker.empty { background: #6a7388; }
    .marker.user { background: #7dffb0; border-color: #1a5; }
    .marker.selected { border: 2px solid #fff; box-shadow: 0 0 0 2px rgba(125,255,176,0.35); }
    .event-list { max-height: 140px; overflow: auto; }
    .event-row {
      display: flex; gap: 6px; align-items: center; padding: 4px 6px;
      border-radius: 6px; cursor: pointer; margin: 2px 0;
    }
    .event-row:hover { background: rgba(255,255,255,0.04); }
    .event-row.selected { background: rgba(47,111,237,0.25); }
    .event-row .t { margin-left: auto; color: #9aa3b5; }
    .offset-box input {
      width: 64px; background: #0e1018; color: #fff; border: 1px solid #3d4560;
      border-radius: 4px; padding: 4px;
    }
    .sfx-input {
      flex: 1; min-width: 140px; background: #0e1018; color: #fff;
      border: 1px solid #3d4560; border-radius: 4px; padding: 6px 8px; font-size: 12px;
    }
    .log {
      background: rgba(0,0,0,0.28); padding: 8px; border-radius: 6px;
      max-height: 90px; overflow: auto; white-space: pre-wrap; word-break: break-all;
      color: #a8adbc; margin: 0; font-size: 11px;
    }
    .btns ui-button { margin-right: 2px; }
    `,

    $: {
        nodeName: '#nodeName',
        charId: '#charId',
        btnRefresh: '#btnRefresh',
        charPick: '#charPick',
        btnSetup: '#btnSetup',
        animList: '#animList',
        timeLabel: '#timeLabel',
        timeline: '#timeline',
        playhead: '#playhead',
        eventList: '#eventList',
        offsetBox: '#offsetBox',
        sfxInput: '#sfxInput',
        btnAddSfx: '#btnAddSfx',
        btnPlay: '#btnPlay',
        btnStop: '#btnStop',
        btnClear: '#btnClear',
        btnSaveCfg: '#btnSaveCfg',
        btnLoadCfg: '#btnLoadCfg',
        log: '#log',
    },

    methods: {
        pushLog(msg) {
            const lines = (this._logs || []).slice();
            lines.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
            this._logs = lines.slice(0, 8);
            if (this.$.log) {
                this.$.log.textContent = this._logs.join('\n');
            }
        },

        getDuration() {
            // 只认当前动作真实 clip 时长；未采样前才短暂用配置值
            if (this._clipDuration && this._clipDuration > 0) {
                return this._clipDuration;
            }
            const anim = this.getCurrentAnim();
            return Math.max(0.05, (anim && anim.duration) || 0.05);
        },

        getCurrentAnim() {
            if (!this._character || !this._character.anims) {
                return null;
            }
            return this._character.anims[this._animIndex] || null;
        },

        getEvents() {
            return getAnimEvents(this._character, this.getCurrentAnim(), this._offsetOverrides);
        },

        /**
         * 把时间线锁定为当前动作真实长度，并裁掉超出的特效点
         */
        applyClipDuration(dur, opts) {
            opts = opts || {};
            const d = Math.max(0.05, +Number(dur || 0).toFixed(3));
            const prev = this._clipDuration || 0;
            this._clipDuration = d;
            const anim = this.getCurrentAnim();
            let clamped = 0;
            if (anim) {
                anim.duration = d;
                if (!anim.eventTimes) {
                    anim.eventTimes = {};
                }
                const names = anim.frameEvents || [];
                for (let i = 0; i < names.length; i++) {
                    const name = names[i];
                    const t = anim.eventTimes[name];
                    if (typeof t === 'number' && t > d) {
                        anim.eventTimes[name] = +d.toFixed(2);
                        clamped += 1;
                    }
                }
            }
            if ((this._time || 0) > d) {
                this._time = d;
            }
            this.rebuildMarkers();
            this.renderEvents();
            this.updatePlayhead();
            if (!opts.quiet) {
                if (Math.abs(prev - d) > 0.001) {
                    this.pushLog(`时间线 = ${d.toFixed(2)}s（当前动作真实长度）`);
                }
                if (clamped > 0) {
                    this.pushLog(`已裁剪 ${clamped} 个超出时长的特效点 → ≤${d.toFixed(2)}s`);
                }
            }
            return d;
        },

        /** 向场景采样当前动作 clip 真实时长，并同步时间线 */
        async ensureClipDuration(opts) {
            opts = opts || {};
            const anim = this.getCurrentAnim();
            if (!anim) {
                return 0;
            }
            if (!this._nodeUuid || !anim.clipUuid) {
                if (anim.duration > 0) {
                    return this.applyClipDuration(anim.duration, { quiet: opts.quiet });
                }
                return this.getDuration();
            }
            const res = await sceneCall('seekPose', {
                nodeUuid: this._nodeUuid,
                clipName: anim.clip || '',
                clipUuid: anim.clipUuid || '',
                time: 0.01,
                useControllerScrub: true,
            });
            if (res && res.ok && res.duration > 0) {
                return this.applyClipDuration(res.duration, { quiet: opts.quiet });
            }
            if (anim.duration > 0) {
                return this.applyClipDuration(anim.duration, { quiet: true });
            }
            return this.getDuration();
        },

        updatePlayhead() {
            const dur = this.getDuration();
            const t = Math.min(dur, Math.max(0, this._time || 0));
            this._time = t;
            const pct = Math.min(100, Math.max(0, (t / Math.max(0.001, dur)) * 100));
            if (this.$.playhead) {
                this.$.playhead.style.left = `${pct}%`;
            }
            if (this.$.timeLabel) {
                this.$.timeLabel.textContent = `${t.toFixed(2)} / ${dur.toFixed(2)} s`;
            }
        },

        rebuildMarkers() {
            const el = this.$.timeline;
            if (!el) {
                return;
            }
            el.querySelectorAll('.marker').forEach((m) => m.remove());
            const dur = this.getDuration();
            const events = this.getEvents();
            for (const ev of events) {
                const mk = document.createElement('div');
                const isUser = (ev.name || '').indexOf('@') >= 0;
                mk.className = `marker${ev.sfx ? '' : ' empty'}${isUser ? ' user' : ''}${ev.name === this._selectedEvent ? ' selected' : ''}`;
                const left = Math.min(98, Math.max(1, (ev.time / Math.max(0.001, dur)) * 100));
                mk.style.left = `calc(${left}% - 5px)`;
                mk.title = `${ev.name}\n${ev.sfx || '无特效'} @ ${ev.time.toFixed(2)}s\n拖动改时间，右键删除`;
                mk.dataset.eventName = ev.name;

                mk.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) {
                        return;
                    }
                    e.stopPropagation();
                    e.preventDefault();
                    this.stopAutoPlay();
                    this._selectedEvent = ev.name;
                    this._markerDrag = {
                        name: ev.name,
                        moved: false,
                        el: mk,
                    };
                    const onMove = (ev2) => {
                        if (!this._markerDrag) {
                            return;
                        }
                        this._markerDrag.moved = true;
                        const dur = this.getDuration();
                        const t = Math.min(dur, Math.max(0, this.timeFromClientX(ev2.clientX)));
                        const anim = this.getCurrentAnim();
                        if (anim) {
                            if (!anim.eventTimes) {
                                anim.eventTimes = {};
                            }
                            anim.eventTimes[this._markerDrag.name] = +Number(t).toFixed(2);
                        }
                        this._time = t;
                        this.updatePlayhead();
                        const leftPct = Math.min(98, Math.max(1, (t / Math.max(0.001, dur)) * 100));
                        this._markerDrag.el.style.left = `calc(${leftPct}% - 5px)`;
                    };
                    const onUp = (ev2) => {
                        document.removeEventListener('pointermove', onMove, true);
                        document.removeEventListener('pointerup', onUp, true);
                        const drag = this._markerDrag;
                        this._markerDrag = null;
                        if (!drag) {
                            return;
                        }
                        const dur = this.getDuration();
                        const t = Math.min(dur, Math.max(0, this.timeFromClientX(ev2.clientX)));
                        this.setEventTime(drag.name, t);
                        this._time = t;
                        this.updatePlayhead();
                        this.selectEvent(drag.name);
                        if (!drag.moved) {
                            this.seekTo(t, { playNearest: false });
                            const cur = this.getEvents().find((x) => x.name === drag.name);
                            if (cur && cur.sfx) {
                                this.showMountForEvent(drag.name);
                            }
                        } else {
                            this.pushLog(`已改时间：${drag.name} → ${t.toFixed(2)}s`);
                            this.showMountForEvent(drag.name);
                        }
                    };
                    document.addEventListener('pointermove', onMove, true);
                    document.addEventListener('pointerup', onUp, true);
                });

                mk.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteEvent(ev.name);
                });

                el.appendChild(mk);
            }
        },

        setEventTime(eventName, time, opts) {
            opts = opts || {};
            const anim = this.getCurrentAnim();
            if (!anim || !eventName) {
                return 0;
            }
            if (!anim.eventTimes) {
                anim.eventTimes = {};
            }
            const t = Math.min(this.getDuration(), Math.max(0, +Number(time).toFixed(2)));
            anim.eventTimes[eventName] = t;
            this.renderEvents();
            this.rebuildMarkers();
            return t;
        },

        deleteEvent(eventName) {
            const anim = this.getCurrentAnim();
            if (!anim || !eventName) {
                return;
            }
            anim.frameEvents = (anim.frameEvents || []).filter((n) => n !== eventName);
            if (anim.eventTimes) {
                delete anim.eventTimes[eventName];
            }
            if (this._character && this._character.events) {
                this._character.events = this._character.events.filter((e) => e.name !== eventName);
            }
            delete this._offsetOverrides[eventName];
            if (this._selectedEvent === eventName) {
                this._selectedEvent = '';
                this.stopMountPoll();
                sceneCall('hideMountGizmo');
            }
            this.renderEvents();
            this.renderOffset();
            this.rebuildMarkers();
            this.pushLog(`已删除事件：${eventName}`);
        },

        renderAnims() {
            const box = this.$.animList;
            if (!box) {
                return;
            }
            box.innerHTML = '';
            const anims = (this._character && this._character.anims) || [];
            if (!anims.length) {
                const tip = document.createElement('div');
                tip.className = 'muted';
                tip.textContent = this._info && this._info.clipNames && this._info.clipNames.length
                    ? `无配置，节点 clips: ${this._info.clipNames.join(', ')}`
                    : '无动作配置';
                box.appendChild(tip);
                return;
            }
            anims.forEach((a, i) => {
                const btn = document.createElement('button');
                btn.className = `anim-btn${i === this._animIndex ? ' active' : ''}`;
                const hasSfx = (a.frameEvents || []).some((name) => {
                    const e = (this._character.events || []).find((x) => x.name === name);
                    return e && e.sfx;
                });
                if (hasSfx) {
                    btn.classList.add('has-sfx');
                }
                btn.textContent = hasSfx ? `★ ${a.label}` : a.label;
                btn.addEventListener('click', async () => {
                    this._animIndex = i;
                    this._time = 0;
                    this._clipDuration = 0;
                    this._selectedEvent = '';
                    this._fired.clear();
                    this.stopAutoPlay();
                    this.renderAnims();
                    this.renderEvents();
                    this.renderOffset();
                    // 先按配置估一个时长，立刻采真实 clip 时长锁死时间线
                    if (a.duration > 0) {
                        this.applyClipDuration(a.duration, { quiet: true });
                    } else {
                        this.rebuildMarkers();
                        this.updatePlayhead();
                    }
                    if (a.label === 'idle') {
                        this.pushLog('待机已映射为 attackidle（原 idle 几乎是单帧，看起来像没动）');
                    }
                    await this.ensureClipDuration();
                    await this.seekTo(0, { playNearest: false });
                });
                box.appendChild(btn);
            });
        },

        renderEvents() {
            const box = this.$.eventList;
            if (!box) {
                return;
            }
            box.innerHTML = '';
            const events = this.getEvents();
            if (!events.length) {
                const tip = document.createElement('div');
                tip.className = 'muted';
                tip.textContent = '当前动作无帧事件';
                box.appendChild(tip);
                return;
            }
            for (const ev of events) {
                const row = document.createElement('div');
                row.className = `event-row${ev.name === this._selectedEvent ? ' selected' : ''}`;

                const nameEl = document.createElement('span');
                nameEl.textContent = ev.sfx || ev.name;
                nameEl.title = ev.name;
                nameEl.style.flex = '1';
                nameEl.style.minWidth = '0';
                nameEl.style.overflow = 'hidden';
                nameEl.style.textOverflow = 'ellipsis';
                nameEl.style.whiteSpace = 'nowrap';

                const timeInput = document.createElement('input');
                timeInput.type = 'number';
                timeInput.step = '0.05';
                timeInput.min = '0';
                timeInput.max = String(this.getDuration());
                timeInput.value = String(Math.min(this.getDuration(), Math.max(0, ev.time)));
                timeInput.title = `改时间（0 ~ ${this.getDuration().toFixed(2)}s）`;
                timeInput.style.cssText = 'width:58px;background:#0e1018;color:#fff;border:1px solid #3d4560;border-radius:4px;padding:2px 4px;';
                timeInput.addEventListener('click', (e) => e.stopPropagation());
                timeInput.addEventListener('change', () => {
                    const n = parseFloat(timeInput.value);
                    if (!Number.isNaN(n)) {
                        const t = this.setEventTime(ev.name, n);
                        this._time = t;
                        this.updatePlayhead();
                        timeInput.value = String(t);
                        this.pushLog(`已改时间：${ev.name} → ${t.toFixed(2)}s`);
                    }
                });

                const delBtn = document.createElement('ui-button');
                delBtn.textContent = '删';
                delBtn.title = '删除此点';
                let delLock = false;
                const onDel = (e) => {
                    if (e) {
                        e.stopPropagation();
                    }
                    if (delLock) {
                        return;
                    }
                    delLock = true;
                    this.deleteEvent(ev.name);
                };
                delBtn.addEventListener('confirm', onDel);

                row.appendChild(nameEl);
                row.appendChild(timeInput);
                row.appendChild(delBtn);
                row.addEventListener('click', () => {
                    this.selectEvent(ev.name);
                    this.seekTo(ev.time, { playNearest: false });
                });
                box.appendChild(row);
            }
        },

        renderOffset() {
            const box = this.$.offsetBox;
            if (!box) {
                return;
            }
            box.innerHTML = '';
            const name = this._selectedEvent;
            if (!name) {
                box.innerHTML = '<div class="muted">先点一个带特效的帧事件</div>';
                return;
            }
            const events = this.getEvents();
            const ev = events.find((e) => e.name === name);
            if (!ev) {
                box.innerHTML = '<div class="muted">事件不在当前动作</div>';
                return;
            }
            const title = document.createElement('div');
            title.textContent = ev.attach
                ? `${name} @ ${ev.attach}`
                : `${name} @ 角色根`;
            title.style.cssText = 'color:#ffd978;margin-bottom:6px;';
            box.appendChild(title);

            const attachRow = document.createElement('div');
            attachRow.className = 'row';
            attachRow.style.marginBottom = '6px';
            const attachLab = document.createElement('span');
            attachLab.className = 'label';
            attachLab.style.width = '52px';
            attachLab.textContent = '骨骼';
            attachRow.appendChild(attachLab);
            const attachInput = document.createElement('input');
            attachInput.className = 'sfx-input';
            attachInput.style.flex = '1';
            attachInput.placeholder = 'Bone 名，空=角色根';
            attachInput.value = ev.attach || '';
            attachInput.addEventListener('change', () => {
                this.setAttach(name, String(attachInput.value || '').trim());
            });
            attachRow.appendChild(attachInput);
            box.appendChild(attachRow);

            const btnBone = document.createElement('ui-button');
            btnBone.textContent = '用层级选中节点作挂点';
            btnBone.style.cssText = 'width:100%;margin-bottom:6px;';
            const onBone = () => this.useSelectedAsAttach(name);
            btnBone.addEventListener('confirm', onBone);
            box.appendChild(btnBone);

            const btnFocus = document.createElement('ui-button');
            btnFocus.textContent = '◎ 选中 EffectMount（可拖 / 可挪到骨骼下）';
            btnFocus.style.cssText = 'width:100%;margin-bottom:8px;';
            const onFocus = () => this.showMountForEvent(name);
            btnFocus.addEventListener('confirm', onFocus);
            box.appendChild(btnFocus);

            const o = ev.offset || { x: 0, y: 0, z: 0 };
            for (const axis of ['x', 'y', 'z']) {
                const row = document.createElement('div');
                row.className = 'row';
                const lab = document.createElement('span');
                lab.className = 'label';
                lab.textContent = axis.toUpperCase();
                row.appendChild(lab);

                const minus = document.createElement('ui-button');
                minus.textContent = '−';
                const onMinus = () => this.nudgeOffset(name, axis, -0.1);
                minus.addEventListener('confirm', onMinus);
                minus.addEventListener('click', onMinus);
                row.appendChild(minus);

                const input = document.createElement('input');
                input.type = 'number';
                input.step = '0.1';
                input.value = String(o[axis]);
                input.addEventListener('change', () => {
                    const n = parseFloat(input.value);
                    if (!Number.isNaN(n)) {
                        this.setOffset(name, axis, n);
                    }
                });
                row.appendChild(input);

                const plus = document.createElement('ui-button');
                plus.textContent = '+';
                const onPlus = () => this.nudgeOffset(name, axis, 0.1);
                plus.addEventListener('confirm', onPlus);
                plus.addEventListener('click', onPlus);
                row.appendChild(plus);
                box.appendChild(row);
            }
        },

        selectEvent(name) {
            this._selectedEvent = name;
            this.renderEvents();
            this.renderOffset();
            this.rebuildMarkers();
            this.showMountForEvent(name);
        },

        async showMountForEvent(eventName) {
            if (!this._nodeUuid || !eventName) {
                return;
            }
            const ev = this.getEvents().find((e) => e.name === eventName);
            if (!ev) {
                this.stopMountPoll();
                await sceneCall('hideMountGizmo');
                return;
            }
            const offset = (this._offsetOverrides[eventName])
                || (ev.offset ? { ...ev.offset } : { x: 0, y: 0, z: 0 });
            if (!this._offsetOverrides[eventName]) {
                this._offsetOverrides[eventName] = { ...offset };
            }
            await sceneCall('clearTempSfx');
            const res = await sceneCall('showMountGizmo', {
                nodeUuid: this._nodeUuid,
                attach: ev.attach || '',
                offset,
                eventName,
            });
            if (!res || !res.ok) {
                this.pushLog(`挂点失败: ${(res && res.reason) || 'unknown'}`);
                return;
            }
            if (ev.sfx) {
                await this.previewEventSfx(eventName, { resetTransform: true });
            }
            // 再选一次挂点，保证拖的是它
            await sceneCall('showMountGizmo', {
                nodeUuid: this._nodeUuid,
                attach: ev.attach || '',
                offset: this._offsetOverrides[eventName],
                eventName,
            });
            this.pushLog('已选中 EffectMount，按 W 拖；播放前会记住当前位置');
            this.startMountPoll(eventName);
        },

        /**
         * 在当前时间点添加输入的特效，然后选中 EffectMount 供拖拽
         */
        async addSfxAtCurrentTime() {
            if (this._addingSfx) {
                return;
            }
            if (!this._character || !this._nodeUuid) {
                this.pushLog('请先一键放入角色');
                return;
            }
            const anim = this.getCurrentAnim();
            if (!anim) {
                this.pushLog('请先选择动作');
                return;
            }
            const raw = (this.$.sfxInput && this.$.sfxInput.value) || '';
            const sfx = String(raw).trim();
            if (!sfx) {
                this.pushLog('请输入特效名，例如 SFX_WaterFlower');
                return;
            }

            this._addingSfx = true;
            try {
                const dur = this.getDuration();
                const t = Math.min(dur, Math.max(0, +Number(this._time || 0).toFixed(2)));
                this._time = t;
                let eventName = `${sfx}@${t.toFixed(2)}`;
                const existing = anim.frameEvents || [];
                if (existing.indexOf(eventName) >= 0) {
                    // 同一时间点已有同名：不再自动再插一条，避免误点/双事件重复
                    this._selectedEvent = eventName;
                    this.renderEvents();
                    this.rebuildMarkers();
                    this.pushLog(`该时间已有 ${sfx}，已选中原有点`);
                    await this.showMountForEvent(eventName);
                    return;
                }

                if (!anim.frameEvents) {
                    anim.frameEvents = [];
                }
                if (!anim.eventTimes) {
                    anim.eventTimes = {};
                }
                anim.frameEvents.push(eventName);
                anim.eventTimes[eventName] = t;

                if (!this._character.events) {
                    this._character.events = [];
                }
                let bindEv = this._character.events.find((e) => e.name === eventName);
                if (!bindEv) {
                    bindEv = {
                        name: eventName,
                        sfx,
                        attach: '',
                        offset: { x: 0, y: 0, z: 0 },
                    };
                    this._character.events.push(bindEv);
                } else {
                    bindEv.sfx = sfx;
                }

                if (!this._config) {
                    this._config = loadConfig() || {};
                }
                if (!this._config.sfxUrls) {
                    this._config.sfxUrls = {};
                }
                if (!this._config.sfxUrls[sfx]) {
                    // 优先 res.json（effects/{id}/…），避免写死旧 Prefabs/ 路径
                    let fallback = sfx;
                    try {
                        const resPath = require('path').join(
                            Editor.Project.path,
                            'assets/resources/json/res.json'
                        );
                        const fs = require('fs');
                        if (fs.existsSync(resPath)) {
                            const table = (JSON.parse(fs.readFileSync(resPath, 'utf8')).prefab) || {};
                            for (const k of Object.keys(table)) {
                                if (table[k] && table[k].name === sfx && table[k].url) {
                                    fallback = table[k].url;
                                    break;
                                }
                            }
                        }
                    } catch (_) {
                        /* ignore */
                    }
                    this._config.sfxUrls[sfx] = sfx.indexOf('/') >= 0 ? sfx : fallback;
                    this.pushLog(`未配置 sfxUrl，暂用 ${this._config.sfxUrls[sfx]}`);
                }

                this._offsetOverrides[eventName] = { x: 0, y: 0, z: 0 };
                this._selectedEvent = eventName;
                this._fired = new Set();
                this.renderEvents();
                this.renderOffset();
                this.rebuildMarkers();
                this.updatePlayhead();
                this.pushLog(`已添加：${t.toFixed(2)}s → ${sfx}`);
                await this.showMountForEvent(eventName);
            } finally {
                this._addingSfx = false;
            }
        },

        /**
         * 把当前角色（全部动作的帧事件 + 特效绑定 + 偏移）写入 effect_preview.json
         */
        saveCurrentCharacterConfig() {
            const api = loadConfigModule();
            if (!api || typeof api.saveCharacterConfig !== 'function') {
                this.pushLog('保存失败：config 未更新，请扩展管理器禁用→启用 effect-preview');
                return;
            }
            if (!this._character || !this._character.id) {
                this.pushLog('没有可保存的角色，请先一键准备');
                return;
            }
            // 把当前会话偏移写回 events，再整体落盘
            const sessionUrls = (this._config && this._config.sfxUrls) || {};
            const res = api.saveCharacterConfig(this._character, this._offsetOverrides, sessionUrls);
            if (!res || !res.ok) {
                this.pushLog(`保存失败: ${(res && res.reason) || 'unknown'}`);
                return;
            }
            // 同步会话：偏移已进 events，磁盘与内存对齐
            this._config = api.loadConfig() || this._config;
            const loaded = api.loadCharacterConfig(this._character.id);
            if (loaded && loaded.ok && loaded.character) {
                const keepAnim = this._animIndex;
                const keepTime = this._time;
                const keepSel = this._selectedEvent;
                this._character = loaded.character;
                this._offsetOverrides = {};
                this._animIndex = Math.min(keepAnim, Math.max(0, (this._character.anims || []).length - 1));
                this._time = keepTime;
                this._selectedEvent = keepSel;
                this.renderAnims();
                this.renderEvents();
                this.renderOffset();
                this.rebuildMarkers();
                this.updatePlayhead();
            }
            this.pushLog(
                `已保存「${res.characterId}」：${res.animTotal} 个动作`
                + `（${res.animCount} 个含事件），${res.eventCount} 条特效绑定 → ${res.path}`,
            );
        },

        /**
         * 从 effect_preview.json 读取当前角色全部动作绑定，覆盖会话
         */
        loadCurrentCharacterConfig() {
            const api = loadConfigModule();
            if (!api || typeof api.loadCharacterConfig !== 'function') {
                this.pushLog('读取失败：config 未更新，请扩展管理器禁用→启用 effect-preview');
                return;
            }
            const id = (this._character && this._character.id)
                || this._setupCharId
                || '';
            if (!id) {
                this.pushLog('请先选择 / 准备角色再读取');
                return;
            }
            const res = api.loadCharacterConfig(id);
            if (!res || !res.ok) {
                this.pushLog(`读取失败: ${(res && res.reason) || 'unknown'}（id=${id}）`);
                return;
            }
            this._config = res.config || api.loadConfig();
            this._character = res.character;
            this._offsetOverrides = {};
            this._selectedEvent = '';
            this._fired = new Set();
            this._animIndex = Math.min(this._animIndex || 0, Math.max(0, (this._character.anims || []).length - 1));

            // 自动跳到第一个带特效的动作
            const anims = this._character.anims || [];
            for (let i = 0; i < anims.length; i++) {
                const a = anims[i];
                const has = (a.frameEvents || []).some((name) => {
                    const e = (this._character.events || []).find((x) => x.name === name);
                    return e && e.sfx;
                });
                if (has) {
                    this._animIndex = i;
                    break;
                }
            }

            this.$.charId && (this.$.charId.textContent = this._character.id);
            this.renderAnims();
            this.renderEvents();
            this.renderOffset();
            this.rebuildMarkers();
            this.updatePlayhead();

            let eventTotal = 0;
            let sfxTotal = 0;
            for (const a of anims) {
                eventTotal += (a.frameEvents || []).length;
            }
            for (const e of this._character.events || []) {
                if (e.sfx) {
                    sfxTotal += 1;
                }
            }
            this.pushLog(
                `已读取「${id}」：${anims.length} 个动作，${eventTotal} 个帧点，${sfxTotal} 条特效绑定`,
            );
            if (this._nodeUuid) {
                this.seekTo(this._time || 0, { playNearest: false });
            }
        },

        startMountPoll(eventName) {
            this.stopMountPoll();
            this._mountEvent = eventName;
            this._mountLast = null;
            this._mountTimer = setInterval(() => {
                this.syncMountFromScene(eventName);
            }, 100);
        },

        stopMountPoll() {
            if (this._mountTimer) {
                clearInterval(this._mountTimer);
                this._mountTimer = null;
            }
            this._mountEvent = '';
        },

        async syncMountFromScene(eventName) {
            if (!this._nodeUuid || this._scrubbing || this._playing) {
                return;
            }
            const name = eventName || this._selectedEvent;
            if (!name) {
                return;
            }
            await sceneCall('followMountSfx');
            await this.persistMountFromScene(name, { quiet: true });
        },

        /**
         * 把场景里 EffectMount 的父骨骼 + 本地偏移写回会话（播放/生成特效前必须先刷）
         */
        async persistMountFromScene(eventName, opts) {
            opts = opts || {};
            if (!this._nodeUuid || !eventName) {
                return null;
            }
            const res = await sceneCall('readMountGizmo', {
                nodeUuid: this._nodeUuid,
            });
            if (!res || !res.ok || !res.offset) {
                return null;
            }
            const o = res.offset;
            const attach = typeof res.attach === 'string' ? res.attach : '';
            this.applyAttachToEvent(eventName, attach, { silent: true });
            this._offsetOverrides[eventName] = { x: o.x, y: o.y, z: o.z };

            // 同步进 character.events.offset，避免只靠 overrides
            if (this._character && this._character.events) {
                const bind = this._character.events.find((e) => e.name === eventName);
                if (bind) {
                    bind.offset = { x: o.x, y: o.y, z: o.z };
                    bind.attach = attach;
                }
            }

            const key = `${attach}|${o.x},${o.y},${o.z}`;
            if (this._mountLast !== key) {
                this._mountLast = key;
                if (!opts.quiet) {
                    this.renderOffset();
                    this.pushLog(`已记住挂点 ${attach || '角色根'} (${o.x}, ${o.y}, ${o.z})`);
                } else {
                    // 拖拽中安静刷新数字
                    this.renderOffset();
                }
            }
            return res;
        },

        applyAttachToEvent(eventName, attach, opts) {
            opts = opts || {};
            if (!this._character) {
                return;
            }
            if (!this._character.events) {
                this._character.events = [];
            }
            let bind = this._character.events.find((e) => e.name === eventName);
            if (!bind) {
                bind = {
                    name: eventName,
                    sfx: '',
                    attach: '',
                    offset: { x: 0, y: 0, z: 0 },
                };
                this._character.events.push(bind);
            }
            bind.attach = attach || '';
            if (!opts.silent) {
                this.renderOffset();
            }
        },

        setAttach(eventName, attach) {
            this.applyAttachToEvent(eventName, attach);
            this.pushLog(attach ? `挂点骨骼 → ${attach}` : '挂点 → 角色根');
            this.showMountForEvent(eventName);
        },

        async useSelectedAsAttach(eventName) {
            if (!this._nodeUuid || !eventName) {
                return;
            }
            const res = await sceneCall('getSelectedAttachHint', this._nodeUuid);
            if (!res || !res.ok) {
                this.pushLog(`选挂点失败: ${(res && (res.tip || res.reason)) || '请在层级选中骨骼节点'}`);
                return;
            }
            // 换骨骼时偏移归零，避免相对旧骨骼乱飞
            this._offsetOverrides[eventName] = { x: 0, y: 0, z: 0 };
            this.setAttach(eventName, res.name || '');
        },

        setOffset(eventName, axis, value) {
            if (!this._offsetOverrides[eventName]) {
                const ev = this.getEvents().find((e) => e.name === eventName);
                this._offsetOverrides[eventName] = ev && ev.offset
                    ? { ...ev.offset }
                    : { x: 0, y: 0, z: 0 };
            }
            this._offsetOverrides[eventName][axis] = +Number(value).toFixed(2);
            const bind = this._character && (this._character.events || []).find((e) => e.name === eventName);
            if (bind) {
                bind.offset = { ...this._offsetOverrides[eventName] };
            }
            this.renderOffset();
            this.showMountForEvent(eventName);
            this.previewEventSfx(eventName, { resetTransform: true });
        },

        nudgeOffset(eventName, axis, delta) {
            const ev = this.getEvents().find((e) => e.name === eventName);
            const cur = (this._offsetOverrides[eventName] && this._offsetOverrides[eventName][axis])
                ?? (ev && ev.offset && ev.offset[axis])
                ?? 0;
            this.setOffset(eventName, axis, cur + delta);
        },

        async previewEventSfx(eventName, spawnOpts) {
            spawnOpts = spawnOpts || {};
            if (!this._nodeUuid || !this._config) {
                return;
            }
            // 播放/重刷前先把场景里拖过的位置记下来，避免被旧 offset 盖回
            if (!spawnOpts.resetTransform) {
                await this.persistMountFromScene(eventName, { quiet: true });
            }
            const ev = this.getEvents().find((e) => e.name === eventName);
            if (!ev || !ev.sfx) {
                return;
            }
            const url = this._config.sfxUrls && this._config.sfxUrls[ev.sfx];
            if (!url) {
                this.pushLog(`无 sfxUrl: ${ev.sfx}`);
                return;
            }
            const prefabUuid = await queryPrefabUuid(url);
            if (!prefabUuid) {
                this.pushLog(`找不到预制体: ${url}`);
                return;
            }
            const res = await sceneCall('spawnSfx', {
                nodeUuid: this._nodeUuid,
                prefabUuid,
                attach: ev.attach || '',
                offset: ev.offset || { x: 0, y: 0, z: 0 },
                eventName,
                resetTransform: !!spawnOpts.resetTransform,
            });
            if (res && res.ok) {
                const pc = res.particleCount || 0;
                this.pushLog(
                    `特效 ${ev.sfx} @ (${res.pos.x.toFixed(1)}, ${res.pos.y.toFixed(1)}, ${res.pos.z.toFixed(1)}) 粒子×${pc}`
                    + (pc ? '' : '（未点到 ParticleSystem，检查预制体）'),
                );
            } else {
                this.pushLog(`特效失败: ${(res && res.reason) || 'unknown'}`);
            }
        },

        async seekTo(time, opts) {
            opts = opts || {};
            const dur = this.getDuration();
            const t = Math.min(dur, Math.max(0, time));
            const from = this._time;
            this._time = t;
            this.updatePlayhead();

            const anim = this.getCurrentAnim();
            if (this._nodeUuid && anim) {
                // 拖拽中：只保留最新一次 seek，避免 IPC 堆积导致粘滞
                const token = (this._seekToken = (this._seekToken || 0) + 1);
                const res = await sceneCall('seekPose', {
                    nodeUuid: this._nodeUuid,
                    clipName: anim.clip || '',
                    clipUuid: anim.clipUuid || '',
                    time: t,
                    useControllerScrub: true,
                });
                if (opts.poseOnly && token !== this._seekToken) {
                    return;
                }
                if (res && !res.ok) {
                    if (!this._seekWarned) {
                        let tip = `seek失败: ${res.reason}`;
                        if (res.reason === 'clip-load-failed') {
                            tip = `clip加载失败: ${res.clipUuid}`;
                        } else if (res.reason === 'no-state') {
                            tip = `找不到动画状态「${res.stateName || res.clipName}」，clips=[${(res.clipNames || []).join(',')}] host=${res.host || '?'}`;
                        } else if (res.reason === 'no-clipUuid') {
                            tip = `动作无 clipUuid，不能 scrub`;
                        }
                        this.pushLog(tip);
                        this._seekWarned = true;
                    }
                } else if (res && res.ok) {
                    this._seekWarned = false;
                    if (res.duration > 0) {
                        const cur = this._clipDuration || 0;
                        if (Math.abs(cur - res.duration) > 0.02) {
                            this.applyClipDuration(res.duration, { quiet: cur > 0 });
                        } else if (!(this._clipDuration > 0)) {
                            this.applyClipDuration(res.duration, { quiet: true });
                        }
                    }
                }
            } else if (!this._nodeUuid && !this._seekWarned) {
                this.pushLog('还没绑定角色：先点「一键放入场景并绑定」');
                this._seekWarned = true;
            }

            if (opts.poseOnly) {
                return;
            }
            if (opts.playCrossedFrom !== undefined) {
                await this.fireCrossed(opts.playCrossedFrom, t);
            }
            if (opts.playNearest) {
                await this.fireNearest(t);
            }
        },

        async fireCrossed(from, to, opts) {
            opts = opts || {};
            if (from === to) {
                return;
            }
            const lo = Math.min(from, to);
            const hi = Math.max(from, to);
            for (const ev of this.getEvents()) {
                if (!ev.sfx) {
                    continue;
                }
                if (ev.time > lo && ev.time <= hi) {
                    if (!opts.allowRepeat && this._fired.has(ev.name)) {
                        continue;
                    }
                    if (!opts.allowRepeat) {
                        this._fired.add(ev.name);
                    }
                    this._selectedEvent = ev.name;
                    // 拖拽时不 await，避免卡住指针
                    const p = this.previewEventSfx(ev.name);
                    if (!opts.noAwait) {
                        await p;
                    }
                }
            }
            this.renderEvents();
            this.rebuildMarkers();
            this.renderOffset();
        },

        async fireNearest(time) {
            const withSfx = this.getEvents().filter((e) => e.sfx);
            if (!withSfx.length) {
                return;
            }
            let best = withSfx[0];
            let bestDist = Math.abs(best.time - time);
            for (const ev of withSfx) {
                const d = Math.abs(ev.time - time);
                if (d < bestDist) {
                    best = ev;
                    bestDist = d;
                }
            }
            const snap = Math.max(0.15, this.getDuration() * 0.08);
            if (bestDist > snap) {
                return;
            }
            this.selectEvent(best.name);
            if (!this._fired.has(best.name)) {
                this._fired.add(best.name);
                await this.previewEventSfx(best.name);
            }
        },

        timeFromClientX(clientX) {
            const rect = this.$.timeline.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
            return ratio * this.getDuration();
        },

        /** 立刻更新指针 UI；姿势采样节流；越过事件点立刻播特效 */
        scrubVisual(time, fromTime) {
            const dur = this.getDuration();
            const t = Math.min(dur, Math.max(0, time));
            if (fromTime !== undefined && fromTime !== t) {
                this.fireCrossed(fromTime, t, { allowRepeat: true, noAwait: true });
            }
            this._time = t;
            this.updatePlayhead();
            this._scrubPendingTime = t;
            if (this._scrubRaf) {
                return;
            }
            this._scrubRaf = requestAnimationFrame(() => {
                this._scrubRaf = 0;
                const target = this._scrubPendingTime;
                if (target === undefined) {
                    return;
                }
                this.seekTo(target, { poseOnly: true });
            });
        },

        endTimelineScrub(clientX, opts) {
            opts = opts || {};
            if (!this._scrubbing) {
                return;
            }
            this._scrubbing = false;
            const win = typeof window !== 'undefined' ? window : document;
            if (this._scrubMoveFn) {
                win.removeEventListener('pointermove', this._scrubMoveFn, true);
                win.removeEventListener('mousemove', this._scrubMoveFn, true);
                this._scrubMoveFn = null;
            }
            if (this._scrubUpFn) {
                win.removeEventListener('pointerup', this._scrubUpFn, true);
                win.removeEventListener('pointercancel', this._scrubUpFn, true);
                win.removeEventListener('mouseup', this._scrubUpFn, true);
                win.removeEventListener('blur', this._scrubUpFn, true);
                this._scrubUpFn = null;
            }
            if (this._scrubRaf) {
                cancelAnimationFrame(this._scrubRaf);
                this._scrubRaf = 0;
            }
            const t = clientX != null ? this.timeFromClientX(clientX) : this._time;
            this._scrubLast = t;
            this._time = t;
            this.updatePlayhead();
            if (!opts.silent) {
                const moved = Math.abs(t - (this._scrubStartTime || t)) > 0.03;
                // 有拖过：特效已在越过标记时播过；纯点击才就近触发
                this.seekTo(t, { playNearest: !moved });
                this.pushLog(`时间线定位 ${t.toFixed(2)}s`);
            }
        },

        bindTimeline() {
            const el = this.$.timeline;
            if (!el || this._timelineBound) {
                return;
            }
            this._timelineBound = true;
            const win = typeof window !== 'undefined' ? window : document;

            // 只绑 pointerdown，避免再绑 mousedown 导致松手卸不干净、一直跟着鼠标
            el.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                this.stopAutoPlay();
                this.endTimelineScrub(null, { silent: true }); // 清掉残留监听
                this._scrubbing = true;
                this._fired = new Set();
                this._seekWarned = false;
                // 拖拽时去掉粒子星形图标：强制关掉角色自带粒子
                sceneCall('setEffectMarkersVisible', {
                    nodeUuid: this._nodeUuid,
                    visible: false,
                }).then((r) => {
                    if (r && r.count) {
                        this.pushLog(`已关粒子ICON ×${r.count} [${(r.names || []).join(',')}]`);
                    }
                });
                const t = this.timeFromClientX(e.clientX);
                this._scrubStartTime = t;
                this._scrubLast = t;
                this.scrubVisual(t);

                this._scrubMoveFn = (ev) => {
                    if (!this._scrubbing) {
                        return;
                    }
                    // 没有按键时强制结束（防止漏掉 up）
                    if (ev.buttons !== undefined && (ev.buttons & 1) === 0) {
                        this.endTimelineScrub(ev.clientX);
                        return;
                    }
                    const nt = this.timeFromClientX(ev.clientX);
                    const from = this._scrubLast;
                    if (Math.abs(nt - from) < 0.005) {
                        return;
                    }
                    this.scrubVisual(nt, from);
                    this._scrubLast = nt;
                };
                this._scrubUpFn = (ev) => {
                    const x = ev && ev.clientX != null ? ev.clientX : null;
                    this.endTimelineScrub(x);
                };

                win.addEventListener('pointermove', this._scrubMoveFn, true);
                win.addEventListener('pointerup', this._scrubUpFn, true);
                win.addEventListener('pointercancel', this._scrubUpFn, true);
                win.addEventListener('mouseup', this._scrubUpFn, true);
                win.addEventListener('blur', this._scrubUpFn, true);
            });
        },

        stopAutoPlay() {
            this._playing = false;
            if (this._playTimer) {
                clearTimeout(this._playTimer);
                clearInterval(this._playTimer);
                this._playTimer = null;
            }
        },

        async startAutoPlay() {
            this.stopAutoPlay();
            this._fired = new Set();
            this._seekWarned = false;
            const anim = this.getCurrentAnim();
            if (!this._nodeUuid || !anim) {
                this.pushLog('请先一键放入角色并选择动作');
                return;
            }
            if (!anim.clipUuid) {
                this.pushLog(`动作「${anim.label}」没有 clipUuid，无法在编辑器播姿势`);
                return;
            }

            // 播放前把当前拖好的挂点写回，避免生成特效时用旧 offset 弹回
            if (this._selectedEvent) {
                await this.persistMountFromScene(this._selectedEvent, { quiet: true });
            } else {
                for (const ev of this.getEvents()) {
                    if (ev.sfx) {
                        await this.persistMountFromScene(ev.name, { quiet: true });
                        break;
                    }
                }
            }

            this._time = 0;
            this.updatePlayhead();
            this.pushLog(`预览播放「${anim.label}」(clip=${anim.clip || ''})`);

            const first = await sceneCall('seekPose', {
                nodeUuid: this._nodeUuid,
                clipName: anim.clip || '',
                clipUuid: anim.clipUuid || '',
                time: 0.05,
            });
            if (!first || !first.ok) {
                this.pushLog(`无法采样姿势: ${(first && first.reason) || 'unknown'}`);
                if (first && first.diag) {
                    this.pushLog(`诊断 host=${first.diag.host} skins=${(first.diag.skins || []).join('|')}`);
                }
                return;
            }

            // 以 clip 真实时长为准（配置 duration 可能不准）
            this.applyClipDuration(Math.max(0.05, first.duration || this.getDuration()));
            this.pushLog(`采样OK mode=${first.mode} 时长=${this._clipDuration.toFixed(2)}s clip=${first.loadedClip || first.clipName}`);
            if (this._clipDuration < 0.15) {
                this.pushLog('提示：该 clip 几乎是单帧，看起来会像没动；请换 shoot / show·appear');
            }

            this._playing = true;
            const step = 1 / 20;
            const dur = this._clipDuration;
            let lastLog = 0;

            // 串行推进，避免 setInterval+async 重叠导致中途停住
            const run = async () => {
                while (this._playing) {
                    const from = this._time;
                    let next = from + step;
                    if (next >= dur) {
                        await this.seekTo(dur, { playCrossedFrom: from });
                        this.stopAutoPlay();
                        this.pushLog('播放结束');
                        break;
                    }
                    await this.seekTo(next, { playCrossedFrom: from });
                    if (next - lastLog >= 1) {
                        lastLog = next;
                        this.pushLog(`播放中… ${next.toFixed(1)} / ${dur.toFixed(1)} s`);
                    }
                    await new Promise((r) => {
                        this._playTimer = setTimeout(r, step * 1000);
                    });
                }
            };
            run().catch((e) => {
                this.pushLog(`播放异常: ${e && e.message ? e.message : e}`);
                this.stopAutoPlay();
            });
        },

        async refreshSelection() {
            if (this._ignoreSelRefresh) {
                return;
            }
            this._config = loadConfig();
            this._seekWarned = false;
            const info = await sceneCall('getSelectionInfo');
            this._info = info;
            if (!info || !info.ok) {
                // 已有绑定则保留动作列表（拖拽/清特效时会改选，不能清空）
                if (this._nodeUuid && this._character) {
                    return;
                }
                this.$.nodeName.textContent = '（未选中节点）';
                this.$.charId.textContent = '未匹配';
                this._nodeUuid = '';
                this._character = null;
                this.renderAnims();
                this.renderEvents();
                this.renderOffset();
                this.rebuildMarkers();
                this.updatePlayhead();
                this.pushLog('请在层级里选中角色根节点，或点一键准备');
                return;
            }

            // 同一角色重复刷新时保留当前动作选择
            const sameNode = this._nodeUuid === info.uuid;
            const prevAnimIndex = this._animIndex;

            const matched = matchCharacter(this._config, info.name);
            // 已绑定角色时：选中挂点/临时特效/同角色 → 绝不冲掉会话内添加的点
            const keepSession = !!(this._character && this._nodeUuid && (
                (matched && this._character.id === matched.id)
                || sameNode
                || (info.selectedName && (
                    info.selectedName === 'EffectMount'
                    || info.selectedName.indexOf('__EffectPreview') === 0
                    || info.selectedName.indexOf('SFX_') === 0
                ))
            ));

            if (keepSession) {
                // 保留会话内增删改的帧事件，不要被 loadConfig / 挂点选中冲掉
                if (matched && this._character.id === matched.id) {
                    // uuid 可能因重新 setup 变化，跟新节点
                    this._nodeUuid = info.uuid;
                }
                this.$.nodeName.textContent = this._character.id || info.name;
                this.$.charId.textContent = this._character.id;
            } else if (matched) {
                this._nodeUuid = info.uuid;
                this.$.nodeName.textContent = info.name;
                this._character = matched;
                this.$.charId.textContent = this._character.id;
                if (!sameNode) {
                    this.pushLog(`匹配配置: ${this._character.id}`);
                }
            } else {
                this._nodeUuid = info.uuid;
                this.$.nodeName.textContent = info.name;
                this.$.charId.textContent = '未匹配 effect_preview.json';
                if (!sameNode) {
                    this.pushLog(`节点 ${info.name} 未匹配配置；可 scrub 节点自带 clips`);
                }
                this._character = {
                    id: info.name,
                    animMode: info.hasController ? 'controller' : 'clips',
                    anims: (info.clipNames || []).map((n) => ({
                        label: n,
                        clip: n,
                        duration: 2,
                    })),
                    events: [],
                };
            }
            if (!sameNode && !keepSession) {
                this._animIndex = 0;
                this._time = 0;
                this._selectedEvent = '';
                this._offsetOverrides = {};
                this._fired = new Set();
                this._clipDuration = 0;
            } else {
                this._animIndex = Math.min(prevAnimIndex, Math.max(0, (this._character.anims || []).length - 1));
            }
            this.renderAnims();
            this.renderEvents();
            this.renderOffset();
            this.rebuildMarkers();
            this.updatePlayhead();
            if (!sameNode && !keepSession) {
                await this.seekTo(0, { playNearest: false });
            }
        },

        renderCharPick() {
            const box = this.$.charPick;
            if (!box) {
                return;
            }
            box.innerHTML = '';
            this._config = this._config || loadConfig();
            const list = (this._config && this._config.characters) || [];
            if (!this._setupCharId && list.length) {
                // 默认 Enemy04（特效最多）
                const prefer = list.find((c) => c.id === 'Enemy04') || list[0];
                this._setupCharId = prefer.id;
            }
            for (const ch of list) {
                const btn = document.createElement('button');
                btn.className = `anim-btn char-pick${ch.id === this._setupCharId ? ' active' : ''}`;
                const hasSfx = (ch.events || []).some((e) => e.sfx);
                btn.textContent = hasSfx ? `★ ${ch.id}` : ch.id;
                btn.addEventListener('click', () => {
                    this._setupCharId = ch.id;
                    this.renderCharPick();
                });
                box.appendChild(btn);
            }
        },

        /**
         * 直接绑定指定节点（不依赖层级选中）
         */
        async bindToNodeUuid(uuid, preferredCharId) {
            const info = await sceneCall('getSelectionInfo', uuid);
            this._info = info;
            if (!info || !info.ok) {
                this.pushLog('绑定失败：找不到节点');
                return false;
            }
            this._nodeUuid = info.uuid;
            this.$.nodeName.textContent = info.name;
            this._config = loadConfig();
            this._character = matchCharacter(this._config, preferredCharId || info.name)
                || matchCharacter(this._config, info.name);
            if (!this._character && preferredCharId && this._config) {
                this._character = (this._config.characters || []).find((c) => c.id === preferredCharId) || null;
            }
            if (this._character) {
                this.$.charId.textContent = this._character.id;
            } else {
                this.$.charId.textContent = '未匹配';
                this._character = {
                    id: info.name,
                    animMode: info.hasController ? 'controller' : 'clips',
                    anims: (info.clipNames || []).map((n) => ({ label: n, clip: n, duration: 2 })),
                    events: [],
                };
            }

            // 自动选第一个带特效的动作
            let animIndex = 0;
            const anims = this._character.anims || [];
            for (let i = 0; i < anims.length; i++) {
                const a = anims[i];
                const has = (a.frameEvents || []).some((name) => {
                    const e = (this._character.events || []).find((x) => x.name === name);
                    return e && e.sfx;
                });
                if (has) {
                    animIndex = i;
                    break;
                }
            }
            this._animIndex = animIndex;
            this._time = 0;
            this._clipDuration = 0;
            this._selectedEvent = '';
            this._offsetOverrides = {};
            this._fired = new Set();
            this._seekWarned = false;
            this.renderAnims();
            this.renderEvents();
            this.renderOffset();
            this.rebuildMarkers();
            this.updatePlayhead();
            await this.ensureClipDuration();
            await this.seekTo(0, { playNearest: false });
            return true;
        },

        /**
         * 打开专用预览场景；失败则新建空场景
         */
        async ensurePreviewScene() {
            const SCENE_URL = 'db://assets/Scene/EffectPreview.scene';
            const SCENE_UUID = '88a65ab5-1ae6-4394-9bb6-55aa15094d67';

            let uuid = null;
            try {
                uuid = await Editor.Message.request('asset-db', 'query-uuid', SCENE_URL);
            } catch (_) {
                // ignore
            }
            if (!uuid) {
                uuid = SCENE_UUID;
            }

            this.pushLog('正在切换到 EffectPreview 场景…');

            await new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) {
                        return;
                    }
                    done = true;
                    try {
                        Editor.Message.removeBroadcastListener('scene:ready', onReady);
                    } catch (_) {
                        // ignore
                    }
                    resolve();
                };
                const onReady = () => finish();
                try {
                    Editor.Message.addBroadcastListener('scene:ready', onReady);
                } catch (_) {
                    // ignore
                }
                // 兜底超时，避免一直卡住
                setTimeout(finish, 4000);

                const tryOpen = async () => {
                    const attempts = [
                        () => Editor.Message.request('scene', 'open-scene', uuid),
                        () => Editor.Message.request('scene', 'open-scene', SCENE_URL),
                        () => Editor.Message.request('asset-db', 'open-asset', SCENE_URL),
                        () => Editor.Message.request('asset-db', 'open-asset', uuid),
                    ];
                    for (const fn of attempts) {
                        try {
                            await fn();
                            return true;
                        } catch (e) {
                            // try next
                        }
                    }
                    // 最后手段：新建空场景
                    try {
                        await Editor.Message.request('scene', 'new-scene');
                        this.pushLog('未找到 EffectPreview，已新建空场景');
                        return true;
                    } catch (e) {
                        this.pushLog(`打开场景失败: ${e && e.message ? e.message : e}`);
                        return false;
                    }
                };
                tryOpen().then(() => {
                    // open-scene 有时不发 ready，稍等再结束
                    setTimeout(finish, 500);
                });
            });

            // 等场景脚本挂上
            await new Promise((r) => setTimeout(r, 400));
        },

        async oneClickSetup() {
            this.stopAutoPlay();
            this._config = loadConfig();
            if (!this._config) {
                this.pushLog('读不到 effect_preview.json');
                return;
            }
            const char = (this._config.characters || []).find((c) => c.id === this._setupCharId)
                || this._config.characters[0];
            if (!char || !char.prefabUrl) {
                this.pushLog('没有可选角色');
                return;
            }

            this.pushLog(`一键准备：${char.id} …`);
            this.$.btnSetup && (this.$.btnSetup.setAttribute('disabled', ''));

            try {
                // 1) 先切到专用预览场景
                await this.ensurePreviewScene();

                // 2) 再放角色
                await sceneCall('clearTempSfx');
                const prefabUuid = await queryPrefabUuid(char.prefabUrl);
                if (!prefabUuid) {
                    this.pushLog(`找不到预制体: ${char.prefabUrl}`);
                    return;
                }

                const clipUuids = (char.anims || []).map((a) => a.clipUuid).filter(Boolean);
                const res = await sceneCall('setupPreview', {
                    prefabUuid,
                    characterId: char.id,
                    clipUuids,
                });
                if (!res || !res.ok) {
                    this.pushLog(`准备失败: ${(res && res.reason) || 'unknown'}`);
                    return;
                }

                if (res.poseTest) {
                    if (res.poseTest.ok) {
                        this.pushLog(`[v2] 姿势OK mode=${res.poseTest.mode} clip=${res.poseTest.clipName} tracks=${res.poseTest.tracks}`);
                    } else {
                        this.pushLog(`[v2] 姿势失败: ${res.poseTest.reason}`);
                    }
                }
                if (res.preloadClips && res.preloadClips.length) {
                    this.pushLog(`已预载 clips: ${res.preloadClips.join(', ')}`);
                }
                if (res.diag) {
                    this.pushLog(`诊断 host=${res.diag.host} skins=${(res.diag.skins || []).join('|') || '无'} scrub=${res.diag.hasScrubAnim}`);
                }

                const hideRes = await sceneCall('setEffectMarkersVisible', {
                    nodeUuid: res.uuid,
                    visible: false,
                });
                try {
                    // 不要选中角色：选中带粒子的节点会强制画出白色星形组件图标
                    const stageSel = await sceneCall('preferCleanView');
                    if (!stageSel || !stageSel.ok) {
                        Editor.Selection.select('node', [res.uuid]);
                    }
                } catch (_) {
                    // ignore
                }
                if (hideRes && hideRes.count) {
                    this.pushLog(`已关粒子ICON ×${hideRes.count} [${(hideRes.names || []).join(',')}]`);
                } else {
                    this.pushLog('警告：未找到可关闭的粒子节点，ICON 可能仍在');
                }

                this.pushLog('完成！请再拖时间线/预览播放验证姿势；若仍不动，再点一次一键准备');
                const ok = await this.bindToNodeUuid(res.uuid, char.id);
                if (ok) {
                    const anim = this.getCurrentAnim();
                    this.pushLog(`已绑定 ${char.id}，动作「${anim ? anim.label : '—'}」`);
                }
            } catch (e) {
                console.error(e);
                this.pushLog(`准备异常: ${e && e.message ? e.message : e}`);
            } finally {
                if (this.$.btnSetup) {
                    this.$.btnSetup.removeAttribute('disabled');
                }
            }
        },
    },

    ready() {
        this._logs = [];
        this._config = null;
        this._character = null;
        this._info = null;
        this._nodeUuid = '';
        this._animIndex = 0;
        this._time = 0;
        this._selectedEvent = '';
        this._offsetOverrides = {};
        this._fired = new Set();
        this._scrubbing = false;
        this._scrubLast = 0;
        this._scrubRaf = 0;
        this._scrubMoveFn = null;
        this._scrubUpFn = null;
        this._seekToken = 0;
        this._playTimer = null;
        this._playing = false;
        this._clipDuration = 0;
        this._timelineBound = false;
        this._seekWarned = false;
        this._setupCharId = 'Enemy04';
        this._mountTimer = null;
        this._mountEvent = '';
        this._mountLast = null;
        this._mountPreviewPending = false;
        this._ignoreSelRefresh = false;
        this._addingSfx = false;

        this.renderCharPick();

        const bind = (el, fn) => {
            if (!el) {
                return;
            }
            // ui-button 会同时冒泡 confirm + click，只听 confirm，避免点一次执行两次
            let lock = false;
            const wrap = (...args) => {
                if (lock) {
                    return;
                }
                lock = true;
                Promise.resolve(fn(...args)).finally(() => {
                    setTimeout(() => {
                        lock = false;
                    }, 80);
                });
            };
            el.addEventListener('confirm', wrap);
        };

        bind(this.$.btnSetup, () => this.oneClickSetup());
        bind(this.$.btnRefresh, () => this.refreshSelection());
        bind(this.$.btnAddSfx, () => this.addSfxAtCurrentTime());
        if (this.$.sfxInput) {
            this.$.sfxInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addSfxAtCurrentTime();
                }
            });
        }
        bind(this.$.btnPlay, () => {
            this.pushLog('预览播放');
            this.startAutoPlay();
        });
        bind(this.$.btnStop, () => {
            this.stopAutoPlay();
            this.pushLog('停止');
        });
        bind(this.$.btnClear, async () => {
            // 只清场景里的临时 SFX，不动时间轴点 / 帧事件
            this._ignoreSelRefresh = true;
            try {
                this.stopMountPoll();
                await sceneCall('clearTempSfx');
                await sceneCall('preferCleanView');
                this.pushLog('已清除临时特效（时间轴点保留）');
            } finally {
                setTimeout(() => {
                    this._ignoreSelRefresh = false;
                }, 300);
            }
        });
        bind(this.$.btnSaveCfg, () => this.saveCurrentCharacterConfig());
        bind(this.$.btnLoadCfg, () => this.loadCurrentCharacterConfig());

        this.bindTimeline();
        this.refreshSelection();

        // 检测场景脚本；失败则自动尝试 soft-reload 一次
        const ensureScene = async () => {
            try {
                const r = await sceneCall('ping');
                if (r && r.ok) {
                    this.pushLog(`场景脚本 OK (v${r.version || '?'}${r.hasImpl === false ? ', 无impl' : ''})`);
                    return true;
                }
            } catch (_) {
                // fallthrough
            }
            this.pushLog('场景脚本未注册，正在尝试重载场景…');
            try {
                await Editor.Message.request('effect-preview', 'reload-scene-script');
            } catch (_) {
                try {
                    await Editor.Message.request('scene', 'soft-reload');
                } catch (__) {
                    // ignore
                }
            }
            await new Promise((r) => setTimeout(r, 1200));
            try {
                const r2 = await sceneCall('ping');
                if (r2 && r2.ok) {
                    this.pushLog(`场景脚本已恢复 (v${r2.version || '?'})`);
                    return true;
                }
            } catch (_) {
                // ignore
            }
            this.pushLog('仍失败！请：扩展管理器禁用→启用 effect-preview，或完全关闭 Creator 再开工程');
            return false;
        };
        ensureScene();

        // 选中变化时刷新（一键准备期间也会触发，无妨）
        this._selHandler = () => {
            // 若刚一键准备过，refresh 用选中节点即可
            this.refreshSelection();
        };
        if (typeof Editor.Message.addBroadcastListener === 'function') {
            Editor.Message.addBroadcastListener('selection:select', this._selHandler);
            Editor.Message.addBroadcastListener('selection:selected', this._selHandler);
        }
    },

    close() {
        this.stopMountPoll();
        this.endTimelineScrub(null, { silent: true });
        this.stopAutoPlay();
        sceneCall('hideMountGizmo');
        if (this._selHandler && typeof Editor.Message.removeBroadcastListener === 'function') {
            Editor.Message.removeBroadcastListener('selection:select', this._selHandler);
            Editor.Message.removeBroadcastListener('selection:selected', this._selHandler);
        }
    },
});
