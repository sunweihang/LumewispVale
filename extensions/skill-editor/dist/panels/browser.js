'use strict';
const browseSkills_1 = require("../browseSkills");
const validateSkillGraph_1 = require("../validateSkillGraph");
const PKG = 'skill-editor';
let listEl = null;
function renderList(items) {
    if (!listEl)
        return;
    listEl.innerHTML = '';
    if (items.length === 0) {
        listEl.innerHTML = '<div class="empty">暂无技能。请用菜单「创建技能」。</div>';
        return;
    }
    for (const s of items) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
      <div class="meta">
        <div class="id">${s.skillId}</div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="flags">${s.exportFlag ? '导出' : '未导出'} · ${s.hasGraph ? '有图' : '无图'} · ${s.inTbAbility ? escapeHtml(s.tbAbilityHint) : '仅有图、未入 TbAbility'}</div>
      </div>
      <div class="actions">
        <button data-act="edit" data-id="${s.skillId}">编辑</button>
        <button data-act="export" data-id="${s.skillId}">导出TS</button>
        <button data-act="validate" data-id="${s.skillId}">校验</button>
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
            if (act === 'edit') {
                await Editor.Message.request(PKG, 'open-skill', { skillId: id });
            }
            else if (act === 'export') {
                await Editor.Message.request(PKG, 'export-skill', { skillId: id });
                await refresh();
            }
            else if (act === 'validate') {
                const r = (0, validateSkillGraph_1.validateSkillOnDisk)(id);
                const msg = r.ok
                    ? `校验通过\n${r.warnings.join('\n')}`
                    : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
                try {
                    await Editor.Dialog.info(msg, { title: `技能 ${id}`, buttons: ['确定'], default: 0 });
                }
                catch {
                    console.log(msg);
                }
            }
        });
    });
}
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function refresh() {
    renderList((0, browseSkills_1.listLocalSkills)());
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
        <h2>技能浏览器</h2>
        <div class="toolbar">
          <button id="btn-refresh">刷新列表</button>
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
    ready() {
        var _a, _b, _c;
        listEl = this.$.list;
        (_a = this.$.refresh) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => refresh());
        (_b = this.$.create) === null || _b === void 0 ? void 0 : _b.addEventListener('click', async () => {
            await Editor.Message.request(PKG, 'create-skill');
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