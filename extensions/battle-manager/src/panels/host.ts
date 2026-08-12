'use strict';

import { BattleListItem, BattleModuleInfo, NavGroup } from '../moduleTypes';

const PKG = 'battle-manager';

let rootEl: HTMLElement | null = null;
let modules: BattleModuleInfo[] = [];
let activeId: string | null = null;
/** 列表搜索关键字（id / 名称 / 描述 / 分类） */
let searchQuery = '';
/** 当前模块已加载的完整列表（搜索在本地过滤，避免每次输入都请求） */
let cachedItems: BattleListItem[] = [];
let cachedModId: string | null = null;
/** 行内操作区是否展开（对齐 GameAssets ExpandOperationButtons） */
const expandedActionRows = new Set<string>();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

function activeModule(): BattleModuleInfo | null {
  return modules.find((m) => m.id === activeId) || modules[0] || null;
}

function rowKey(modId: string, itemId: number): string {
  return `${modId}:${itemId}`;
}

function buildGroups(list: BattleModuleInfo[]): NavGroup[] {
  const map = new Map<string, NavGroup>();
  for (const m of list) {
    const gid = m.group || 'battle';
    let g = map.get(gid);
    if (!g) {
      g = {
        id: gid,
        title:
          m.groupTitle ||
          (gid === 'unit'
            ? '单位管理器'
            : gid === 'effect'
              ? '特效管理器'
              : gid === 'scene'
                ? '场景管理'
                : '战斗管理器'),
        order:
          m.groupOrder ??
          (gid === 'unit' ? 10 : gid === 'effect' ? 12 : gid === 'scene' ? 15 : 20),
        modules: [],
      };
      map.set(gid, g);
    }
    g.modules.push(m);
  }
  for (const g of map.values()) {
    g.modules.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh'));
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh'));
}

function normalizeList(mod: BattleModuleInfo, raw: unknown): BattleListItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, index) => {
    const r = row as Record<string, unknown>;
    const id = Number(r[mod.itemIdKey] ?? r.id ?? index + 1);
    const name = String(r.name ?? `${mod.title} ${id}`);
    const category = typeof r.category === 'string' ? String(r.category) : '';
    const description = typeof r.description === 'string' ? String(r.description) : '';
    let subtitle = typeof r.subtitle === 'string' ? String(r.subtitle) : '';
    if (!subtitle) {
      const flags: string[] = [];
      if (r.exportFlag !== undefined) flags.push(r.exportFlag !== false ? '导出' : '未导出');
      if (r.hasGraph !== undefined) flags.push(r.hasGraph ? '有图' : '无图');
      if (typeof r.unitCount === 'number') flags.push(`${r.unitCount} 个单位`);
      if (typeof r.prefab === 'string' && r.prefab) flags.push(String(r.prefab));
      subtitle = flags.join(' · ');
    }
    return {
      id,
      name,
      category,
      description,
      exportFlag: r.exportFlag !== false,
      hasGraph: !!r.hasGraph,
      subtitle,
      raw: r,
    };
  });
}

function matchSearch(item: BattleListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    String(item.id).toLowerCase().includes(q) ||
    item.name.toLowerCase().includes(q) ||
    (item.description || '').toLowerCase().includes(q) ||
    (item.category || '').toLowerCase().includes(q)
  );
}

async function loadModules(preferId?: string | null): Promise<void> {
  let selectId = preferId;
  try {
    const state = (await Editor.Message.request(PKG, 'query-host-state')) as {
      modules?: BattleModuleInfo[];
      selectId?: string | null;
    };
    modules = Array.isArray(state?.modules) ? state.modules : [];
    if (!selectId && state?.selectId) selectId = state.selectId;
  } catch {
    try {
      const res = (await Editor.Message.request(PKG, 'query-modules')) as BattleModuleInfo[];
      modules = Array.isArray(res) ? res : [];
    } catch {
      modules = [];
    }
  }
  if (selectId && modules.some((m) => m.id === selectId)) {
    activeId = selectId;
  } else if (!activeId || !modules.some((m) => m.id === activeId)) {
    activeId = modules[0]?.id ?? null;
  }
  renderShell();
  await refreshList();
}

function renderShell(): void {
  if (!rootEl) return;
  const nav = rootEl.querySelector('#nav') as HTMLElement;
  const title = rootEl.querySelector('#mod-title') as HTMLElement;
  if (!nav || !title) return;

  nav.innerHTML = '';
  if (modules.length === 0) {
    nav.innerHTML = '<div class="nav-empty">未扫描到子模块</div>';
    title.textContent = 'Game编辑器';
    return;
  }

  const groups = buildGroups(modules);
  for (const g of groups) {
    const head = document.createElement('div');
    head.className = 'nav-group';
    head.textContent = g.title;
    nav.appendChild(head);

    for (const m of g.modules) {
      const btn = document.createElement('button');
      btn.className = 'nav-item' + (m.id === activeId ? ' active' : '');
      btn.textContent = m.title;
      btn.dataset.id = m.id;
      btn.addEventListener('click', async () => {
        activeId = m.id;
        searchQuery = '';
        const searchInput = rootEl?.querySelector('#search-input') as HTMLInputElement | null;
        if (searchInput) searchInput.value = '';
        try {
          await Editor.Message.request(PKG, 'remember-module', { moduleId: m.id });
        } catch {
          /* ignore */
        }
        renderShell();
        await refreshList();
      });
      nav.appendChild(btn);
    }
  }

  const mod = activeModule();
  const groupTitle =
    mod?.groupTitle ||
    (mod?.group === 'unit'
      ? '单位管理器'
      : mod?.group === 'effect'
        ? '特效管理器'
        : mod?.group === 'scene'
          ? '场景管理'
          : '战斗管理器');
  title.textContent = mod ? `${groupTitle} · ${mod.title}` : 'Game编辑器';

  const batchBtn = rootEl.querySelector('#btn-batch') as HTMLButtonElement | null;
  const createBtn = rootEl.querySelector('#btn-create') as HTMLButtonElement | null;
  if (batchBtn) {
    // 单位管理不提供「批量扫描挂点」；技能等模块仍可批量导出
    const hideBatch = !!mod?.hideExport || mod?.id === 'unit';
    batchBtn.style.display = hideBatch ? 'none' : '';
    batchBtn.textContent = mod?.exportLabel ? `批量${mod.exportLabel}` : '批量导出';
  }
  if (createBtn) {
    createBtn.style.display = mod?.hideCreate ? 'none' : '';
  }

  const listHeader = rootEl.querySelector('#list-header') as HTMLElement | null;
  if (listHeader) {
    if (mod?.id === 'unit') {
      listHeader.innerHTML = `
        <div class="meta">
          <span class="col-id">ID</span>
          <span class="col-name">显示名</span>
          <span class="col-category">分类</span>
        </div>
        <div class="actions-label">操作</div>
      `;
      listHeader.style.display = '';
    } else if (mod) {
      listHeader.innerHTML = `
        <div class="meta">
          <span class="col-id">ID</span>
          <span class="col-name">显示名</span>
          <span class="col-category">其它</span>
        </div>
        <div class="actions-label">操作</div>
      `;
      listHeader.style.display = '';
    } else {
      listHeader.style.display = 'none';
    }
  }
}

function renderListRows(mod: BattleModuleInfo, items: BattleListItem[]): void {
  const listEl = rootEl?.querySelector('#list') as HTMLElement | null;
  if (!listEl) return;

  const filtered = items.filter((item) => matchSearch(item, searchQuery));

  listEl.innerHTML = '';
  if (items.length === 0) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(mod.emptyHint || `暂无${mod.title}`)}</div>`;
    return;
  }
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty">无匹配结果（关键字：${escapeHtml(searchQuery.trim())}）</div>`;
    return;
  }

  const isUnitList = mod.id === 'unit';

  for (const item of filtered) {
    const row = document.createElement('div');
    row.className = 'row';
    const key = rowKey(mod.id, item.id);
    const expanded = expandedActionRows.has(key);
    const extras = (mod.extraActions || [])
      .filter((a) => a.id !== 'delete')
      .map(
        (a) =>
          `<button data-act="extra" data-extra="${escapeHtml(a.id)}" data-id="${item.id}">${escapeHtml(
            a.label
          )}</button>`
      )
      .join('');
    // 单位管理不用「校验」；技能/弹道等仍可用
    const validateBtn =
      mod.id !== 'unit' && mod.messages.validateOne
        ? `<button data-act="validate" data-id="${item.id}">校验</button>`
        : '';
    const locateBtn =
      mod.id === 'unit' || mod.messages.locate
        ? `<button data-act="locate" data-id="${item.id}">定位</button>`
        : '';
    // 单位管理：始终显示删除（不依赖子扩展是否已重载）
    const canDelete = !!mod.messages.delete || mod.id === 'unit';
    const deleteBtn = canDelete
      ? `<button data-act="delete" data-id="${item.id}">删除</button>`
      : '';
    const exportBtn = mod.hideExport
      ? ''
      : `<button data-act="export" data-id="${item.id}">${escapeHtml(mod.exportLabel || '导出TS')}</button>`;

    // 单位列表：仅 ID / 显示名 / 分类，水平排列（与表头对齐）
    const otherText = isUnitList
      ? item.category || '-'
      : item.category || item.subtitle || '-';
    const metaHtml = `
        <span class="id col-id">${item.id}</span>
        <span class="name col-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <span class="col-category"><span class="category" title="${escapeHtml(otherText)}">${escapeHtml(
          otherText
        )}</span></span>
      `;

    row.innerHTML = `
      <div class="meta">${metaHtml}</div>
      <div class="actions">
        <button type="button" class="btn-toggle-ops" data-act="toggle-ops" data-id="${item.id}">
          ${expanded ? '隐藏操作' : '显示操作'}
        </button>
        <div class="action-btns${expanded ? '' : ' hidden'}">
          <button data-act="edit" data-id="${item.id}">${escapeHtml(mod.openLabel || '编辑')}</button>
          ${exportBtn}
          ${locateBtn}
          ${validateBtn}
          ${extras}
          ${deleteBtn}
        </div>
      </div>
    `;
    listEl.appendChild(row);
  }

  listEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = (btn as HTMLElement).dataset.act;
      const id = Number((btn as HTMLElement).dataset.id);
      if (!id || !mod) return;

      if (act === 'toggle-ops') {
        const key = rowKey(mod.id, id);
        const rowEl = (btn as HTMLElement).closest('.row');
        const btns = rowEl?.querySelector('.action-btns');
        const willExpand = !expandedActionRows.has(key);
        if (willExpand) expandedActionRows.add(key);
        else expandedActionRows.delete(key);
        btns?.classList.toggle('hidden', !willExpand);
        (btn as HTMLElement).textContent = willExpand ? '隐藏操作' : '显示操作';
        return;
      }

      const arg = { [mod.openArgKey]: id };
      try {
        if (act === 'edit') {
          await Editor.Message.request(mod.packageName, mod.messages.open, arg);
        } else if (act === 'export') {
          await Editor.Message.request(mod.packageName, mod.messages.exportOne, arg);
          await refreshList();
        } else if (act === 'validate' && mod.messages.validateOne) {
          await Editor.Message.request(mod.packageName, mod.messages.validateOne, arg);
        } else if (act === 'locate') {
          if (mod.messages.locate) {
            try {
              await Editor.Message.request(mod.packageName, mod.messages.locate, arg);
            } catch {
              await Editor.Message.request(PKG, 'locate-unit', arg);
            }
          } else {
            await Editor.Message.request(PKG, 'locate-unit', arg);
          }
        } else if (act === 'delete') {
          if (mod.messages.delete) {
            try {
              await Editor.Message.request(mod.packageName, mod.messages.delete, arg);
            } catch {
              // 子扩展未重载时走宿主兜底
              await Editor.Message.request(PKG, 'delete-unit', arg);
            }
          } else {
            await Editor.Message.request(PKG, 'delete-unit', arg);
          }
          await refreshList();
        } else if (act === 'extra') {
          const extraId = (btn as HTMLElement).dataset.extra;
          const extra = mod.extraActions?.find((a) => a.id === extraId);
          if (extra) {
            await Editor.Message.request(mod.packageName, extra.message, arg);
            await refreshList();
          }
        }
      } catch (e) {
        try {
          await Editor.Dialog.error(String(e), { title: mod.title , buttons: ['确定'], default: 0 });
        } catch {
          console.error(e);
        }
      }
    });
  });
}

async function refreshList(): Promise<void> {
  const listEl = rootEl?.querySelector('#list') as HTMLElement | null;
  if (!listEl) return;
  const mod = activeModule();
  if (!mod) {
    cachedItems = [];
    cachedModId = null;
    listEl.innerHTML =
      '<div class="empty">请启用 unit-editor / skill-editor / ballistic-editor / story-editor，然后用菜单「Game编辑器 → 重新扫描模块」。</div>';
    return;
  }

  listEl.innerHTML = '<div class="empty">加载中…</div>';
  let items: BattleListItem[] = [];
  try {
    const raw = await Editor.Message.request(mod.packageName, mod.messages.list);
    items = normalizeList(mod, raw);
  } catch (e) {
    cachedItems = [];
    cachedModId = null;
    listEl.innerHTML = `<div class="empty">列表失败：${escapeHtml(String(e))}</div>`;
    return;
  }

  cachedItems = items;
  cachedModId = mod.id;
  renderListRows(mod, items);
}

export = Editor.Panel.define({
  listeners: {
    show() {
      loadModules(activeId);
    },
  },
  template: `
    <div class="wrap" id="root">
      <aside class="nav" id="nav"></aside>
      <section class="main">
        <header>
          <h2 id="mod-title">Game编辑器</h2>
          <div class="toolbar">
            <button id="btn-refresh">刷新列表</button>
            <button id="btn-create">创建</button>
            <button id="btn-batch">批量导出</button>
          </div>
          <div class="search-bar">
            <input id="search-input" type="search" placeholder="搜索：ID / 描述 / 分类" />
          </div>
        </header>
        <div id="list-header" class="list-header"></div>
        <div id="list" class="list"></div>
      </section>
    </div>
  `,
  style: `
    :host { display: flex; flex-direction: column; }
    .wrap { display: flex; height: 100%; min-height: 0; color: #d8d8d8; }
    .nav {
      width: 156px; flex-shrink: 0; border-right: 1px solid #333;
      padding: 10px 8px; display: flex; flex-direction: column; gap: 3px;
      background: rgba(0,0,0,0.22); overflow: auto;
    }
    .nav-group {
      margin: 10px 6px 4px; font-size: 11px; font-weight: 700;
      color: #8eb8dc; letter-spacing: 0.04em; text-transform: none; opacity: 0.95;
    }
    .nav-group:first-child { margin-top: 2px; }
    .nav-item {
      text-align: left; padding: 8px 10px 8px 12px; border: none; border-radius: 5px;
      background: transparent; color: #c8c8c8; cursor: pointer; font-size: 12px;
    }
    .nav-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .nav-item.active { background: rgba(88,140,201,0.38); color: #fff; font-weight: 600; }
    .nav-empty { font-size: 11px; opacity: 0.6; padding: 8px; }
    .main { flex: 1; display: flex; flex-direction: column; min-width: 0; padding: 12px 14px; box-sizing: border-box; }
    header h2 { margin: 0 0 10px; font-size: 14px; font-weight: 650; color: #eee; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .toolbar button, .nav-item, .actions button {
      border: 1px solid #4a4a4a; border-radius: 5px;
      background: #353535; color: #e4e4e4; font-size: 12px;
      padding: 5px 10px; line-height: 1.3;
    }
    .toolbar button:hover, .actions button:hover {
      background: #424242; border-color: #6a6a6a; color: #fff;
    }
    .nav-item { border: none; background: transparent; }
    .nav-item.active { border: none; }
    .search-bar { margin-bottom: 12px; }
    #search-input {
      width: 100%; box-sizing: border-box; height: 30px; padding: 0 12px;
      border: 1px solid #4a4a4a; border-radius: 6px; background: #262626; color: #ddd; outline: none;
    }
    #search-input:focus { border-color: #6cb2ff; box-shadow: 0 0 0 1px rgba(108,178,255,0.25); }
    #search-input::placeholder { color: #777; }
    .list-header {
      display: flex; justify-content: space-between; gap: 12px; align-items: center;
      padding: 8px 12px; font-size: 11px; color: #8a8a8a; font-weight: 650;
      border-top: 1px solid #333; border-bottom: 1px solid #333;
      background: rgba(0,0,0,0.18); letter-spacing: 0.02em;
    }
    .list-header .actions-label {
      flex: 0 0 96px; width: 96px; text-align: center;
    }
    button { cursor: pointer; }
    .list { flex: 1; overflow: auto; min-height: 0; padding-top: 6px; }
    .row {
      display: flex; justify-content: space-between; gap: 12px; align-items: center;
      padding: 10px 12px; margin-bottom: 4px;
      background: rgba(255,255,255,0.035); border: 1px solid transparent; border-radius: 6px;
    }
    .row:nth-child(even) { background: rgba(255,255,255,0.055); }
    .row:hover { background: rgba(108,178,255,0.08); border-color: rgba(108,178,255,0.18); }
    .meta {
      min-width: 0; flex: 1;
      display: flex; align-items: center; gap: 12px;
    }
    .col-id {
      flex: 0 0 52px; width: 52px; min-width: 52px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .col-name {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .col-category {
      flex: 0 0 120px; width: 120px; min-width: 120px;
      overflow: hidden; white-space: nowrap;
    }
    .list-header .col-category { color: #8a8a8a; }
    .id { font-weight: 700; color: #6cb2ff; font-size: 13px; }
    .name { font-size: 13px; color: #e8e8e8; }
    .category {
      font-size: 11px; color: #a8c8e4;
      display: inline-block; max-width: 100%;
      padding: 2px 8px; border-radius: 999px;
      background: rgba(108,178,255,0.12); border: 1px solid rgba(108,178,255,0.18);
      box-sizing: border-box;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      vertical-align: middle;
    }
    .actions {
      display: flex; flex-direction: column; gap: 5px; flex-shrink: 0;
      align-items: stretch; flex: 0 0 96px; width: 96px;
    }
    .btn-toggle-ops {
      font-size: 12px; width: 100%;
      background: #3a4550 !important; border-color: #5a6d80 !important; color: #dce8f4 !important;
    }
    .btn-toggle-ops:hover {
      background: #455564 !important; border-color: #6cb2ff !important; color: #fff !important;
    }
    .action-btns { display: flex; flex-direction: column; gap: 4px; }
    .action-btns.hidden { display: none; }
    .action-btns button { width: 100%; }
    .empty { opacity: 0.6; padding: 28px 16px; text-align: center; font-size: 12px; }
  `,
  $: {
    root: '#root',
    refresh: '#btn-refresh',
    create: '#btn-create',
    batch: '#btn-batch',
    search: '#search-input',
  },
  methods: {
    async panelSetModule(arg: { moduleId?: string; rescan?: boolean }) {
      void arg?.rescan;
      await loadModules(arg?.moduleId ?? activeId);
    },
    getActiveModuleId() {
      return activeId;
    },
    panelQueryActive() {
      return { moduleId: activeId };
    },
  },
  ready(this: { $: Record<string, HTMLElement | undefined> }) {
    rootEl = this.$.root as HTMLElement;
    this.$.refresh?.addEventListener('click', () => refreshList());
    this.$.create?.addEventListener('click', async () => {
      const mod = activeModule();
      if (!mod || mod.hideCreate) return;
      // 创建逻辑由子模块负责（单位会打开编号输入面板；勿用 window.prompt，Electron 不支持）
      await Editor.Message.request(mod.packageName, mod.messages.create);
      await refreshList();
    });
    this.$.batch?.addEventListener('click', async () => {
      const mod = activeModule();
      if (!mod || mod.hideExport) return;
      await Editor.Message.request(mod.packageName, mod.messages.exportBatch);
      await refreshList();
    });
    const searchInput = this.$.search as HTMLInputElement | undefined;
    searchInput?.addEventListener('input', () => {
      searchQuery = searchInput.value || '';
      const mod = activeModule();
      if (mod && cachedModId === mod.id) {
        renderListRows(mod, cachedItems);
      } else {
        void refreshList();
      }
    });
    loadModules(null).then(() => {
      if (activeId) {
        void Editor.Message.request(PKG, 'remember-module', { moduleId: activeId }).catch(() => undefined);
      }
    });
  },
  close() {
    rootEl = null;
    searchQuery = '';
    cachedItems = [];
    cachedModId = null;
    expandedActionRows.clear();
  },
});
