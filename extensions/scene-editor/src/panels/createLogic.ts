'use strict';

module.exports = Editor.Panel.define({
  listeners: {},
  template: `
    <div class="wrap">
      <div class="title">创建逻辑场景</div>
      <div class="hint">多个逻辑场景可绑定同一资源场景；种植配置写在逻辑场景 index.json。</div>
      <div class="label">绑定资源场景</div>
      <select id="assets-scene"></select>
      <div class="label">逻辑场景 ID</div>
      <input id="logic-id" type="number" min="1" step="1" placeholder="请手动输入，如 6001" />
      <div class="label">名称 <span class="optional">（可选）</span></div>
      <input id="logic-name" type="text" placeholder="如 Chapter01_Level00 困难" />
      <div class="label">分类 <span class="optional">（可选）</span></div>
      <input id="logic-category" type="text" placeholder="如 Chapter01" />
      <div class="actions">
        <ui-button id="btn-cancel">取消</ui-button>
        <ui-button id="btn-ok" class="green">创建</ui-button>
      </div>
    </div>
  `,
  style: `
    .wrap { padding: 16px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; }
    .title { font-weight: 700; font-size: 14px; }
    .label { font-weight: 600; margin-top: 2px; }
    .optional { font-weight: 400; opacity: 0.6; font-size: 12px; }
    .hint { opacity: 0.75; font-size: 12px; line-height: 1.4; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    input[type="number"], input[type="text"], select {
      width: 100%; box-sizing: border-box; height: 28px; padding: 0 8px;
      border: 1px solid #555; border-radius: 3px; background: #2a2a2a; color: #ddd; outline: none;
    }
    input:focus, select:focus { border-color: #0c6; }
  `,
  $: {
    assetsScene: '#assets-scene',
    logicId: '#logic-id',
    logicName: '#logic-name',
    logicCategory: '#logic-category',
    cancel: '#btn-cancel',
    ok: '#btn-ok',
  },
  ready(this: { $: Record<string, HTMLElement | undefined> }) {
    const sel = this.$.assetsScene as HTMLSelectElement | undefined;
    const logicInput = this.$.logicId as HTMLInputElement | undefined;
    const nameInput = this.$.logicName as HTMLInputElement | undefined;
    const catInput = this.$.logicCategory as HTMLInputElement | undefined;

    const close = () => {
      try {
        Editor.Panel.close?.('scene-editor.create-logic');
      } catch {
        /* ignore */
      }
    };

    const fillScenes = async () => {
      const scenes = (await Editor.Message.request('scene-editor', 'list-scenes')) as Array<{
        sceneId: number;
        name?: string;
        category?: string;
      }>;
      if (!sel) return;
      sel.innerHTML = '';
      if (!scenes?.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '（请先创建资源场景）';
        sel.appendChild(opt);
        return;
      }
      for (const s of scenes) {
        const opt = document.createElement('option');
        opt.value = String(s.sceneId);
        opt.textContent = `${s.sceneId} · ${s.name || '未命名'}`;
        sel.appendChild(opt);
      }
      sel.selectedIndex = scenes.length - 1;
      const cur = scenes[sel.selectedIndex];
      if (catInput && cur?.category) catInput.value = cur.category;
      if (nameInput && cur?.name) nameInput.value = `${cur.name} 逻辑`;
    };

    sel?.addEventListener('change', () => {
      void (async () => {
        const assetsSceneId = Number(sel.value);
        const scenes = (await Editor.Message.request('scene-editor', 'list-scenes')) as Array<{
          sceneId: number;
          name?: string;
          category?: string;
        }>;
        const cur = scenes?.find((s) => s.sceneId === assetsSceneId);
        if (catInput && cur?.category) catInput.value = cur.category;
        if (nameInput && cur?.name) nameInput.value = `${cur.name} 逻辑`;
      })();
    });

    const submit = async () => {
      const assetsSceneId = Number(sel?.value);
      if (!assetsSceneId) {
        await Editor.Dialog.warn('请选择资源场景', { title: '创建逻辑场景' , buttons: ['确定'], default: 0 });
        return;
      }
      const logicId = Number(String(logicInput?.value ?? '').trim());
      if (!logicId || !Number.isInteger(logicId) || logicId <= 0) {
        await Editor.Dialog.warn('请填写有效的逻辑场景 ID', { title: '创建逻辑场景' , buttons: ['确定'], default: 0 });
        return;
      }
      const result = (await Editor.Message.request('scene-editor', 'create-logic-scene-api', {
        assetsSceneId,
        logicId,
        name: String(nameInput?.value ?? '').trim() || undefined,
        category: String(catInput?.value ?? '').trim() || undefined,
      })) as { ok?: boolean; error?: string; logicId?: number };
      if (!result?.ok) {
        await Editor.Dialog.error(result?.error || '创建失败', { title: '创建逻辑场景' , buttons: ['确定'], default: 0 });
        return;
      }
      try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'logic-scene' });
      } catch {
        /* ignore */
      }
      close();
    };

    this.$.cancel?.addEventListener('click', () => close());
    this.$.ok?.addEventListener('click', () => {
      void submit();
    });
    void fillScenes();
  },
});
