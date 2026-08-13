/** Canvas-local hollow used by TutorialGuide chevron. */
export type GuideHole = { x: number; y: number; w: number; h: number };
export type GuideWorldPos = { x: number; y: number };

/**
 * Resolved idle aim from a TsGuide graph (or common priority).
 * Mirrors TutorialGuide IdleGuide — presentation stays in TutorialGuide.
 */
export type GuideAim = {
    hole: GuideHole;
    tip: string;
    uiDock: boolean;
    silent?: boolean;
    dragTo?: GuideHole | null;
    dragItem?: string;
    arrowDeg?: number;
    edgeWalk?: boolean;
    groundRipple?: boolean;
    rippleInWorld?: boolean;
    rippleWorld?: GuideWorldPos | null;
    pathWorld?: GuideWorldPos | null;
};

export type GuidePlotKind = 'soil' | 'tilled' | 'water' | 'grow' | 'harvest';
export type GuideDecorKind = 'grass' | 'rock' | 'tree' | 'copper';

/** World / HUD helpers implemented by TutorialGuide for AbsGuide try* nodes. */
export interface GuideAimHost {
    resolveBagToHotbar(
        itemId: string,
        opts?: { ensureHoe?: boolean; openTip?: string },
    ): GuideAim | null;
    resolveSelectTool(tool: string): GuideAim | null;
    resolveOpenBag(tip: string): GuideAim | null;
    resolveWorldPlot(plot: GuidePlotKind, tip: string): GuideAim | null;
    resolveWorldDecor(kind: GuideDecorKind, tip: string): GuideAim | null;
    resolveWorldNode(nodeName: string, tip: string, placeRipple: boolean): GuideAim | null;
    resolveFish(): GuideAim | null;
    resolveCraftBench(): GuideAim | null;
    resolveHarvestBoost(): GuideAim | null;
    resolveHintFarm(): GuideAim | null;
    resolveTownGate(): GuideAim | null;
    resolveMayor(): GuideAim | null;
    resolveTownOutdoor(namesCsv: string, nearTip: string, farTip: string): GuideAim | null;
    resolveIndoorOrDoor(opts: {
        indoorName: string;
        doorName: string;
        indoorTip: string;
        doorTip: string;
        farTip: string;
    }): GuideAim | null;
    resolveMineCopper(): GuideAim | null;
    resolveQuestDock(tip: string): GuideAim | null;
    /**
     * Journal / shop / claim / craft-open / recipe-learn — before per-goto graph.
     * - `{ kind:'aim' }` use this aim
     * - `{ kind:'suppress' }` hide arrow (do not run goto graph)
     * - `{ kind:'continue' }` fall through to TsGuide
     */
    resolveCommonPriority(): GuideCommonResult;
}

export type GuideCommonResult =
    | { kind: 'aim'; aim: GuideAim }
    | { kind: 'suppress' }
    | { kind: 'continue' };
