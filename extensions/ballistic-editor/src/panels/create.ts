'use strict';

module.exports = Editor.Panel.define({
  listeners: {},
  template: `
    <div class="wrap">
      <div class="label">弹道编号</div>
      <input id="ballistic-id" type="number" min="1" step="1" placeholder="请输入正整数，如 100000003" />
      <div class="label">名称 <span class="optional">（可选）</span></div>
      <input id="ballistic-name" type="text" placeholder="如 直线弹道" />
      <div class="hint">仅创建 ballistic-graphs/{编号}/ 与配置（index.json + 空图），不自动打开编辑器。</div>
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
    ballisticId: '#ballistic-id',
    ballisticName: '#ballistic-name',
    cancel: '#btn-cancel',
    ok: '#btn-ok',
  },
  ready(this: { $: Record<string, HTMLElement | undefined> }) {
    const idInput = this.$.ballisticId as HTMLInputElement | undefined;
    const nameInput = this.$.ballisticName as HTMLInputElement | undefined;
    setTimeout(() => {
      try {
        idInput?.focus();
      } catch {
        /* ignore */
      }
    }, 50);

    const close = () => {
      try {
        Editor.Panel.close?.('ballistic-editor.create');
      } catch {
        /* ignore */
      }
    };

    const submit = async () => {
      const ballisticId = Number(String(idInput?.value ?? '').trim());
      if (!ballisticId || !Number.isInteger(ballisticId) || ballisticId <= 0) {
        await Editor.Dialog.warn('请输入有效的正整数编号', { title: '创建弹道' , buttons: ['确定'], default: 0 });
        return;
      }
      const result = (await Editor.Message.request('ballistic-editor', 'create-ballistic-api', {
        ballisticId,
        name: String(nameInput?.value ?? '').trim() || undefined,
        exportFlag: true,
      })) as { ok?: boolean; error?: string };
      if (!result?.ok) {
        await Editor.Dialog.error(result?.error || '创建失败', { title: '创建弹道' , buttons: ['确定'], default: 0 });
        return;
      }
      try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'ballistic' });
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
