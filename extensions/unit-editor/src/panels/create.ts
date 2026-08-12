'use strict';

module.exports = Editor.Panel.define({
  listeners: {},
  template: `
    <div class="wrap">
      <div class="label">单位编号</div>
      <input id="unit-id" type="number" min="1" step="1" placeholder="请输入正整数，如 3000" />
      <div class="label">名称</div>
      <input id="unit-name" type="text" placeholder="如 Player / Hero01" />
      <div class="label">分类</div>
      <input id="unit-category" type="text" placeholder="如 player / hero / enemy / boss" />
      <div class="label">描述 <span class="optional">（可选）</span></div>
      <input id="unit-desc" type="text" placeholder="简短说明" />
      <div class="hint">仅创建 units/{编号}/ 目录与 index.json（含空 Res、Output），不生成 Prefab。</div>
      <div class="actions">
        <ui-button id="btn-cancel">取消</ui-button>
        <ui-button id="btn-ok" class="green">创建</ui-button>
      </div>
    </div>
  `,
  style: `
    .wrap { padding: 16px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; }
    .label { font-weight: 600; margin-top: 2px; }
    .optional { font-weight: 400; opacity: 0.6; font-size: 12px; }
    .hint { opacity: 0.75; font-size: 12px; line-height: 1.4; margin-top: 4px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    input[type="number"], input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      height: 28px;
      padding: 0 8px;
      border: 1px solid #555;
      border-radius: 3px;
      background: #2a2a2a;
      color: #ddd;
      outline: none;
    }
    input:focus { border-color: #0c6; }
  `,
  $: {
    unitId: '#unit-id',
    unitName: '#unit-name',
    unitCategory: '#unit-category',
    unitDesc: '#unit-desc',
    cancel: '#btn-cancel',
    ok: '#btn-ok',
  },
  ready(this: {
    $: Record<string, HTMLElement | undefined>;
  }) {
    const input = this.$.unitId as HTMLInputElement | undefined;
    const nameInput = this.$.unitName as HTMLInputElement | undefined;
    const categoryInput = this.$.unitCategory as HTMLInputElement | undefined;
    const descInput = this.$.unitDesc as HTMLInputElement | undefined;
    setTimeout(() => {
      try {
        input?.focus();
      } catch {
        /* ignore */
      }
    }, 50);

    const close = () => {
      try {
        Editor.Panel.close?.('unit-editor.create');
      } catch {
        /* ignore */
      }
    };

    const submit = async () => {
      const raw = String(input?.value ?? '').trim();
      const unitId = Number(raw);
      if (!raw || !Number.isFinite(unitId) || unitId <= 0 || !Number.isInteger(unitId)) {
        try {
          await Editor.Dialog.warn('请输入有效的正整数编号', { title: '创建单位' , buttons: ['确定'], default: 0 });
        } catch {
          /* ignore */
        }
        return;
      }
      const name = String(nameInput?.value ?? '').trim();
      const category = String(categoryInput?.value ?? '').trim();
      const description = String(descInput?.value ?? '').trim();
      if (!category) {
        try {
          await Editor.Dialog.warn('请填写分类（如 player / hero / enemy）', { title: '创建单位' , buttons: ['确定'], default: 0 });
        } catch {
          /* ignore */
        }
        return;
      }
      const result = (await Editor.Message.request('unit-editor', 'create-unit-api', {
        unitId,
        name: name || undefined,
        category,
        description: description || undefined,
      })) as { ok?: boolean; error?: string; unitId?: number };
      if (!result?.ok) {
        try {
          await Editor.Dialog.error(result?.error || '创建失败', { title: '创建单位' , buttons: ['确定'], default: 0 });
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        await Editor.Message.request('asset-db', 'refresh-asset', `db://assets/resources/units/${unitId}`);
      } catch {
        /* ignore */
      }
      try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'unit' });
      } catch {
        /* ignore */
      }
      close();
    };

    this.$.cancel?.addEventListener('click', () => close());
    this.$.ok?.addEventListener('click', () => {
      void submit();
    });
    const onEnter = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        void submit();
      }
    };
    input?.addEventListener('keydown', onEnter);
    nameInput?.addEventListener('keydown', onEnter);
    categoryInput?.addEventListener('keydown', onEnter);
    descInput?.addEventListener('keydown', onEnter);
  },
});
