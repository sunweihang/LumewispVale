'use strict';
const browseGuides_1 = require("../browseGuides");
const PKG = 'guide-editor';
let listEl = null;
function renderList(items) {
    if (!listEl)
        return;
    listEl.innerHTML = '';
    if (items.length === 0) {
        listEl.innerHTML = '<div class="empty">暂无引导。请用菜单「创建引导」。</div>';
        return;
    }
    for (const s of items) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
      <div class="meta">
        <div class="id">${s.guideId}</div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="flags">${s.exportFlag ? '导出' : '未导出'} · ${s.hasGraph ? '有图' : '无图'} · ${s.hasRuntimeClass ? '有运行时' : '无运行时'}${s.category ? ` · ${escapeHtml(s.category)}` : ''}</div>
      </div>
      <div class="actions">
        <button data-act="open" data-id="${s.guideId}">编辑</button>
        <button data-act="export" data-id="${s.guideId}">导出TS</button>
        <button data-act="validate" data-id="${s.guideId}">校验</button>
        <button data-act="delete" data-id="${s.guideId}">删除</button>
      </div>
    `;
        listEl.appendChild(row);
    }
    listEl.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const act = btn.dataset.act;
            const id = Number(btn.dataset.id);
            if (!id)
                return;
            if (act === 'open') {
                await Editor.Message.request(PKG, 'open-story', { guideId: id });
            }
            else if (act === 'export') {
                await Editor.Message.request(PKG, 'export-story', { guideId: id });
                await refresh();
            }
            else if (act === 'validate') {
                await Editor.Message.request(PKG, 'validate-story', { guideId: id });
            }
            else if (act === 'delete') {
                await Editor.Message.request(PKG, 'delete-story', { guideId: id });
                await refresh();
            }
        });
    });
}
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function refresh() {
    renderList((0, browseGuides_1.listLocalGuides)());
}
module.exports = Editor.Panel.define({
    listeners: {
        show() {
            refresh();
        },
    },
    template: `
    <div class="wrap">
      <header>
        <h2>引导浏览器</h2>
        <div class="toolbar">
          <button id="btn-refresh">刷新</button>
          <button id="btn-create">创建</button>
          <button id="btn-batch">批量导出</button>
        </div>
      </header>
      <div id="list" class="list"></div>
    </div>
  `,
    style: `
    :host { display: flex; flex-direction: column; }
    .wrap { display: flex; flex-direction: column; height: 100%; padding: 10px; box-sizing: border-box; color: #ddd; }
    header h2 { margin: 0 0 8px; font-size: 14px; }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; }
    button { cursor: pointer; }
    .list { flex: 1; overflow: auto; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 8px; margin-bottom: 6px; background: rgba(255,255,255,0.04); border-radius: 4px; }
    .id { font-weight: 600; color: #9cf; }
    .name { margin-top: 2px; }
    .flags { margin-top: 4px; font-size: 11px; color: #888; }
    .actions { display: flex; flex-direction: column; gap: 4px; }
    .empty { color: #888; padding: 12px; }
  `,
    $: {
        list: '#list',
        refresh: '#btn-refresh',
        create: '#btn-create',
        batch: '#btn-batch',
    },
    ready() {
        var _a, _b, _c;
        listEl = this.$.list;
        (_a = this.$.refresh) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => refresh());
        (_b = this.$.create) === null || _b === void 0 ? void 0 : _b.addEventListener('click', async () => {
            await Editor.Message.request(PKG, 'create-story');
            await refresh();
        });
        (_c = this.$.batch) === null || _c === void 0 ? void 0 : _c.addEventListener('click', async () => {
            await Editor.Message.request(PKG, 'export-ts-batch');
            await refresh();
        });
        refresh();
    },
    close() {
        listEl = null;
    },
});
//# sourceMappingURL=browser.js.map