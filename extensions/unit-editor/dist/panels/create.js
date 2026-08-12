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
    ready() {
        var _a, _b;
        const input = this.$.unitId;
        const nameInput = this.$.unitName;
        const categoryInput = this.$.unitCategory;
        const descInput = this.$.unitDesc;
        setTimeout(() => {
            try {
                input === null || input === void 0 ? void 0 : input.focus();
            }
            catch {
                /* ignore */
            }
        }, 50);
        const close = () => {
            var _a, _b;
            try {
                (_b = (_a = Editor.Panel).close) === null || _b === void 0 ? void 0 : _b.call(_a, 'unit-editor.create');
            }
            catch {
                /* ignore */
            }
        };
        const submit = async () => {
            var _a, _b, _c, _d;
            const raw = String((_a = input === null || input === void 0 ? void 0 : input.value) !== null && _a !== void 0 ? _a : '').trim();
            const unitId = Number(raw);
            if (!raw || !Number.isFinite(unitId) || unitId <= 0 || !Number.isInteger(unitId)) {
                try {
                    await Editor.Dialog.warn('请输入有效的正整数编号', { title: '创建单位', buttons: ['确定'], default: 0 });
                }
                catch {
                    /* ignore */
                }
                return;
            }
            const name = String((_b = nameInput === null || nameInput === void 0 ? void 0 : nameInput.value) !== null && _b !== void 0 ? _b : '').trim();
            const category = String((_c = categoryInput === null || categoryInput === void 0 ? void 0 : categoryInput.value) !== null && _c !== void 0 ? _c : '').trim();
            const description = String((_d = descInput === null || descInput === void 0 ? void 0 : descInput.value) !== null && _d !== void 0 ? _d : '').trim();
            if (!category) {
                try {
                    await Editor.Dialog.warn('请填写分类（如 player / hero / enemy）', { title: '创建单位', buttons: ['确定'], default: 0 });
                }
                catch {
                    /* ignore */
                }
                return;
            }
            const result = (await Editor.Message.request('unit-editor', 'create-unit-api', {
                unitId,
                name: name || undefined,
                category,
                description: description || undefined,
            }));
            if (!(result === null || result === void 0 ? void 0 : result.ok)) {
                try {
                    await Editor.Dialog.error((result === null || result === void 0 ? void 0 : result.error) || '创建失败', { title: '创建单位', buttons: ['确定'], default: 0 });
                }
                catch {
                    /* ignore */
                }
                return;
            }
            try {
                await Editor.Message.request('asset-db', 'refresh-asset', `db://assets/resources/units/${unitId}`);
            }
            catch {
                /* ignore */
            }
            try {
                await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'unit' });
            }
            catch {
                /* ignore */
            }
            close();
        };
        (_a = this.$.cancel) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => close());
        (_b = this.$.ok) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
            void submit();
        });
        const onEnter = (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                void submit();
            }
        };
        input === null || input === void 0 ? void 0 : input.addEventListener('keydown', onEnter);
        nameInput === null || nameInput === void 0 ? void 0 : nameInput.addEventListener('keydown', onEnter);
        categoryInput === null || categoryInput === void 0 ? void 0 : categoryInput.addEventListener('keydown', onEnter);
        descInput === null || descInput === void 0 ? void 0 : descInput.addEventListener('keydown', onEnter);
    },
});
//# sourceMappingURL=create.js.map