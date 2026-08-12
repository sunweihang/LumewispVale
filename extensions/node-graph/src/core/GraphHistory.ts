import { NodeGraphJSON } from './NodeGraph';

const MAX_STACK = 80;
/** 连续属性编辑合并为一步撤销的时间窗（ms） */
const FIELD_COALESCE_MS = 1000;

function cloneGraph(json: NodeGraphJSON): NodeGraphJSON {
  return JSON.parse(JSON.stringify(json)) as NodeGraphJSON;
}

/**
 * 节点图快照撤销栈。
 * 在每次编辑前压入「编辑前」状态；连续 field 编辑在时间窗内合并为一步。
 */
export class GraphHistory {
  private undoStack: NodeGraphJSON[] = [];
  private redoStack: NodeGraphJSON[] = [];
  private lastReason: string | null = null;
  private coalesceUntil = 0;

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastReason = null;
    this.coalesceUntil = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * @param before 本次编辑前的图快照
   * @param reason 编辑原因（load/undo/redo 不会入栈）
   */
  pushBefore(before: NodeGraphJSON, reason: string): void {
    if (reason === 'load' || reason === 'undo' || reason === 'redo') return;

    const now = Date.now();
    const coalesce =
      reason === 'field' && this.lastReason === 'field' && now < this.coalesceUntil;

    if (!coalesce) {
      this.undoStack.push(cloneGraph(before));
      if (this.undoStack.length > MAX_STACK) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    this.lastReason = reason;
    this.coalesceUntil = reason === 'field' ? now + FIELD_COALESCE_MS : 0;
  }

  /** 撤销：把 current 压入 redo，返回上一份快照 */
  undo(current: NodeGraphJSON): NodeGraphJSON | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(cloneGraph(current));
    this.lastReason = null;
    this.coalesceUntil = 0;
    return prev;
  }

  /** 重做：把 current 压入 undo，返回下一份快照 */
  redo(current: NodeGraphJSON): NodeGraphJSON | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneGraph(current));
    this.lastReason = null;
    this.coalesceUntil = 0;
    return next;
  }
}
