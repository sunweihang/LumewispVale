/**
 * 场景脚本：在打开的 Prefab 编辑模式中挂上 Decorator / 碰撞范围组件。
 * 由 execute-scene-script 调用。
 */
'use strict';

export function load(): void {
  console.log('[unit-editor] scene script load');
}

export function unload(): void {
  console.log('[unit-editor] scene script unload');
}

function findUnitRoot(): any | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cc = require('cc');
  const { director } = cc;
  const scene = director.getScene();
  if (!scene) return null;

  let root: any = null;
  const walk = (n: any) => {
    if (root) return;
    const name = n.name || '';
    if (
      name === 'Player' ||
      name.startsWith('Hero') ||
      name.includes('Enemy') ||
      n.getComponent('PlayerController') ||
      n.getComponent('HeroController') ||
      n.getComponent('EnemyController') ||
      n.getComponent('BossController') ||
      n.getComponent('UnitCollisionVolume') ||
      n.getComponent('EntityAttachmentSlotDecorator')
    ) {
      root = n;
      return;
    }
    for (const c of n.children) walk(c);
  };
  walk(scene);

  if (!root) {
    for (const c of scene.children) {
      if (c.name && !c.name.startsWith('__')) {
        root = c;
        break;
      }
    }
  }
  return root;
}

async function applyDecoratorToRoot(): Promise<{ ok: boolean; reason?: string; mapped?: number }> {
  const root = findUnitRoot();
  if (!root) return { ok: false, reason: 'unit root not found' };

  let dec = root.getComponent('EntityAttachmentSlotDecorator');
  if (!dec) {
    dec = root.addComponent('EntityAttachmentSlotDecorator');
  }
  if (dec && typeof dec.ensureNecessaryBones === 'function') {
    dec.ensureNecessaryBones();
    dec.autoScanBones();
  }
  const mapped = dec?.slotMappings?.length ?? 0;
  return { ok: true, mapped };
}

async function applyCollisionVolumeToRoot(args?: {
  unitId?: number;
  collisionRadius?: number;
  collisionHeight?: number;
  collisionCenterY?: number;
}): Promise<{ ok: boolean; reason?: string; volume?: Record<string, number> }> {
  const root = findUnitRoot();
  if (!root) return { ok: false, reason: 'unit root not found' };

  let vol = root.getComponent('UnitCollisionVolume');
  if (!vol) {
    vol = root.addComponent('UnitCollisionVolume');
  }
  if (!vol) return { ok: false, reason: 'UnitCollisionVolume missing (script not compiled?)' };

  const unitId = (args?.unitId ?? 0) | 0;
  if (unitId > 0) vol.unitId = unitId;
  if (typeof args?.collisionRadius === 'number') {
    vol.collisionRadius = Math.max(0.05, args.collisionRadius);
  }
  if (typeof args?.collisionHeight === 'number') {
    vol.collisionHeight = Math.max(0.1, args.collisionHeight);
  }
  if (typeof args?.collisionCenterY === 'number') {
    vol.collisionCenterY = args.collisionCenterY;
  }
  vol.showInEditor = true;
  if (typeof vol.applyFromIndex === 'function' && unitId > 0) {
    vol.applyFromIndex({
      unitId,
      collisionRadius: vol.collisionRadius,
      collisionHeight: vol.collisionHeight,
      collisionCenterY: vol.collisionCenterY,
    });
  }

  return {
    ok: true,
    volume: {
      unitId: vol.unitId || unitId,
      collisionRadius: vol.collisionRadius,
      collisionHeight: vol.collisionHeight,
      collisionCenterY: vol.collisionCenterY,
    },
  };
}

async function readCollisionVolumeFromRoot(): Promise<{
  ok: boolean;
  reason?: string;
  volume?: Record<string, number>;
}> {
  const root = findUnitRoot();
  if (!root) return { ok: false, reason: 'unit root not found' };
  const vol = root.getComponent('UnitCollisionVolume');
  if (!vol) return { ok: false, reason: 'UnitCollisionVolume not on root' };
  return {
    ok: true,
    volume: {
      unitId: vol.unitId | 0,
      collisionRadius: vol.collisionRadius,
      collisionHeight: vol.collisionHeight,
      collisionCenterY: vol.collisionCenterY,
    },
  };
}

export const methods = {
  async applyDecorator() {
    try {
      return await applyDecoratorToRoot();
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async applyCollisionVolume(args?: {
    unitId?: number;
    collisionRadius?: number;
    collisionHeight?: number;
    collisionCenterY?: number;
  }) {
    try {
      return await applyCollisionVolumeToRoot(args);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async readCollisionVolume() {
    try {
      return await readCollisionVolumeFromRoot();
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },
};
