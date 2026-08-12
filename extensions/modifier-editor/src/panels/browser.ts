'use strict';

import { listLocalModifiers, ModifierListItem } from '../browseModifiers';

const PKG = 'modifier-editor';

let listEl: HTMLElement | null = null;

function renderList(items: ModifierListItem[]): void {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty">暂无 Buff。请用菜单「创建Buff」。</div>';
    return;
  }
  for (const s of items) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="meta">
        <div class="id">${s.modifierId}</div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="flags">${s.exportFlag ? '导出' : '未导出'} · ${
          s.hasGraph ? '有图' : '无图'
        } · ${s.hasRuntimeClass ? '有运行时' : '无运行时'}${
          s.category ? ` · ${escapeHtml(s.category)}` : ''
        }</div>
      </div>
      <div class="actions">
        <button data-act="open" data-id="${s.modifierId}">编辑</button>
        <button data-act="export" data-id="${s.modifierId}">导出TS</button>
        <button data-act="validate" data-id="${s.modifierId}">校验</button>
      </div>
    `;
    listEl.appendChild(row);
  }
  listEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = (btn as HTMLElement).dataset.act;
      const id = Number((btn as HTMLElement).dataset.id);
      if (!id) return;
      if (act === 'open') {
        await Editor.Message.request(PKG, 'open-modifier', { modifierId: id });
      } else if (act === 'export') {
        await Editor.Message.request(PKG, 'export-modifier', { modifierId: id });
        await refresh();
      } else if (act === 'validate') {
        await Editor.Message.request(PKG, 'validate-modifier', { modifierId: id });
      }
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

async function refresh(): Promise<void> {
  renderList(listLocalModifiers());
}

export = Editor.Panel.define({
  listeners: {
    show() {
      refresh();
    },
  },
  template: `
    <div class="wrap">
      <header>
        <h2>Buff 浏览器</h2>
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
  ready(this: { $: Record<string, HTMLElement | undefined> }) {
    listEl = this.$.list as HTMLElement;
    this.$.refresh?.addEventListener('click', () => refresh());
    this.$.create?.addEventListener('click', async () => {
      await Editor.Message.request(PKG, 'create-modifier');
      await refresh();
    });
    this.$.batch?.addEventListener('click', async () => {
      await Editor.Message.request(PKG, 'export-ts-batch');
      await refresh();
    });
    refresh();
  },
  close() {
    listEl = null;
  },
});
