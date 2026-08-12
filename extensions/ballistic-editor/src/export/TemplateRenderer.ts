import * as fs from 'fs';
import * as path from 'path';
import { templatesDir } from '../paths';

export function renderTemplate(template: string, placeholders: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(placeholders)) {
    out = out.split(`{{${key}}}`).join(value ?? '');
  }
  return out;
}

export function loadTemplate(fileName: string): string | null {
  const p = path.join(templatesDir(), fileName);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

export function findNodeTemplate(typeName: string): string | null {
  for (const c of [`Execute${typeName}.ts.tpl`, `${typeName}.ts.tpl`]) {
    const t = loadTemplate(c);
    if (t != null) return t;
  }
  return null;
}

export function splitLifecycleMethodBlocks(fullText: string): string[] {
  const lines = fullText.split(/\r?\n/);
  const blocks: string[] = [];
  let sb: string[] = [];
  let inBlock = false;
  const methodStart = '    protected ';
  for (const line of lines) {
    if (line.startsWith(methodStart) && line.includes('(')) {
      if (inBlock) {
        blocks.push(sb.join('\n') + '\n');
        sb = [];
      }
      inBlock = true;
    }
    if (inBlock) sb.push(line);
  }
  if (inBlock && sb.length > 0) blocks.push(sb.join('\n') + '\n');
  return blocks;
}

export function findLifecycleBlock(blocks: string[], methodName: string): string | null {
  const needle = `${methodName}(`;
  for (const b of blocks) {
    if (b.includes(needle)) return b;
  }
  return null;
}
