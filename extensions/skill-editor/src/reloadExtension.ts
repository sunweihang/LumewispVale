'use strict';

import { execSync } from 'child_process';
import * as path from 'path';

/** dist/ → extensions/skill-editor */
export function extensionRoot(): string {
  return path.resolve(__dirname, '..');
}

export async function buildExtension(): Promise<{ ok: boolean; log: string }> {
  const root = extensionRoot();
  try {
    const log = execSync('npm run build', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    } as Parameters<typeof execSync>[1]);
    return { ok: true, log: String(log || '').trim() };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const log = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').trim();
    return { ok: false, log: log || String(e) };
  }
}

/**
 * 触发 Cocos 扩展管理器同款「刷新」：卸载再加载本扩展，使 dist 新代码生效。
 * 参数优先用扩展根目录（论坛常用），失败再试包名。
 */
export async function reloadExtensionPackage(packageName: string): Promise<void> {
  const root = extensionRoot();
  const attempts: Array<{ label: string; run: () => Promise<unknown> }> = [
    { label: `extension.reload(path)`, run: () => Editor.Message.request('extension', 'reload', root) },
    { label: `extension.reload(name)`, run: () => Editor.Message.request('extension', 'reload', packageName) },
  ];

  const pkgApi = (Editor as unknown as { Package?: { reload?: (name: string) => unknown } }).Package;
  if (typeof pkgApi?.reload === 'function') {
    attempts.push({
      label: 'Editor.Package.reload',
      run: async () => pkgApi.reload!(packageName),
    });
  }

  const errors: string[] = [];
  for (const a of attempts) {
    try {
      await a.run();
      console.log(`[skill-editor] reload ok via ${a.label}`);
      return;
    } catch (e) {
      errors.push(`${a.label}: ${e}`);
    }
  }
  throw new Error(errors.join('\n') || 'reload failed');
}
