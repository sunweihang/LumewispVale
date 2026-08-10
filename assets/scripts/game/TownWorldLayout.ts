import { Node, Vec3 } from 'cc';
import { shopByBuilding } from './TownCatalog';

/**
 * Town map constants / interaction queries.
 * Scene authority: assets/scenes/Town.scene (tools/ui/bake_town_scene.py).
 */
export class TownWorldLayout {
    /** South of the plaza fountain, on the stone apron. */
    static readonly PLAYER_SPAWN = { x: 0, y: -96 };

    static isBaked(world: { getChildByName: (n: string) => unknown }): boolean {
        return !!world.getChildByName('__town_baked');
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
        | { kind: 'shop'; shopId: string; title: string }
        | { kind: 'board'; board: 'police' | 'post'; title: string }
        | { kind: 'info'; title: string; body: string }
        | null {
        let best: { dist: number; node: Node } | null = null;
        for (const child of world.children) {
            const key = this.buildingKey(child.name);
            if (!key) continue;
            const foot = this.footPoint(child);
            const dx = wx - foot.x;
            const dy = wy - foot.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > maxDist) continue;
            if (!best || d < best.dist) best = { dist: d, node: child };
        }
        if (!best) return null;
        const key = this.buildingKey(best.node.name)!;
        return this.actionFor(key);
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
        | { kind: 'info'; title: string; body: string }
        | null {
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
        const info: Record<string, { title: string; body: string }> = {
            community: {
                title: '社区中心',
                body: '镇民集会、节庆与公告栏。修复工程尚在筹备中。',
            },
            clinic: {
                title: '微光诊所',
                body: '治疗与草药补给。医生说：先别在矿洞里逞强。',
            },
            school: {
                title: '镇立小学',
                body: '孩子们在这里认字、学农时。午后可以听见铃声。',
            },
            mayor: {
                title: '镇长府',
                body: '镇长的住所与会客厅。有要事可从邮局打听日程。',
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
                body: '家具与农舍扩建订单。工匠今天在打磨桌腿。',
            },
            home: {
                title: '居民家',
                body: '镇民的小屋。有机会能听到邻里八卦。',
            },
        };
        const hit = info[key];
        if (hit) return { kind: 'info', title: hit.title, body: hit.body };
        return null;
    }

    /** Optional: world→UI helper kept here for callers that already have a camera. */
    static worldToScreenDummy(_world: Node, pt: Vec3): Vec3 {
        return pt;
    }

    static nearestDoorHint(world: Node, px: number, py: number): string {
        const hit = this.findInteract(world, px, py, 160);
        if (!hit) return '';
        if (hit.kind === 'shop') return `点击进入 ${hit.title}`;
        if (hit.kind === 'board') return `点击查看 ${hit.title}任务`;
        return `点击了解 ${hit.title}`;
    }
}
