'use strict';

module.exports = Editor.Panel.define({
  listeners: {},
  template: `
    <div class="wrap">
      <div class="label">剧情编号</div>
      <input id="story-id" type="number" min="1" step="1" placeholder="请输入正整数，如 10001" />
      <div class="label">名称 <span class="optional">（可选）</span></div>
      <input id="story-name" type="text" placeholder="如 Boss出场" />
      <div class="hint">仅创建 story-graphs/{编号}/ 与配置（index.json + 空图），不自动打开编辑器。</div>
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
    storyId: '#story-id',
    storyName: '#story-name',
    cancel: '#btn-cancel',
    ok: '#btn-ok',
  },
  ready(this: { $: Record<string, HTMLElement | undefined> }) {
    const idInput = this.$.storyId as HTMLInputElement | undefined;
    const nameInput = this.$.storyName as HTMLInputElement | undefined;
    setTimeout(() => {
      try {
        idInput?.focus();
      } catch {
        /* ignore */
      }
    }, 50);

    const close = () => {
      try {
        Editor.Panel.close?.('story-editor.create');
      } catch {
        /* ignore */
      }
    };

    const submit = async () => {
      const storyId = Number(String(idInput?.value ?? '').trim());
      if (!storyId || !Number.isInteger(storyId) || storyId <= 0) {
        await Editor.Dialog.warn('请输入有效的正整数编号', { title: '创建剧情', buttons: ['确定'], default: 0 });
        return;
      }
      const result = (await Editor.Message.request('story-editor', 'create-story-api', {
        storyId,
        name: String(nameInput?.value ?? '').trim() || undefined,
        exportFlag: true,
      })) as { ok?: boolean; error?: string };
      if (!result?.ok) {
        await Editor.Dialog.error(result?.error || '创建失败', { title: '创建剧情', buttons: ['确定'], default: 0 });
        return;
      }
      try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'story' });
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
