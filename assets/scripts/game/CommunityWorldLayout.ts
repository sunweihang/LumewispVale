import { Node, Sprite, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { NPC_FRAMES } from './NpcFrames';
import { NpcAnimator } from './NpcAnimator';

/**
 * Community hall interior — scene: Community.scene (tools/ui/bake_community_scene.py).
 */
export class CommunityWorldLayout {
    static readonly PLAYER_SPAWN = { x: 0, y: -2.2 * 64 };
    /** South of bld_community foot (0, 740). */
    static readonly TOWN_RETURN = { x: 0, y: 660 };
    static readonly CARETAKER_SPAWN = { x: -1.4 * 64, y: 1.1 * 64 };
    static readonly EXIT_ZONE = { x: 0, y: -280, hw: 72, hh: 52 };

    static isBaked(world: { getChildByName: (n: string) => unknown }): boolean {
        return !!world.getChildByName('__community_baked');
    }

    static inExitZone(x: number, y: number): boolean {
        const z = this.EXIT_ZONE;
        return Math.abs(x - z.x) <= z.hw && Math.abs(y - z.y) <= z.hh;
    }

    static mountExitFx(world: Node): void {
        if ((world as Node & { __communityExitFx?: boolean }).__communityExitFx) return;
        (world as Node & { __communityExitFx?: boolean }).__communityExitFx = true;
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
        const name = 'npc_caretaker';
        let node = world.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = world.layer;
            node.setParent(world);
            node.setPosition(new Vec3(this.CARETAKER_SPAWN.x, this.CARETAKER_SPAWN.y, 0));

            const ui = node.addComponent(UITransform);
            ui.setContentSize(NPC_FRAMES.cellSize[0], NPC_FRAMES.cellSize[1]);
            ui.setAnchorPoint(0.5, 0);

            const sp = node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.trim = false;

            const anim = node.addComponent(NpcAnimator);
            anim.fps = 8;
            anim.loadWalk(NPC_FRAMES.caretaker);
            anim.setDir('down');
        }
        return [node];
    }

    static findInteract(
        world: Node,
        wx: number,
        wy: number,
    ):
        | { kind: 'story'; storyKey: 'spring_desk' | 'spring_lamp'; node: Node }
        | { kind: 'info'; title: string; body: string; node: Node }
        | null {
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
        if (name === 'prop_spring_desk') return 'spring_desk';
        if (name === 'prop_spring_lamp') return 'spring_lamp';
        if (name === 'prop_bookshelf_hall') return 'shelf';
        if (name === 'prop_bench_w' || name === 'prop_bench_e') return 'bench';
        return null;
    }

    private static actionFor(
        key: string,
    ):
        | { kind: 'story'; storyKey: 'spring_desk' | 'spring_lamp' }
        | { kind: 'info'; title: string; body: string }
        | null {
        if (key === 'spring_desk') return { kind: 'story', storyKey: 'spring_desk' };
        if (key === 'spring_lamp') return { kind: 'story', storyKey: 'spring_lamp' };
        const info: Record<string, { title: string; body: string }> = {
            shelf: {
                title: '厅务书架',
                body: '旧物候册与工程草图。苔青说：别乱翻镇长的字条。',
            },
            bench: {
                title: '长椅',
                body: '木漆斑驳。等春厅亮起来，或许会坐满人。',
            },
        };
        const hit = info[key];
        return hit ? { kind: 'info', title: hit.title, body: hit.body } : null;
    }
}
