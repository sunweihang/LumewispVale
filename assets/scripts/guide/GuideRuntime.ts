import { GuideAim, GuideAimHost } from './GuideAim';
import { AbsGuide } from './AbsGuide';
import { createTsGuide } from './generated/TsGuideClassMap';

/**
 * 引导图运行时：按 gotoId 取 TsGuide，每帧 resolve。
 * 公共优先级（日志/商店/领奖…）仍走 host.resolveCommonPriority。
 */
export class GuideRuntime {
    private static _inst: GuideRuntime | null = null;
    private readonly _cache = new Map<number, AbsGuide>();

    static get Inst(): GuideRuntime {
        if (!this._inst) this._inst = new GuideRuntime();
        return this._inst;
    }

    /** True when a TsGuide class exists for this goto id. */
    hasGuide(guideId: number): boolean {
        if (guideId <= 0) return false;
        if (this._cache.has(guideId)) return true;
        return createTsGuide(guideId) != null;
    }

    getGuide(guideId: number): AbsGuide | null {
        if (guideId <= 0) return null;
        let g = this._cache.get(guideId) ?? null;
        if (g) return g;
        g = createTsGuide(guideId);
        if (!g) return null;
        this._cache.set(guideId, g);
        return g;
    }

    /**
     * Resolve idle aim for the active quest goto.
     * Returns undefined only when no graph is registered (caller may legacy-fallback).
     * Returns null when suppressed or the graph produced no aim.
     */
    resolveGoto(host: GuideAimHost, gotoId: number): GuideAim | null | undefined {
        const common = host.resolveCommonPriority();
        if (common.kind === 'aim') return common.aim;
        if (common.kind === 'suppress') return null;

        const guide = this.getGuide(gotoId);
        if (!guide) return undefined;
        guide.bind(host);
        return guide.resolve();
    }
}
