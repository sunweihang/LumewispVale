'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
let rootEl = null;
function clampPct(current, total) {
    if (!total || total <= 0)
        return 0;
    return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}
function render(state) {
    if (!rootEl || !state)
        return;
    const title = rootEl.querySelector('#prog-title');
    const label = rootEl.querySelector('#prog-label');
    const meta = rootEl.querySelector('#prog-meta');
    const fill = rootEl.querySelector('#prog-fill');
    const log = rootEl.querySelector('#prog-log');
    const pct = clampPct(state.current, state.total);
    if (title)
        title.textContent = state.title || '处理中…';
    if (label)
        label.textContent = state.label || '';
    if (meta) {
        meta.textContent = state.done
            ? state.ok === false
                ? '失败'
                : '完成'
            : `${state.current}/${state.total} · ${pct}%`;
    }
    if (fill) {
        fill.style.width = `${pct}%`;
        fill.classList.toggle('fail', !!state.done && state.ok === false);
        fill.classList.toggle('done', !!state.done && state.ok !== false);
    }
    if (log) {
        const lines = state.lines || [];
        const detail = state.detail ? [`> ${state.detail}`] : [];
        log.textContent = [...lines.slice(-12), ...detail].join('\n') || '…';
        log.scrollTop = log.scrollHeight;
    }
}
module.exports = Editor.Panel.define({
    listeners: {},
    template: `
    <div class="wrap" id="root">
      <div class="head">
        <div id="prog-title" class="title">处理中…</div>
        <div id="prog-meta" class="meta">0/0</div>
      </div>
      <div class="bar">
        <div id="prog-fill" class="fill"></div>
      </div>
      <div id="prog-label" class="label">准备中…</div>
      <pre id="prog-log" class="log"></pre>
    </div>
  `,
    style: `
    .wrap {
      padding: 16px 18px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
      background: #1e1e1e;
      color: #ddd;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .title { font-size: 14px; font-weight: 600; }
    .meta { font-size: 12px; opacity: 0.7; white-space: nowrap; }
    .bar {
      height: 10px;
      border-radius: 5px;
      background: #333;
      overflow: hidden;
    }
    .fill {
      height: 100%;
      width: 0%;
      border-radius: 5px;
      background: linear-gradient(90deg, #2a8, #3c9);
      transition: width 0.2s ease;
    }
    .fill.done { background: #2a8; }
    .fill.fail { background: #c44; }
    .label {
      font-size: 12px;
      line-height: 1.4;
      min-height: 1.4em;
      opacity: 0.9;
    }
    .log {
      flex: 1;
      margin: 0;
      padding: 8px 10px;
      border-radius: 4px;
      background: #151515;
      border: 1px solid #333;
      font-size: 11px;
      line-height: 1.45;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
      color: #aaa;
      min-height: 120px;
    }
  `,
    $: {
        root: '#root',
    },
    methods: {
        panelProgressUpdate(state) {
            render(state);
        },
    },
    ready() {
        rootEl = this.$.root;
        void Editor.Message.request('battle-manager', 'query-progress')
            .then((state) => render(state))
            .catch(() => undefined);
    },
    close() {
        rootEl = null;
    },
});
//# sourceMappingURL=progress.js.map