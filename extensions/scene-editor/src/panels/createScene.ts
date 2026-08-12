'use strict';

module.exports = Editor.Panel.define({
  listeners: {},
  template: `
    <div class="wrap">
      <div class="label">资源场景编号</div>
      <input id="scene-id" type="number" min="1" step="1" placeholder="请输入正整数，如 610" />
      <div class="label">名称 <span class="optional">（可选）</span></div>
      <input id="scene-name" type="text" placeholder="如 Chapter01_Level10" />
      <div class="label">分类 <span class="optional">（可选）</span></div>
      <input id="scene-category" type="text" placeholder="如 Chapter01" />
      <div class="hint">仅创建 scenes/{编号}/ 与 index.json（含空 Res、Output）。不生成 Prefab、不自动建逻辑场景。</div>
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
    sceneId: '#scene-id',
    sceneName: '#scene-name',
    sceneCategory: '#scene-category',
    cancel: '#btn-cancel',
    ok: '#btn-ok',
  },
  ready(this: { $: Record<string, HTMLElement | undefined> }) {
    const idInput = this.$.sceneId as HTMLInputElement | undefined;
    const nameInput = this.$.sceneName as HTMLInputElement | undefined;
    const catInput = this.$.sceneCategory as HTMLInputElement | undefined;
    setTimeout(() => {
      try {
        idInput?.focus();
      } catch {
        /* ignore */
      }
    }, 50);

    const close = () => {
      try {
        Editor.Panel.close?.('scene-editor.create-scene');
      } catch {
        /* ignore */
      }
    };

    const submit = async () => {
      const sceneId = Number(String(idInput?.value ?? '').trim());
      if (!sceneId || !Number.isInteger(sceneId) || sceneId <= 0) {
        await Editor.Dialog.warn('请输入有效的正整数编号', { title: '创建资源场景' , buttons: ['确定'], default: 0 });
        return;
      }
      const result = (await Editor.Message.request('scene-editor', 'create-scene-api', {
        sceneId,
        name: String(nameInput?.value ?? '').trim() || undefined,
        category: String(catInput?.value ?? '').trim() || undefined,
      })) as { ok?: boolean; error?: string };
      if (!result?.ok) {
        await Editor.Dialog.error(result?.error || '创建失败', { title: '创建资源场景' , buttons: ['确定'], default: 0 });
        return;
      }
      try {
        await Editor.Message.request('asset-db', 'refresh-asset', `db://assets/resources/scenes/${sceneId}`);
      } catch {
        /* ignore */
      }
      try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'resource-scene' });
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
