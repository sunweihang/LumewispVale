import { Node, Sprite, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { NPC_FRAMES } from './NpcFrames';
import { NpcAnimator } from './NpcAnimator';

/**
 * Clinic interior — scene: Clinic.scene (tools/ui/bake_clinic_scene.py).
 */
export class ClinicWorldLayout {
    static readonly PLAYER_SPAWN = { x: 0, y: -2.2 * 64 };
    /** South of bld_clinic foot (384, 484). */
    static readonly TOWN_RETURN = { x: 384, y: 404 };
    static readonly DOCTOR_SPAWN = { x: 1.8 * 64, y: 1.2 * 64 };
    /** South doorway AABB (visual / guide only — travel is tap-driven). */
    static readonly EXIT_ZONE = { x: 0, y: -280, hw: 72, hh: 52 };

    static isBaked(world: { getChildByName: (n: string) => unknown }): boolean {
        return !!world.getChildByName('__clinic_baked');
    }

    static mountExitFx(world: Node): void {
        if ((world as Node & { __clinicExitFx?: boolean }).__clinicExitFx) return;
        (world as Node & { __clinicExitFx?: boolean }).__clinicExitFx = true;
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
        const name = 'npc_doctor';
        let node = world.getChildByName(name);
        if (!node) {
            node = new Node(name);
            node.layer = world.layer;
            node.setParent(world);
            node.setPosition(new Vec3(this.DOCTOR_SPAWN.x, this.DOCTOR_SPAWN.y, 0));

            const ui = node.addComponent(UITransform);
            ui.setContentSize(NPC_FRAMES.cellSize[0], NPC_FRAMES.cellSize[1]);
            ui.setAnchorPoint(0.5, 0);

            const sp = node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.type = Sprite.Type.SIMPLE;
            sp.trim = false;

            const anim = node.addComponent(NpcAnimator);
            anim.fps = 8;
            anim.loadWalk(NPC_FRAMES.doctor);
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
        if (name === 'prop_desk_clinic') return 'desk';
        if (name === 'prop_shelf_meds') return 'shelf';
        if (name === 'prop_tea_clinic') return 'tea';
        return null;
    }

    private static actionFor(
        key: string,
    ):
        | { kind: 'travel'; dest: 'town'; title: string }
        | { kind: 'info'; title: string; body: string }
        | null {
        if (key === 'exit') {
            return { kind: 'travel', dest: 'town', title: '离开诊所' };
        }
        const info: Record<string, { title: string; body: string }> = {
            desk: {
                title: '诊桌',
                body: '听诊器旁摊着脉案。荷叶说：先坐下，别急着下矿。',
            },
            shelf: {
                title: '药柜',
                body: '草药与伤药整齐码着。回头矿洞备一份也不迟。',
            },
            tea: {
                title: '候诊茶几',
                body: '温水杯还冒着热气。诊所里不赶人。',
            },
        };
        const hit = info[key];
        return hit ? { kind: 'info', title: hit.title, body: hit.body } : null;
    }
}
