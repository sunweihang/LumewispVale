import { Node, Sprite, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { NPC_FRAMES } from './NpcFrames';
import { NpcAnimator } from './NpcAnimator';

/**
 * Mayor house interior constants / interaction queries.
 * Scene authority: assets/scenes/MayorHouse.scene (tools/ui/bake_mayor_house_scene.py).
 */
export class MayorHouseWorldLayout {
    /** Just inside the south door. */
    static readonly PLAYER_SPAWN = { x: 0, y: -2.2 * 64 };

    /** Town-side spawn when leaving (south of bld_mayor door). */
    static readonly TOWN_RETURN = { x: 448, y: 640 };

    /** Mayor stands by the desk (NE of room). */
    static readonly MAYOR_SPAWN = { x: 1.6 * 64, y: 1.35 * 64 };

    /** South doorway AABB (visual / guide only — travel is tap-driven). */
    static readonly EXIT_ZONE = { x: 0, y: -280, hw: 72, hh: 52 };

    static isBaked(world: { getChildByName: (n: string) => unknown }): boolean {
        return !!world.getChildByName('__mayor_house_baked');
    }

    /** Soft breathe on the doorway floor sheen (idempotent). */
    static mountExitFx(world: Node): void {
        if ((world as Node & { __mayorExitFx?: boolean }).__mayorExitFx) return;
        (world as Node & { __mayorExitFx?: boolean }).__mayorExitFx = true;

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

    /** Spawn mayor NPC once (idempotent). */
    static spawnNpcs(world: Node): Node[] {
        const name = 'npc_mayor';
        let node = world.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = world.layer;
            node.setParent(world);
            node.setPosition(new Vec3(this.MAYOR_SPAWN.x, this.MAYOR_SPAWN.y, 0));

            const ui = node.addComponent(UITransform);
            ui.setContentSize(NPC_FRAMES.cellSize[0], NPC_FRAMES.cellSize[1]);
            ui.setAnchorPoint(0.5, 0);

            const sp = node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.trim = false;

            const anim = node.addComponent(NpcAnimator);
            anim.fps = 8;
            anim.loadWalk(NPC_FRAMES.mayor);
            anim.setDir('down');
        }
        return [node];
    }

    static findInteract(
        world: Node,
        wx: number,
        wy: number,
    ):
        | { kind: 'travel'; dest: 'town'; title: string; node: Node }
        | { kind: 'info'; title: string; body: string; node: Node }
        | null {
        // Sprite AABB hit (not a loose radius) so open floor stays click-to-move.
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
        if (name === 'door_exit' || name === 'exit_floor_glow') return 'exit';
        if (name === 'prop_desk_mayor') return 'desk';
        if (name === 'prop_tea_table') return 'tea';
        if (name === 'prop_bookshelf') return 'shelf';
        return null;
    }

    private static actionFor(
        key: string,
    ):
        | { kind: 'travel'; dest: 'town'; title: string }
        | { kind: 'info'; title: string; body: string }
        | null {
        if (key === 'exit') {
            return { kind: 'travel', dest: 'town', title: '离开镇长府' };
        }
        const info: Record<string, { title: string; body: string }> = {
            desk: {
                title: '镇长办公桌',
                body: '摊开的镇务卷宗与一盏微光台灯。艾岚的笔迹很稳。',
            },
            tea: {
                title: '茶几',
                body: '热茶还冒着气。镇长说：客来了，先坐会儿。',
            },
            shelf: {
                title: '书架',
                body: '物候册、旧地图和一摞盖章的定居许可。',
            },
        };
        const hit = info[key];
        if (!hit) return null;
        return { kind: 'info', title: hit.title, body: hit.body };
    }
}
