'use strict';

/**
 * 资源场景阻挡种植：鼠标跟手笔刷。
 * 左键拖涂 / 右键转视角 / Shift 可切擦除。
 */

function nums(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

module.exports = Editor.Panel.define({
  listeners: {},
  template: `
    <div class="wrap">
      <div class="head">
        <div>
          <div class="title">阻挡种植 · 鼠标笔刷</div>
          <div id="meta" class="meta">加载中…</div>
        </div>
        <div class="head-actions">
          <ui-button id="btn-save" class="green">保存</ui-button>
          <ui-button id="btn-close">关闭</ui-button>
        </div>
      </div>

      <div class="big-actions">
        <ui-button id="btn-brush" class="huge">开启鼠标笔刷</ui-button>
      </div>

      <div class="toolbar">
        <label class="lab">半径 <input id="brush" class="num" type="number" min="1" step="1" value="1" title="1=1×1 2=2×2 3=3×3" /></label>
        <label class="lab">格子 <input id="cell-size" class="num" type="number" min="0.1" step="0.1" value="0.5" title="越小越贴合模型" /></label>
        <label class="lab mode">
          <select id="mode">
            <option value="paint">涂抹</option>
            <option value="erase">擦除</option>
          </select>
        </label>
        <ui-button id="btn-clear">清空</ui-button>
      </div>

      <div class="hint">
        打开后会自动显示已有<strong>红色阻挡</strong>；再点「开启鼠标笔刷」用青黄指示器涂抹。<br/>
        「格子」控制对齐精度（默认 0.5）。左键拖涂 · 右/中键转视角 · 擦除切模式 · 保存。
      </div>
      <div id="stats" class="stats">格子 0 · AABB 0</div>
    </div>
  `,
  style: `
    .wrap { padding: 12px; display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box; }
    .head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .title { font-weight: 700; font-size: 15px; }
    .meta { opacity: 0.75; font-size: 12px; margin-top: 4px; line-height: 1.4; white-space: pre-line; }
    .head-actions, .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .big-actions { display: flex; }
    ui-button.huge {
      flex: 1; height: 40px; font-size: 14px; font-weight: 700;
      outline: 1px solid #e08040;
    }
    ui-button.huge.on { outline: 2px solid #4c8; background: #243528; }
    .hint {
      opacity: 0.85; font-size: 12px; line-height: 1.55;
      padding: 10px; background: #1a1a1a; border-radius: 4px;
    }
    .stats { font-size: 13px; color: #c9a86a; font-weight: 600; }
    .lab { font-size: 12px; display: flex; align-items: center; gap: 4px; opacity: 0.85; }
    input.num {
      width: 64px; height: 26px; padding: 0 6px; border: 1px solid #555; border-radius: 3px;
      background: #2a2a2a; color: #ddd; outline: none; box-sizing: border-box;
    }
    select {
      height: 26px; padding: 0 6px; border: 1px solid #555; border-radius: 3px;
      background: #2a2a2a; color: #ddd;
    }
  `,
  $: {
    meta: '#meta',
    stats: '#stats',
    cellSize: '#cell-size',
    brush: '#brush',
    mode: '#mode',
    btnBrush: '#btn-brush',
    btnSave: '#btn-save',
    btnClose: '#btn-close',
    btnClear: '#btn-clear',
  },
  ready(this: {
    $: Record<string, HTMLElement | undefined>;
    _bound?: boolean;
    _reload?: () => void;
    _poll?: ReturnType<typeof setInterval> | null;
  }) {
    const metaEl = this.$.meta as HTMLElement;
    const statsEl = this.$.stats as HTMLElement;
    const cellSizeEl = this.$.cellSize as HTMLInputElement;
    const brushEl = this.$.brush as HTMLInputElement;
    const modeEl = this.$.mode as HTMLSelectElement;
    const btnBrush = this.$.btnBrush as HTMLElement;

    if (this._bound) {
      this._reload?.();
      return;
    }
    this._bound = true;
    this._poll = null;

    let sceneId = 0;
    let sceneName = '';
    let cellSize = 1;
    let originX = 0;
    let originZ = 0;
    let cells = new Set<string>();
    let aabbCount = 0;
    let brushOn = false;

    const brushRadius = () => Math.max(1, Math.floor(nums(brushEl.value, 1)));

    const refreshStats = (extra = '') => {
      statsEl.textContent =
        `格子 ${cells.size}` +
        (aabbCount ? ` · AABB ${aabbCount}` : '') +
        (brushOn ? ' · 笔刷开启中' : '') +
        (extra ? ` · ${extra}` : '');
    };

    const updateMeta = () => {
      metaEl.textContent =
        `资源 ${sceneId}「${sceneName}」\n` +
        `保存 → scenes/${sceneId}/index.json · blockPlant.aabbs`;
    };

    const stopPoll = () => {
      if (this._poll) {
        clearInterval(this._poll);
        this._poll = null;
      }
    };

    const pullBrushState = async () => {
      try {
        const st = (await Editor.Message.request(
          'scene-editor',
          'query-mouse-brush-state'
        )) as {
          ok?: boolean;
          active?: boolean;
          cells?: string[];
          cellCount?: number;
        } | null;
        if (!st?.ok) return;
        if (Array.isArray(st.cells)) {
          cells = new Set(st.cells);
          aabbCount = 0;
        }
        brushOn = !!st.active;
        btnBrush.textContent = brushOn ? '关闭鼠标笔刷' : '开启鼠标笔刷';
        btnBrush.classList.toggle('on', brushOn);
        refreshStats();
      } catch {
        /* ignore */
      }
    };

    const stopBrush = async () => {
      stopPoll();
      try {
        const r = (await Editor.Message.request(
          'scene-editor',
          'stop-mouse-brush'
        )) as { cells?: string[] } | null;
        if (Array.isArray(r?.cells)) cells = new Set(r.cells);
      } catch {
        /* ignore */
      }
      brushOn = false;
      btnBrush.textContent = '开启鼠标笔刷';
      btnBrush.classList.remove('on');
      refreshStats();
    };

    const startBrush = async () => {
      cellSize = Math.max(0.25, nums(cellSizeEl.value, 1));
      try {
        // 打开 Prefab 并开笔刷
        const r = (await Editor.Message.request('scene-editor', 'start-mouse-brush', {
          sceneId,
          cells: [...cells],
          cellSize,
          originX,
          originZ,
          brushRadius: brushRadius(),
          erase: modeEl.value === 'erase',
          openPrefab: true,
        })) as { ok?: boolean; reason?: string; cellCount?: number } | null;
        if (!r?.ok) {
          await Editor.Dialog.warn(r?.reason || '无法开启笔刷', {
            title: '阻挡种植',
            buttons: ['确定'],
            default: 0,
          });
          return;
        }
        brushOn = true;
        btnBrush.textContent = '关闭鼠标笔刷';
        btnBrush.classList.add('on');
        refreshStats('把鼠标移到场景视图');
        stopPoll();
        this._poll = setInterval(() => {
          void pullBrushState();
        }, 250);
      } catch (e) {
        await Editor.Dialog.warn(String(e), { title: '阻挡种植', buttons: ['确定'], default: 0 });
      }
    };

    const syncConfig = async () => {
      if (!brushOn) return;
      cellSize = Math.max(0.25, nums(cellSizeEl.value, 1));
      try {
        await Editor.Message.request('scene-editor', 'configure-mouse-brush', {
          erase: modeEl.value === 'erase',
          brushRadius: brushRadius(),
          cellSize,
        });
      } catch {
        /* ignore */
      }
    };

    const showExistingBlocks = async () => {
      if (!sceneId) return;
      try {
        const r = (await Editor.Message.request('scene-editor', 'preview-blocks-in-scene', {
          sceneId,
          cells: [...cells],
          cellSize,
          originX,
          originZ,
          brushRadius: brushRadius(),
          openPrefab: true,
        })) as { ok?: boolean; reason?: string; count?: number } | null;
        if (r?.ok) {
          refreshStats(cells.size ? `已显示 ${r.count ?? cells.size} 格` : '暂无阻挡');
        } else if (r?.reason) {
          refreshStats(r.reason);
        }
      } catch {
        /* ignore */
      }
    };

    const load = async () => {
      await stopBrush();
      try {
        const ctx = (await Editor.Message.request(
          'scene-editor',
          'query-block-plant-context'
        )) as {
          error?: string;
          sceneId?: number;
          name?: string;
          cellSize?: number;
          originX?: number;
          originZ?: number;
          cells?: string[];
          aabbCount?: number;
        };
        if (ctx?.error) {
          metaEl.textContent = ctx.error;
          return;
        }
        sceneId = ctx.sceneId || 0;
        sceneName = ctx.name || '';
        cellSize = ctx.cellSize && ctx.cellSize > 0 ? ctx.cellSize : 1;
        originX = nums(ctx.originX, 0);
        originZ = nums(ctx.originZ, 0);
        cells = new Set(ctx.cells || []);
        aabbCount = ctx.aabbCount || 0;
        cellSizeEl.value = String(cellSize);
        updateMeta();
        refreshStats();
        // 打开即把已有阻挡画进场景（不必先开笔刷）
        await showExistingBlocks();
      } catch (e) {
        metaEl.textContent = `加载失败: ${e}`;
      }
    };

    this._reload = () => {
      void load();
    };

    const close = async () => {
      await stopBrush();
      try {
        Editor.Panel.close?.('scene-editor.block-plant-editor');
      } catch {
        /* ignore */
      }
    };

    btnBrush.addEventListener('click', () => {
      if (brushOn) void stopBrush();
      else void startBrush();
    });
    (this.$.btnClose as HTMLElement)?.addEventListener('click', () => void close());
    (this.$.btnClear as HTMLElement)?.addEventListener('click', async () => {
      cells.clear();
      aabbCount = 0;
      refreshStats();
      if (brushOn) {
        await stopBrush();
        await startBrush();
      } else {
        try {
          await Editor.Message.request('scene-editor', 'sync-block-cells', {
            sceneId,
            cells: [],
            cellSize,
            originX,
            originZ,
            brushRadius: brushRadius(),
          });
        } catch {
          /* ignore */
        }
      }
    });
    (this.$.btnSave as HTMLElement)?.addEventListener('click', async () => {
      await pullBrushState();
      cellSize = Math.max(0.25, nums(cellSizeEl.value, 1));
      try {
        const result = (await Editor.Message.request('scene-editor', 'save-resource-blocks', {
          sceneId,
          cells: [...cells],
          cellSize,
          originX,
          originZ,
        })) as { ok?: boolean; error?: string; aabbCount?: number };
        if (!result?.ok) {
          await Editor.Dialog.error(result?.error || '保存失败', {
            title: '阻挡种植',
            buttons: ['确定'],
            default: 0,
          });
          return;
        }
        aabbCount = result.aabbCount || 0;
        refreshStats('已保存');
        await Editor.Dialog.info(`已保存 ${aabbCount} 个 AABB 阻挡`, {
          title: '阻挡种植',
          buttons: ['确定'],
          default: 0,
        });
      } catch (e) {
        await Editor.Dialog.error(String(e), { title: '阻挡种植', buttons: ['确定'], default: 0 });
      }
    });

    modeEl.addEventListener('change', () => void syncConfig());
    brushEl.addEventListener('change', () => void syncConfig());
    cellSizeEl.addEventListener('change', () => {
      cellSize = Math.max(0.25, nums(cellSizeEl.value, 1));
      void syncConfig();
    });

    void load();
  },
  close(this: { _poll?: ReturnType<typeof setInterval> | null }) {
    if (this._poll) {
      clearInterval(this._poll);
      this._poll = null;
    }
    try {
      void Editor.Message.request('scene-editor', 'stop-mouse-brush');
    } catch {
      /* ignore */
    }
  },
});
