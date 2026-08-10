/**
 * Shallow mine map constants / interaction queries.
 * Scene authority: assets/scenes/Mine.scene (tools/ui/bake_mine_scene.py).
 */
export class MineWorldLayout {
    /** Inside timber mouth chamber (pure underground). */
    static readonly PLAYER_SPAWN = { x: 0, y: -192 };

    /** Town-side portal spawn when returning from mine (near oreshop). */
    static readonly TOWN_RETURN = { x: 8 * 64, y: -2 * 64 - 40 };

    static isBaked(world: { getChildByName: (n: string) => unknown }): boolean {
        return !!world.getChildByName('__mine_baked');
    }

    static findInteract(
        world: { children: ReadonlyArray<{ name: string; position: { x: number; y: number } }> },
        wx: number,
        wy: number,
        maxDist = 160,
    ):
        | { kind: 'travel'; dest: 'town'; title: string }
        | { kind: 'info'; title: string; body: string; storyFlag?: string }
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
        if (name === 'sign_town') return 'sign_town';
        if (name === 'bld_elevator') return 'elevator';
        if (name === 'bld_mine_mouth') return 'mouth';
        if (name === 'bld_sorting') return 'sorting';
        if (name === 'spc_crystal_vein') return 'crystal';
        if (name === 'prop_minecart') return 'cart';
        return null;
    }

    private static actionFor(
        key: string,
    ):
        | { kind: 'travel'; dest: 'town'; title: string }
        | { kind: 'info'; title: string; body: string; storyFlag?: string }
        | null {
        if (key === 'sign_town') {
            return { kind: 'travel', dest: 'town', title: '返回小镇' };
        }
        const info: Record<string, { title: string; body: string; storyFlag?: string }> = {
            elevator: {
                title: '竖井',
                body: '绳梯垂入更深处。博物室说：晶脉未鉴定前，不准下深层。',
            },
            mouth: {
                title: '矿洞入口',
                body: '木梁撑起的洞口。灯火晃着，里面是浅层铜脉。',
                storyFlag: 'enter_mine',
            },
            sorting: {
                title: '分拣台',
                body: '矿脉商会留下的木台。采来的矿石可以在这里清点。',
            },
            crystal: {
                title: '微光晶脉',
                body: '与农场陨石同色的晶簇嵌在岩壁上，轻轻嗡鸣。',
                storyFlag: 'inspect_mine_crystal',
            },
            cart: {
                title: '矿车',
                body: '生锈的铁轨矿车，车厢里还剩几块铜矿渣。',
            },
        };
        const hit = info[key];
        if (!hit) return null;
        return {
            kind: 'info',
            title: hit.title,
            body: hit.body,
            storyFlag: hit.storyFlag,
        };
    }
}
