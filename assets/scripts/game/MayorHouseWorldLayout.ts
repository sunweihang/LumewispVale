import { Node, Sprite, UITransform, Vec3 } from 'cc';
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

    static isBaked(world: { getChildByName: (n: string) => unknown }): boolean {
        return !!world.getChildByName('__mayor_house_baked');
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
        world: { children: ReadonlyArray<{ name: string; position: { x: number; y: number } }> },
        wx: number,
        wy: number,
        maxDist = 140,
    ):
        | { kind: 'travel'; dest: 'town'; title: string }
        | { kind: 'info'; title: string; body: string }
        | null {
        let best: { dist: number; key: string } | null = null;
        for (const child of world.children) {
            const key = this.interactKey(child.name);
            if (!key) continue;
            const dx = wx - child.position.x;
            const dy = wy - child.position.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > maxDist) continue;
            if (!best || d < best.dist) best = { dist: d, key };
        }
        if (!best) return null;
        return this.actionFor(best.key);
    }

    private static interactKey(name: string): string | null {
        if (name === 'door_exit') return 'door_exit';
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
        if (key === 'door_exit') {
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
