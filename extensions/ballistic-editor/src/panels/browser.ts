'use strict';

import { listLocalBallistics, BallisticListItem } from '../browseBallistics';
import { validateBallisticOnDisk } from '../validateBallisticGraph';

const PKG = 'ballistic-editor';

let listEl: HTMLElement | null = null;

function renderList(items: BallisticListItem[]): void {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty">暂无弹道。请用菜单「创建弹道」。</div>';
    return;
  }
  for (const s of items) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="meta">
        <div class="id">${s.ballisticId}</div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="flags">${s.exportFlag ? '导出' : '未导出'} · ${s.hasGraph ? '有图' : '无图'}${
          s.category ? ` · ${escapeHtml(s.category)}` : ''
        }</div>
      </div>
      <div class="actions">
        <button data-act="edit" data-id="${s.ballisticId}">编辑</button>
        <button data-act="export" data-id="${s.ballisticId}">导出TS</button>
        <button data-act="validate" data-id="${s.ballisticId}">校验</button>
        <button data-act="refs" data-id="${s.ballisticId}">引用技能</button>
      </div>
    `;
    listEl.appendChild(row);
  }
  listEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = (btn as HTMLElement).dataset.act;
      const id = Number((btn as HTMLElement).dataset.id);
      if (!id) return;
      if (act === 'edit') {
        await Editor.Message.request(PKG, 'open-ballistic', { ballisticId: id });
      } else if (act === 'export') {
        await Editor.Message.request(PKG, 'export-ballistic', { ballisticId: id });
        await refresh();
      } else if (act === 'validate') {
        const r = validateBallisticOnDisk(id);
        const msg = r.ok
          ? `校验通过\n${r.warnings.join('\n')}`
          : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
        try {
          await Editor.Dialog.info(msg, { title: `弹道 ${id}`, buttons: ['确定'], default: 0 });
        } catch {
          console.log(msg);
        }
      } else if (act === 'refs') {
        await Editor.Message.request(PKG, 'find-skills-using-ballistic', { ballisticId: id });
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
  renderList(listLocalBallistics());
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
        <h2>弹道浏览器</h2>
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
    .id { font-weight: 700; color: #6cb2ff; }
    .name { font-size: 12px; margin-top: 2px; }
    .flags { font-size: 11px; opacity: 0.7; margin-top: 2px; }
    .actions { display: flex; flex-direction: column; gap: 4px; }
    .empty { opacity: 0.6; padding: 20px; text-align: center; }
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
      await Editor.Message.request(PKG, 'create-ballistic');
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
