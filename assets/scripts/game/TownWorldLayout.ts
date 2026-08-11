import { Node, Sprite, UITransform, Vec3 } from 'cc';
import { NPC_FRAMES } from './NpcFrames';
import { NpcAnimator, NpcDir } from './NpcAnimator';
import { shopByBuilding } from './TownCatalog';

export type TownNpcId = 'mayor' | 'carpenter' | 'passerby';

type NpcSpawn = {
    id: TownNpcId;
    /** World node name: npc_<id> */
    x: number;
    y: number;
    face?: NpcDir;
};

/**
 * Town map constants / interaction queries.
 * Scene authority: assets/scenes/Town.scene (tools/ui/bake_town_scene.py).
 */
export class TownWorldLayout {
    /** South of the plaza fountain, on the stone apron. */
    static readonly PLAYER_SPAWN = { x: 0, y: -96 };

    /**
     * Foot positions for runtime NPC actors (south of building doors / plaza).
     * Mayor lives inside MayorHouse.scene — not outdoors.
     * bld_mayor=(448,740), bld_carpenter=(832,-348), spawn=(0,-96).
     */
    static readonly NPC_SPAWNS: readonly NpcSpawn[] = [
        { id: 'carpenter', x: 832, y: -428, face: 'left' },
        { id: 'passerby', x: 120, y: -40, face: 'left' },
    ];

    static isBaked(world: { getChildByName: (n: string) => unknown }): boolean {
        return !!world.getChildByName('__town_baked');
    }

    /** Spawn idle town NPCs once (idempotent). */
    static spawnNpcs(world: Node): Node[] {
        const out: Node[] = [];
        for (const spawn of this.NPC_SPAWNS) {
            const name = `npc_${spawn.id}`;
            let node = world.getChildByName(name);
            if (!node) {
                node = new Node(name);
                node.layer = world.layer;
                node.setParent(world);
                node.setPosition(new Vec3(spawn.x, spawn.y, 0));

                const ui = node.addComponent(UITransform);
                ui.setContentSize(NPC_FRAMES.cellSize[0], NPC_FRAMES.cellSize[1]);
                ui.setAnchorPoint(0.5, 0);

                const sp = node.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.type = Sprite.Type.SIMPLE;
                sp.trim = false;

                const anim = node.addComponent(NpcAnimator);
                anim.fps = 8;
                const frames = NPC_FRAMES[spawn.id];
                anim.loadWalk(frames);
                if (spawn.face) anim.setDir(spawn.face);
            }
            out.push(node);
        }
        return out;
    }

    /** Fallback chat when story dialogue already played. */
    static npcInfo(
        id: TownNpcId,
    ): { title: string; body: string; storyFlag?: string } | null {
        if (id === 'mayor') {
            return {
                title: '镇长·艾岚',
                body: '先在市集买一卖一，熟了手再谈春厅。溪谷不赶人，但也不养闲人。',
                storyFlag: 'visit_mayor',
            };
        }
        if (id === 'carpenter') {
            return {
                title: '工匠·石楠',
                body: '买卖摸熟了，铜再堆春厅。钉子与南路的事，材料齐了再来找我。',
                storyFlag: 'visit_carpenter',
            };
        }
        if (id === 'passerby') {
            return {
                title: '路人',
                body: '新来的农夫？先去镇长府报个到吧，艾岚镇长这会儿多半在喝茶。',
            };
        }
        return null;
    }

    /**
     * Hit-test a world tap against npc_* feet. Prefer over buildings when close.
     */
    static findNpc(
        world: Node,
        wx: number,
        wy: number,
        maxDist = 72,
    ): { id: TownNpcId; node: Node; key: string } | null {
        let best: { dist: number; id: TownNpcId; node: Node } | null = null;
        for (const child of world.children) {
            if (!child.name.startsWith('npc_')) continue;
            const id = child.name.slice(4) as TownNpcId;
            if (id !== 'mayor' && id !== 'carpenter' && id !== 'passerby') continue;
            const p = child.position;
            const dx = wx - p.x;
            const dy = wy - p.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > maxDist) continue;
            if (!best || d < best.dist) best = { dist: d, id, node: child };
        }
        if (!best) return null;
        return { id: best.id, node: best.node, key: best.id };
    }

    /**
     * Resolve a world-space tap near a town building door/footprint.
     * Returns an action the UI layer should open.
     */
    static findInteract(
        world: Node,
        wx: number,
        wy: number,
        maxDist = 180,
    ):
        | { kind: 'shop'; shopId: string; title: string; key: string }
        | { kind: 'board'; board: 'police' | 'post'; title: string; key: string }
        | { kind: 'info'; title: string; body: string; storyFlag?: string; key: string }
        | { kind: 'travel'; dest: 'farm' | 'mine' | 'mayorHouse'; title: string; key: string }
        | null {
        let best: { dist: number; node: Node; key: string } | null = null;
        for (const child of world.children) {
            const key = this.buildingKey(child.name) ?? this.signKey(child.name);
            if (!key) continue;
            const foot = this.footPoint(child);
            const dx = wx - foot.x;
            const dy = wy - foot.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > maxDist) continue;
            if (!best || d < best.dist) best = { dist: d, node: child, key };
        }
        if (!best) return null;
        const action = this.actionFor(best.key);
        return action ? { ...action, key: best.key } : null;
    }

    private static signKey(name: string): string | null {
        if (name === 'sign_farm') return 'sign_farm';
        if (name === 'sign_mine') return 'sign_mine';
        return null;
    }

    private static buildingKey(name: string): string | null {
        if (name.startsWith('bld_')) return name.slice(4);
        if (name.startsWith('home_')) return 'home';
        // legacy single names
        const civic = [
            'community',
            'seedshop',
            'oreshop',
            'general',
            'police',
            'post',
            'clinic',
            'school',
            'mayor',
            'saloon',
            'fishshop',
            'library',
            'museum',
            'carpenter',
            'chapel',
            'windmill',
            'greenhouse',
        ];
        if (civic.includes(name)) return name;
        return null;
    }

    private static footPoint(node: Node): { x: number; y: number } {
        const p = node.position;
        return { x: p.x, y: p.y };
    }

    private static actionFor(
        key: string,
    ):
        | { kind: 'shop'; shopId: string; title: string }
        | { kind: 'board'; board: 'police' | 'post'; title: string }
        | { kind: 'info'; title: string; body: string; storyFlag?: string }
        | { kind: 'travel'; dest: 'farm' | 'mine' | 'mayorHouse'; title: string }
        | null {
        if (key === 'sign_farm') {
            return { kind: 'travel', dest: 'farm', title: '通往农场' };
        }
        if (key === 'sign_mine') {
            return { kind: 'travel', dest: 'mine', title: '通往浅层矿洞' };
        }
        if (key === 'mayor') {
            return { kind: 'travel', dest: 'mayorHouse', title: '进入镇长府' };
        }
        if (key === 'police') {
            return { kind: 'board', board: 'police', title: '警察局' };
        }
        if (key === 'post') {
            return { kind: 'board', board: 'post', title: '邮局' };
        }
        const shop = shopByBuilding(key);
        if (shop) {
            return { kind: 'shop', shopId: shop.id, title: shop.title };
        }
        const info: Record<
            string,
            { title: string; body: string; storyFlag?: string }
        > = {
            community: {
                title: '社区中心',
                body: '市集买卖熟了之后，再来签春厅收集包。送过铜，第一盏灯就会亮。',
                storyFlag: 'visit_community',
            },
            clinic: {
                title: '微光诊所',
                body: '治疗与草药补给。医生·荷叶说：矿洞潮滑，别逞强。',
                storyFlag: 'visit_clinic',
            },
            school: {
                title: '镇立小学',
                body: '孩子们在这里认字、学农时。午后可以听见铃声。',
            },
            library: {
                title: '图书室',
                body: '收藏物候笔记与旧地图。安静阅读区。',
            },
            museum: {
                title: '溪谷博物室',
                body: '展出矿晶、古物与渔获标本。捐赠系统筹备中。',
            },
            carpenter: {
                title: '木工坊',
                body: '工匠·石楠抬起头：「扩建农舍、修路的事，随时来找我。」',
                storyFlag: 'visit_carpenter',
            },
            chapel: {
                title: '微光小堂',
                body: '北草场尽头的小堂。风铃轻响，有人在这里许愿春耕顺遂。',
            },
            windmill: {
                title: '北坡风车',
                body: '磨坊的风车仍在转。麦香混着花树的味道，从北草场一路飘到广场。',
            },
            greenhouse: {
                title: '果园温室',
                body: '玻璃房里暖着早熟的苗。园丁说：别踩花圃，小路绕着走。',
            },
            home: {
                title: '居民家',
                body: '镇民的小屋。有机会能听到邻里八卦。',
            },
        };
        const hit = info[key];
        if (hit) {
            return {
                kind: 'info',
                title: hit.title,
                body: hit.body,
                storyFlag: hit.storyFlag,
            };
        }
        return null;
    }

    /** Optional: world→UI helper kept here for callers that already have a camera. */
    static worldToScreenDummy(_world: Node, pt: Vec3): Vec3 {
        return pt;
    }

    static nearestDoorHint(world: Node, px: number, py: number): string {
        const npc = this.findNpc(world, px, py, 96);
        if (npc) {
            if (npc.id === 'mayor') return '点击与镇长·艾岚交谈';
            if (npc.id === 'carpenter') return '点击与工匠·石楠交谈';
            if (npc.id === 'passerby') return '点击与路人交谈';
        }
        const hit = this.findInteract(world, px, py, 160);
        if (!hit) return '';
        if (hit.kind === 'shop') return `点击进入 ${hit.title}`;
        if (hit.kind === 'board') return `点击查看 ${hit.title}任务`;
        if (hit.kind === 'travel') return `点击${hit.title}`;
        return `点击了解 ${hit.title}`;
    }
}
