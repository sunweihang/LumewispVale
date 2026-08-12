import * as fs from 'fs';
import { readFsText, writeFsText } from '../assetIo';
import { listLocalBallistics } from '../browseBallistics';
import { ENTRANCE_TYPE } from '../nodes/ballisticNodes';
import {
  CLASS_PREFIX,
  ensureDir,
  generatedClassFsPath,
  generatedDirFs,
  graphFsPath,
  indexFsPath,
  BallisticIndexJSON,
} from '../paths';
import { NodeGraphJSON } from '../graphTypes';
import { validateGraphJSON } from '../validateBallisticGraph';
import { ExportContext } from './ExportContext';
import { getLifecycleSpecs } from './lifecycle';
import {
  findLifecycleBlock,
  findNodeTemplate,
  loadTemplate,
  renderTemplate,
  splitLifecycleMethodBlocks,
} from './TemplateRenderer';
import { regenerateClassMap } from './ClassMapGenerator';

export interface ExportResult {
  ok: boolean;
  ballisticId: number;
  path?: string;
  error?: string;
  warnings?: string[];
}

export function exportBallisticTs(ballisticId: number): ExportResult {
  const graphText = readFsText(graphFsPath(ballisticId));
  if (!graphText) {
    return { ok: false, ballisticId, error: `找不到图: ${graphFsPath(ballisticId)}` };
  }

  let graph: NodeGraphJSON;
  try {
    graph = JSON.parse(graphText) as NodeGraphJSON;
  } catch (e) {
    return { ok: false, ballisticId, error: `图 JSON 解析失败: ${e}` };
  }

  const validation = validateGraphJSON(graph, ballisticId);
  if (!validation.ok) {
    return { ok: false, ballisticId, error: validation.errors.join('; '), warnings: validation.warnings };
  }

  const entrance = graph.nodes.find((n) => n.typeName === ENTRANCE_TYPE);
  if (!entrance) {
    return { ok: false, ballisticId, error: `缺少 ${ENTRANCE_TYPE}` };
  }

  const ctx = new ExportContext(graph, ballisticId);
  ctx.collectReachable(entrance);

  const classTpl = loadTemplate('BallisticClass.ts.tpl');
  const entranceTpl = loadTemplate('BallisticEntranceBlueprint.ts.tpl');
  if (!classTpl || !entranceTpl) {
    return {
      ok: false,
      ballisticId,
      error: '缺少模板 BallisticClass.ts.tpl 或 BallisticEntranceBlueprint.ts.tpl',
    };
  }

  const fields = writeFields(ctx);
  const lifecycle = writeLifecycle(ctx, entranceTpl);
  if (lifecycle == null) {
    return { ok: false, ballisticId, error: '生命周期模板渲染失败' };
  }
  const methods = writeNodeMethods(ctx);

  const className = `${CLASS_PREFIX}${ballisticId}`;
  const code = renderTemplate(classTpl, {
    CLASS_NAME: className,
    BALLISTIC_ID: String(ballisticId),
    FIELDS: fields,
    LIFECYCLE_METHODS: lifecycle,
    BLUEPRINT_METHODS: methods,
  });

  ensureDir(generatedDirFs());
  const outPath = generatedClassFsPath(ballisticId);
  if (fs.existsSync(outPath)) {
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* overwrite below */
    }
  }
  writeFsText(outPath, code);
  touchExportFlag(ballisticId);
  regenerateClassMap();

  return {
    ok: true,
    ballisticId,
    path: outPath,
    warnings: validation.warnings,
  };
}

export function exportAllFlagged(): { ok: number; fail: number; results: ExportResult[] } {
  const items = listLocalBallistics().filter((s) => s.exportFlag !== false);
  const results: ExportResult[] = [];
  let ok = 0;
  let fail = 0;
  for (const s of items) {
    const r = exportBallisticTs(s.ballisticId);
    results.push(r);
    if (r.ok) ok++;
    else fail++;
  }
  regenerateClassMap();
  return { ok, fail, results };
}

function touchExportFlag(ballisticId: number): void {
  const p = indexFsPath(ballisticId);
  if (!fs.existsSync(p)) return;
  try {
    const index = JSON.parse(fs.readFileSync(p, 'utf8')) as BallisticIndexJSON;
    if (index.exportFlag == null) {
      index.exportFlag = true;
      fs.writeFileSync(p, JSON.stringify(index, null, 2), 'utf8');
    }
  } catch {
    /* ignore */
  }
}

function writeFields(ctx: ExportContext): string {
  if (ctx.dataVariables.size === 0) return '';
  const lines: string[] = [''];
  for (const v of ctx.dataVariables.values()) {
    lines.push(`    private ${v.fieldName}: ${v.tsType}${fieldInit(v.tsType)};`);
  }
  lines.push('');
  return lines.join('\n');
}

function fieldInit(tsType: string): string {
  switch (tsType) {
    case 'number':
      return ' = 0';
    case 'boolean':
      return ' = false';
    case 'string':
      return " = ''";
    case 'Node[]':
      return ' = []';
    case 'Vec3':
      return ' = new Vec3()';
    case 'Node | null':
    case 'AbsLinearBallistic | null':
      return ' = null';
    default:
      return ' = null as any';
  }
}

function writeLifecycle(ctx: ExportContext, entranceTpl: string): string | null {
  const blocks = splitLifecycleMethodBlocks(entranceTpl);
  if (blocks.length === 0) return null;

  const specs = getLifecycleSpecs();
  const parts: string[] = [];

  for (const spec of specs) {
    const calls = ctx.getFlowCallsFromEntrance(spec.portIndex);
    if (!spec.alwaysEmit && calls.length === 0) continue;

    const block = findLifecycleBlock(blocks, spec.methodName);
    if (!block) {
      console.error(`[ballistic-editor] missing lifecycle block: ${spec.methodName}`);
      return null;
    }

    const flowBody =
      calls.length === 0
        ? '        // (empty)\n'
        : calls.map((l) => `        ${l}`).join('\n') + '\n';

    parts.push(renderTemplate(block, { FLOW_0: flowBody }));
  }

  return parts.join('\n');
}

function writeNodeMethods(ctx: ExportContext): string {
  const parts: string[] = [];
  for (const info of ctx.visitedNodes) {
    if (info.node.typeName === ENTRANCE_TYPE) continue;

    const tpl = findNodeTemplate(info.node.typeName);
    const ph = ctx.buildNodePlaceholders(info);

    if (tpl && tpl.includes('{{METHOD_NAME}}')) {
      parts.push('\n' + renderTemplate(tpl, ph));
      continue;
    }

    parts.push('');
    parts.push(`    private ${info.methodName}(): void {`);
    if (tpl) {
      const body = renderTemplate(tpl, ph);
      for (const line of body.split(/\r?\n/)) {
        if (line.trim().length === 0) parts.push('');
        else parts.push(`        ${line}`);
      }
    } else {
      parts.push(`        // TODO: unknown node type ${info.node.typeName}`);
      const abs = ctx.flowOutAbsoluteIndex(info.node, 0);
      if (abs >= 0) {
        const flow = ctx.formatFlowCalls(info.node.id, abs, '        ');
        if (flow) parts.push(flow.replace(/\n$/, ''));
      }
    }
    parts.push('    }');
  }
  return parts.join('\n') + '\n';
}
