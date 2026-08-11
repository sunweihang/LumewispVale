import { Node, Sprite, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { NPC_FRAMES } from './NpcFrames';
import { NpcAnimator } from './NpcAnimator';

/**
 * Carpenter workshop interior — scene: CarpenterShop.scene
 * (tools/ui/bake_carpenter_shop_scene.py).
 */
export class CarpenterShopWorldLayout {
    static readonly PLAYER_SPAWN = { x: 0, y: -2.2 * 64 };
    /** South of bld_carpenter foot (832, -348). */
    static readonly TOWN_RETURN = { x: 832, y: -428 };
    static readonly CARPENTER_SPAWN = { x: 1.5 * 64, y: 1.15 * 64 };
    static readonly EXIT_ZONE = { x: 0, y: -280, hw: 72, hh: 52 };

    static isBaked(world: { getChildByName: (n: string) => unknown }): boolean {
        return !!world.getChildByName('__carpenter_shop_baked');
    }

    static inExitZone(x: number, y: number): boolean {
        const z = this.EXIT_ZONE;
        return Math.abs(x - z.x) <= z.hw && Math.abs(y - z.y) <= z.hh;
    }

    static mountExitFx(world: Node): void {
        if ((world as Node & { __carpenterShopExitFx?: boolean }).__carpenterShopExitFx) return;
        (world as Node & { __carpenterShopExitFx?: boolean }).__carpenterShopExitFx = true;
        const glow = world.getChildByName('exit_floor_glow');
        if (!glow?.isValid) return;
        let op = glow.getComponent(UIOpacity);
        if (!op) op = glow.addComponent(UIOpacity);
        op.opacity = 170;
        tween(op)
            .repeatForever(
                tween(op)
                    .to(1.8, { opacity: 110 }, { easing: 'sineInOut' })
                    .to(1.8, { opacity: 170 }, { easing: 'sineInOut' }),
            )
            .start();
    }

    static spawnNpcs(world: Node): Node[] {
        const name = 'npc_carpenter';
        let node = world.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = world.layer;
            node.setParent(world);
            node.setPosition(new Vec3(this.CARPENTER_SPAWN.x, this.CARPENTER_SPAWN.y, 0));

            const ui = node.addComponent(UITransform);
            ui.setContentSize(NPC_FRAMES.cellSize[0], NPC_FRAMES.cellSize[1]);
            ui.setAnchorPoint(0.5, 0);

            const sp = node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.trim = false;

            const anim = node.addComponent(NpcAnimator);
            anim.fps = 8;
            anim.loadWalk(NPC_FRAMES.carpenter);
            anim.setDir('down');
        }
        return [node];
    }

    static findInteract(
        world: Node,
        wx: number,
        wy: number,
    ): { kind: 'info'; title: string; body: string; node: Node } | null {
        let best: { area: number; key: string; node: Node } | null = null;
        const pad = 8;
        for (const child of world.children) {
            const key = this.interactKey(child.name);
            if (!key) continue;
            const ui = child.getComponent(UITransform);
            if (!ui) continue;
            const w = ui.contentSize.width;
            const h = ui.contentSize.height;
            if (w <= 0 || h <= 0) continue;
            const p = child.position;
            const left = p.x - w * ui.anchorX - pad;
            const right = p.x + w * (1 - ui.anchorX) + pad;
            const bottom = p.y - h * ui.anchorY - pad;
            const top = p.y + h * (1 - ui.anchorY) + pad;
            if (wx < left || wx > right || wy < bottom || wy > top) continue;
            const area = w * h;
            if (!best || area < best.area) best = { area, key, node: child };
        }
        if (!best) return null;
        const action = this.actionFor(best.key);
        return action ? { ...action, node: best.node } : null;
    }

    private static interactKey(name: string): string | null {
        if (name === 'prop_workbench') return 'bench';
        if (name === 'prop_shelf_tools') return 'shelf';
        if (name === 'prop_crate_nails') return 'nails';
        return null;
    }

    private static actionFor(key: string): { kind: 'info'; title: string; body: string } | null {
        const info: Record<string, { title: string; body: string }> = {
            bench: {
                title: '工作台',
                body: '刨花与粉笔线。石楠量尺寸从不含糊。',
            },
            shelf: {
                title: '工具架',
                body: '锤子、墨斗、一盒生锈的旧钉——新钉另说。',
            },
            nails: {
                title: '钉箱',
                body: '木工坊的硬通货。南路修好之前，先攒着。',
            },
        };
        const hit = info[key];
        return hit ? { kind: 'info', title: hit.title, body: hit.body } : null;
    }
}
