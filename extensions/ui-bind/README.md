# ui-bind

对齐 GameUILib CDE：以 `*_CDE.prefab` 的 C/D/E 表为真源，生成 `*_ComponentTable.ts`。

## 推荐用法（在 CDE 上生成）

1. 打开 `*_CDE.prefab`（如 `Pan_Role_CDE` / `Item_EquipSlot_CDE`）
2. 选中根节点上的 **UIBindCDEConfigAsset**
3. 编辑 Components / Data / Events
4. 勾选 **生成代码**（勾一次即触发）

输出：`assets/Scripts/src/gui/generated/{ResName}_ComponentTable.ts`

> 需启用本扩展（`extensions/ui-bind`）。UI 根上的 `UIBindCDE` 也有同名勾选项，会转发到关联的 CDE。

## 菜单（备用）

- `扩展 → UI Bind → 生成 Pan_Role 绑定`（优先读 `Pan_Role_CDE.prefab`）
- 选中任意 `.prefab` → `从 Prefab 生成绑定代码`（`*_CDE` 按 CDE 表；普通 UI 预制体按节点扫描）

## CLI

```bash
node tools/generate-ui-bind.js
node tools/generate-ui-bind.js assets/resources/UI/Pan_Role/Prefabs/Pan_Role_CDE.prefab
node tools/generate-ui-bind.js assets/resources/UI/Item_EquipSlot/Prefabs/Item_EquipSlot_CDE.prefab
```
