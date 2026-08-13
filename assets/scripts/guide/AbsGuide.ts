import { GuideAim, GuideAimHost, GuideDecorKind, GuidePlotKind } from './GuideAim';

/**
 * 引导图基类。导出类 TsGuide* 继承本类；由 GuideRuntime 每帧调用 resolve()。
 * Flow 节点为 sync：Try* 命中则 setAim 并走「已瞄准」，否则走「未命中」继续链。
 */
export class AbsGuide {
    public readonly guideId: number = 0;

    protected host: GuideAimHost | null = null;
    private _aim: GuideAim | null = null;

    public bind(host: GuideAimHost): void {
        this.host = host;
    }

    /** Clear aim, run onResolve graph, return first set aim (or null). */
    public resolve(): GuideAim | null {
        this._aim = null;
        try {
            this.onResolve();
        } catch (e) {
            console.error(`[AbsGuide:${this.guideId}] onResolve failed`, e);
            this._aim = null;
        }
        return this._aim;
    }

    protected onResolve(): void {
        // exported graphs override
    }

    protected setAim(aim: GuideAim | null): boolean {
        if (!aim || this._aim) return false;
        this._aim = aim;
        return true;
    }

    protected guideDebugLog(message: string): void {
        console.log(`[TsGuide:${this.guideId}] ${message}`);
    }

    protected tryBagToHotbar(
        itemId: string,
        opts?: { ensureHoe?: boolean; openTip?: string },
    ): boolean {
        return this.setAim(this.host?.resolveBagToHotbar(itemId, opts) ?? null);
    }

    protected trySelectTool(tool: string): boolean {
        return this.setAim(this.host?.resolveSelectTool(tool) ?? null);
    }

    protected tryOpenBag(tip: string): boolean {
        return this.setAim(this.host?.resolveOpenBag(tip) ?? null);
    }

    protected tryWorldPlot(plot: string, tip: string): boolean {
        return this.setAim(this.host?.resolveWorldPlot(plot as GuidePlotKind, tip) ?? null);
    }

    protected tryWorldDecor(kind: string, tip: string): boolean {
        return this.setAim(this.host?.resolveWorldDecor(kind as GuideDecorKind, tip) ?? null);
    }

    protected tryWorldNode(nodeName: string, tip: string, placeRipple: boolean): boolean {
        return this.setAim(this.host?.resolveWorldNode(nodeName, tip, placeRipple) ?? null);
    }

    protected tryFish(): boolean {
        return this.setAim(this.host?.resolveFish() ?? null);
    }

    protected tryCraftBench(): boolean {
        return this.setAim(this.host?.resolveCraftBench() ?? null);
    }

    protected tryHarvestBoost(): boolean {
        return this.setAim(this.host?.resolveHarvestBoost() ?? null);
    }

    protected tryHintFarm(): boolean {
        return this.setAim(this.host?.resolveHintFarm() ?? null);
    }

    protected tryTownGate(): boolean {
        return this.setAim(this.host?.resolveTownGate() ?? null);
    }

    protected tryMayor(): boolean {
        return this.setAim(this.host?.resolveMayor() ?? null);
    }

    protected tryTownOutdoor(namesCsv: string, nearTip: string, farTip: string): boolean {
        return this.setAim(this.host?.resolveTownOutdoor(namesCsv, nearTip, farTip) ?? null);
    }

    protected tryIndoorOrDoor(opts: {
        indoorName: string;
        doorName: string;
        indoorTip: string;
        doorTip: string;
        farTip: string;
    }): boolean {
        return this.setAim(this.host?.resolveIndoorOrDoor(opts) ?? null);
    }

    protected tryMineCopper(): boolean {
        return this.setAim(this.host?.resolveMineCopper() ?? null);
    }

    protected aimQuestDock(tip: string): void {
        this.setAim(this.host?.resolveQuestDock(tip) ?? null);
    }
}
