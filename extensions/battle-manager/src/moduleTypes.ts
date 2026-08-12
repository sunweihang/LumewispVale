/** 子模块向 battle-manager 声明的契约（对齐 GameAssets ViewPath 注册） */
export interface BattleModuleInfo {
  /** 稳定 id：skill / ballistic / unit / unit-category … */
  id: string;
  /** 扩展包名：skill-editor */
  packageName: string;
  /** 侧栏叶子标题 */
  title: string;
  /** 组内排序，越小越靠前 */
  order: number;
  /**
   * 顶层分组（对齐 GameAsset MainEditorWindow 同级模块）。
   * unit → 单位管理器；effect → 特效管理器；scene → 场景管理；battle → 战斗管理器
   */
  group?: 'unit' | 'effect' | 'scene' | 'battle' | string;
  /** 分组侧栏标题 */
  groupTitle?: string;
  /** 分组排序，越小越靠前 */
  groupOrder?: number;
  /** 列表项主键字段名：skillId / ballisticId / unitId */
  itemIdKey: string;
  /** 打开消息参数键，通常与 itemIdKey 相同 */
  openArgKey: string;
  emptyHint?: string;
  /** 列表「导出」按钮文案，默认「导出TS」；单位模块可用「扫描挂点」 */
  exportLabel?: string;
  /** 打开/编辑按钮文案，默认「编辑」 */
  openLabel?: string;
  /** 是否隐藏创建按钮 */
  hideCreate?: boolean;
  /** 是否隐藏导出/批量导出 */
  hideExport?: boolean;
  messages: {
    list: string;
    open: string;
    exportOne: string;
    exportBatch: string;
    create: string;
    /** 可选：校验单项 { [openArgKey]: number } */
    validateOne?: string;
    /** 可选：删除单项 { [openArgKey]: number } */
    delete?: string;
    /** 可选：在资源管理器定位 { [openArgKey]: number } */
    locate?: string;
  };
  /** 行内额外按钮 */
  extraActions?: Array<{
    id: string;
    label: string;
    message: string;
  }>;
}

export interface BattleListItem {
  id: number;
  name: string;
  /** 分类（单位 index.category 等） */
  category?: string;
  /** 描述（单位 index.description 等） */
  description?: string;
  exportFlag?: boolean;
  hasGraph?: boolean;
  subtitle?: string;
  raw: Record<string, unknown>;
}

export interface NavGroup {
  id: string;
  title: string;
  order: number;
  modules: BattleModuleInfo[];
}
