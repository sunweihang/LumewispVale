'use strict';

module.exports = Editor.Panel.define({
  listeners: {},
  template: `
    <div class="wrap">
      <div class="label">特效编号</div>
      <input id="effect-id" type="number" min="1" step="1" placeholder="请输入正整数，如 411" />
      <div class="label">名称 <span class="optional">（可选）</span></div>
      <input id="effect-name" type="text" placeholder="如 SFX_Boom" />
      <div class="label">分类 <span class="optional">（可选）</span></div>
      <input id="effect-category" type="text" placeholder="如 sfx / vfx" />
      <div class="hint">仅创建 effects/{编号}/ 目录与 index.json（含空 Res、Output），不生成 Prefab、不改 res.json。</div>
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
    input { width: 100%; box-sizing: border-box; height: 28px; padding: 0 8px;
      border: 1px solid #555; border-radius: 3px; background: #2a2a2a; color: #ddd; outline: none; }
    input:focus { border-color: #0c6; }
  `,
  $: {
    effectId: '#effect-id',
    effectName: '#effect-name',
    effectCategory: '#effect-category',
    cancel: '#btn-cancel',
    ok: '#btn-ok',
  },
  ready(this: { $: Record<string, HTMLElement | undefined> }) {
    const idInput = this.$.effectId as HTMLInputElement | undefined;
    const nameInput = this.$.effectName as HTMLInputElement | undefined;
    const catInput = this.$.effectCategory as HTMLInputElement | undefined;
    setTimeout(() => {
      try {
        idInput?.focus();
      } catch {
        /* ignore */
      }
    }, 50);

    const close = () => {
      try {
        Editor.Panel.close?.('effect-editor.create');
      } catch {
        /* ignore */
      }
    };

    const submit = async () => {
      const effectId = Number(String(idInput?.value ?? '').trim());
      if (!effectId || !Number.isInteger(effectId) || effectId <= 0) {
        await Editor.Dialog.warn('请输入有效的正整数编号', { title: '创建特效' , buttons: ['确定'], default: 0 });
        return;
      }
      const result = (await Editor.Message.request('effect-editor', 'create-effect-api', {
        effectId,
        name: String(nameInput?.value ?? '').trim() || undefined,
        category: String(catInput?.value ?? '').trim() || undefined,
      })) as { ok?: boolean; error?: string };
      if (!result?.ok) {
        await Editor.Dialog.error(result?.error || '创建失败', { title: '创建特效' , buttons: ['确定'], default: 0 });
        return;
      }
      try {
        await Editor.Message.request('asset-db', 'refresh-asset', `db://assets/resources/effects/${effectId}`);
      } catch {
        /* ignore */
      }
      try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'effect' });
      } catch {
        /* ignore */
      }
      close();
    };

    this.$.cancel?.addEventListener('click', () => close());
    this.$.ok?.addEventListener('click', () => {
      void submit();
    });
    idInput?.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        void submit();
      }
    });
  },
});
