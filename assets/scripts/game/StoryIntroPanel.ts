import {
    _decorator,
    Color,
    Component,
    EventMouse,
    EventTouch,
    Graphics,
    Input,
    Label,
    Node,
    Prefab,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    assetManager,
    input,
    instantiate,
    sys,
    tween,
    Tween,
} from 'cc';
import { clientToUiLocation, DESIGN_H, DESIGN_W, portraitVisibleSize } from './PortraitFit';
import { InputBridge } from './InputBridge';
import { StoryIntroAudio } from './StoryIntroAudio';
import { STORY_INTRO_FRAMES } from './StoryIntroFrames';
import {
    STORY_INTRO_PANEL_LAYOUT as L,
    STORY_INTRO_PANEL_PREFAB_UUID,
} from './StoryIntroPanelFrames';
import { playUiClick } from './UiAudio';
import { UI_CREAM, UI_STROKE, applyDialogueChrome, applyWoodButton } from './UiChrome';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

export type StoryIntroPage = {
    /** SpriteFrame uuid (@f9941). */
    uuid: string;
    text: string;
};

/** Characters per second — slow, breathable prologue. */
const TYPE_CPS = 7;
const FADE_OUT = 0.12;
/** Short guard — long enough to ignore the open gesture, short enough for snappy taps. */
const INPUT_GUARD_SEC = 0.28;
const PAGE_CROSS = 0.18;

const HUD_CHROME = [
    'FarmHotbar',
    'QuestHud',
    'QuestTracker',
    'QuestBtn',
    'FarmActionHint',
    'FarmToolTip',
    'FarmActionBtn',
    'FarmUseBtn',
    'TouchControls',
    'StickVisual',
    'DialogueBox',
    'QuestPanel',
    'RewardPopup',
    'GmChip',
    'GmDimmer',
    'GmPanel',
];

/** Default origin prologue — illustration + typewriter narration. */
/**
 * @deprecated Prologue copy lives in Luban `chat.xlsx` (dialogue_id=10001).
 * Kept as empty fallback — callers should pass pages from `getIntroPages()`.
 */
export const ORIGIN_STORY_PAGES: StoryIntroPage[] = [];

/**
 * Full-screen story comic: illustration + typewriter caption.
 * Tap while typing → reveal full line; tap when done → next page.
 */
@ccclass('StoryIntroPanel')
export class StoryIntroPanel extends Component {
    private _root: Node | null = null;
    private _rootOp: UIOpacity | null = null;
    private _art: Sprite | null = null;
    private _artOp: UIOpacity | null = null;
    private _bodyLab: Label | null = null;
    private _hintRoot: Node | null = null;
    private _hintLab: Label | null = null;
    private _hintArrow: Node | null = null;
    private _hintOp: UIOpacity | null = null;
    private _hintBaseY = L.hintY;
    private _arrowBaseY = L.arrowY;
    private _skipBtn: Node | null = null;
    private _skipLab: Label | null = null;
    private _ready = false;

    private _pages: StoryIntroPage[] = [];
    private _index = 0;
    private _fullText = '';
    private _typed = 0;
    private _typing = false;
    private _onDone: (() => void) | null = null;
    private _open = false;
    private _inputReady = false;
    /** Wall-clock open time — scheduleOnce can miss on web-mobile; see tryAdvance. */
    private _openedAt = 0;
    private _listening = false;
    private _busy = false;
    private _lastAdvanceAt = 0;
    /** After Skip, ignore trailing DOM/engine ups that would call tryAdvance. */
    private _skipGuardUntil = 0;
    private _prevBlocking = false;
    private _prevMoveLocked = false;
    private _chromeWas = new Map<string, boolean>();
    private _fontReady = false;
    private _pending: { pages: StoryIntroPage[]; onDone?: () => void } | null = null;
    private _sfCache = new Map<string, SpriteFrame>();
    private _audio = new StoryIntroAudio();

    get isOpen() {
        return this._open;
    }

    /**
     * True while the cover is still on screen (including skip fade-out).
     * TutorialGuide must gate on this — skip clears moveLocked before the fade ends.
     */
    get isCovering() {
        return this._open || !!(this._root?.isValid && this._root.active);
    }

    /** GM / skip: close immediately without running the play `onDone` callback. */
    forceClose() {
        this._pending = null;
        this._onDone = null;
        this._pages = [];
        this._index = 0;
        this._busy = false;
        this.stopTypewriter();
        // Keep calm piano looping into the farm / main scene.
        this._audio.continueCalm();
        if (this._open) this.hide();
    }

    /** Farm / mine → calm piano; town → Unravel hub BGM. */
    syncMapBgm(map: 'farm' | 'town' | 'mine') {
        this._audio.attach(this.node);
        this._audio.playMapBed(map);
    }

    onLoad() {
        this.loadPrefab();
        this._audio.attach(this.node);
        void this._audio.preload();
        loadUiFont().then(() => {
            this.applyFonts();
            this._fontReady = true;
            this.flushPending();
        });
    }

    /**
     * Snap to a full opaque cover and wait for page-0 art.
     * Used while LoadingScreen is still up so lifting the gate never flashes the farm.
     */
    async ensureCovered(timeoutMs = 2500): Promise<void> {
        if (!this._open || !this._root?.isValid) return;
        if (this._rootOp) {
            Tween.stopAllByTarget(this._rootOp);
            this._rootOp.opacity = 255;
        }
        if (this._artOp) {
            Tween.stopAllByTarget(this._artOp);
            this._artOp.opacity = 255;
        }
        this._root.active = true;
        this.ensureChromeHidden();
        this.bringToFront();
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            if (this._art?.spriteFrame) return;
            await new Promise<void>((r) => setTimeout(r, 32));
        }
    }

    onDestroy() {
        this.stopTypewriter();
        this.unlisten();
        this.unschedule(this.enableInput);
        this.unschedule(this.typeTick);
        this._audio.dispose();
        if (this._open) {
            this.restoreChrome();
            InputBridge.uiBlocking = this._prevBlocking;
            InputBridge.moveLocked = this._prevMoveLocked;
        }
    }

    update() {
        if (!this._open) return;
        this.ensureChromeHidden();
        this.layoutArt();
        this.bringToFront();
    }

    /** Play prologue pages (from Luban chat rows via getIntroPages). */
    play(pages?: StoryIntroPage[], onDone?: () => void) {
        const list = pages?.length ? pages : ORIGIN_STORY_PAGES;
        if (!list.length) {
            onDone?.();
            return;
        }
        // Font is warm after AssetWarmup — don't defer cover (avoids gate→farm flash).
        if (!this._fontReady) {
            void loadUiFont().then(() => {
                this._fontReady = true;
                this.applyFonts();
                this.flushPending();
            });
        }
        if (!this._ready || !this._fontReady) {
            this._pending = { pages: list, onDone };
            return;
        }
        this.beginPlay(list, onDone);
    }

    private flushPending() {
        if (!this._ready || !this._fontReady || !this._pending) return;
        const pending = this._pending;
        this._pending = null;
        this.beginPlay(pending.pages, pending.onDone);
    }

    /**
     * From GameBootstrap stick.onTap — advance + consume while open.
     * Debounced tryAdvance merges with global mouse/touch listeners.
     */
    handleTap(uiX: number, uiY: number): boolean {
        // Fade-out still covers the farm — swallow the trailing skip/advance tap.
        if (!this._open) return this.isCovering;
        if (this.hitSkip(uiX, uiY)) {
            this.skip();
            return true;
        }
        this.tryAdvance();
        return true;
    }

    private beginPlay(pages: StoryIntroPage[], onDone?: () => void) {
        if (this._open) {
            const prev = this._onDone;
            this._onDone = null;
            prev?.();
        }
        this._pages = pages;
        this._index = 0;
        this._onDone = onDone ?? null;
        this.applyFonts();
        this._audio.attach(this.node);
        this._audio.start();
        this.show();
        void this.showPage(0, true);
    }

    private applyFonts() {
        if (this._bodyLab) applyUiFont(this._bodyLab);
        if (this._hintLab) applyUiFont(this._hintLab);
        if (this._skipLab) applyUiFont(this._skipLab);
        this.ensureBodyLayout();
    }

    private async showPage(index: number, first: boolean) {
        const page = this._pages[index];
        if (!page) return;
        this._index = index;
        this._fullText = page.text;
        this._typed = 0;
        this.stopTypewriter();
        if (this._bodyLab) this._bodyLab.string = '';
        if (this._hintLab) this._hintLab.string = '…';
        this.setHintVisible(false);

        const sf = await this.loadSf(page.uuid);
        if (!this._open || this._index !== index) return;
        if (this._art && sf) {
            this._art.spriteFrame = sf;
            this.layoutArt();
        }
        if (!first && this._artOp) {
            this._artOp.opacity = 0;
            tween(this._artOp).to(PAGE_CROSS, { opacity: 255 }).start();
        } else if (this._artOp) {
            this._artOp.opacity = 255;
        }
        this._audio.onPage(index);
        this.startTypewriter();
    }

    private loadSf(uuid: string): Promise<SpriteFrame | null> {
        const hit = this._sfCache.get(uuid);
        if (hit) return Promise.resolve(hit);
        return new Promise((resolve) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (err || !asset) {
                    resolve(null);
                    return;
                }
                const sf = asset as SpriteFrame;
                this._sfCache.set(uuid, sf);
                resolve(sf);
            });
        });
    }

    private startTypewriter() {
        this._typing = true;
        this._typed = 0;
        this.unschedule(this.typeTick);
        // ~TYPE_CPS characters/sec
        this.schedule(this.typeTick, 1 / TYPE_CPS);
        this.typeTick();
    }

    private stopTypewriter() {
        this._typing = false;
        this.unschedule(this.typeTick);
    }

    private typeTick = () => {
        if (!this._open || !this._typing) return;
        this._typed = Math.min(this._fullText.length, this._typed + 1);
        if (this._bodyLab) {
            this._bodyLab.string = this._fullText.slice(0, this._typed);
            this.ensureBodyLayout();
        }
        if (this._typed >= this._fullText.length) {
            this.stopTypewriter();
            if (this._hintLab) this._hintLab.string = '点击继续';
            this.setHintVisible(true);
            this.startHintPulse();
        }
    };

    private revealAll() {
        this.stopTypewriter();
        this._typed = this._fullText.length;
        if (this._bodyLab) {
            this._bodyLab.string = this._fullText;
            this.ensureBodyLayout();
        }
        if (this._hintLab) this._hintLab.string = '点击继续';
        this.setHintVisible(true);
        this.startHintPulse();
    }

    private tryAdvance() {
        if (!this._open || this._busy) return;
        // Duplicate DOM + engine ups after Skip must not flip the next page.
        if (Date.now() < this._skipGuardUntil) return;
        // scheduleOnce can miss on web-mobile / hot-reload — unlock after guard elapsed.
        if (!this._inputReady) {
            if (Date.now() - this._openedAt < INPUT_GUARD_SEC * 1000) return;
            this.enableInput();
        }
        if (!this._inputReady) return;
        const now = Date.now();
        if (now - this._lastAdvanceAt < 160) return;
        this._lastAdvanceAt = now;
        this._audio.unlockFromGesture();
        playUiClick();

        if (this._typing || this._typed < this._fullText.length) {
            this.revealAll();
            return;
        }

        this._busy = true;
        const next = this._index + 1;
        if (next < this._pages.length) {
            void this.showPage(next, false).finally(() => {
                this._busy = false;
            });
        } else {
            this.finish();
            this._busy = false;
        }
    }

    private finish() {
        const done = this._onDone;
        this._onDone = null;
        this._pages = [];
        this._index = 0;
        this.setHintVisible(false);
        // Keep calm piano looping into the farm / main scene.
        this._audio.continueCalm();
        this.hide(() => done?.());
    }

    /** Top-right skip — same exit as finishing the last page (runs `onDone`). */
    private skip() {
        if (!this._open) return;
        this._busy = false;
        this._skipGuardUntil = Date.now() + 400;
        this.stopTypewriter();
        // Never flash “点击继续” / hint arrow on the way out.
        this.setHintVisible(false);
        this._audio.unlockFromGesture();
        playUiClick();
        this.finish();
    }

    private show() {
        if (!this._open) {
            this._prevBlocking = InputBridge.uiBlocking;
            this._prevMoveLocked = InputBridge.moveLocked;
            InputBridge.uiBlocking = true;
            InputBridge.moveLocked = true;
            InputBridge.clear();
            this._chromeWas.clear();
        }
        this._open = true;
        this._inputReady = false;
        this._openedAt = Date.now();
        this.unschedule(this.enableInput);
        // Listen immediately so top-right Skip works during the advance guard.
        this.listen();
        this.fadeIn();
        this.scheduleOnce(this.enableInput, INPUT_GUARD_SEC);
    }

    private enableInput = () => {
        if (!this._open) return;
        this._inputReady = true;
    };

    private hide(after?: () => void) {
        if (!this._open) {
            after?.();
            return;
        }
        this._open = false;
        this._inputReady = false;
        this.stopTypewriter();
        this.stopHintPulse();
        this.unschedule(this.enableInput);
        this.unlisten();
        // Unlock before fade — mid-fade nested play used to freeze moveLocked.
        const fish = this.node.getComponent('FishingMinigame') as { isOpen?: boolean } | null;
        InputBridge.moveLocked = !!fish?.isOpen;
        const rewardOpen = !!(this.node.getComponent('RewardPopup') as { isOpen?: boolean } | null)
            ?.isOpen;
        const questOpen = !!(this.node.getComponent('QuestPanel') as { isOpen?: boolean } | null)
            ?.isOpen;
        const dialogueOpen = !!(this.node.getComponent('DialoguePanel') as { isOpen?: boolean } | null)
            ?.isOpen;
        InputBridge.uiBlocking = rewardOpen || questOpen || dialogueOpen;
        InputBridge.clear();
        this.fadeOut(() => {
            this.restoreChrome();
            after?.();
        });
    }

    private fadeIn() {
        // Instant cover — boot handoff sits under LoadingScreen; a 0→255 fade would
        // flash the farm when the splash lifts. Later page crosses still tween art.
        if (this._rootOp) {
            Tween.stopAllByTarget(this._rootOp);
            this._rootOp.opacity = 255;
        }
        if (this._root) this._root.active = true;
        this.bringToFront();
        this.ensureChromeHidden();
    }

    private fadeOut(done: () => void) {
        if (this._rootOp) Tween.stopAllByTarget(this._rootOp);
        if (!this._rootOp) {
            this.hideVisualImmediate();
            done();
            return;
        }
        tween(this._rootOp)
            .to(FADE_OUT, { opacity: 0 })
            .call(() => {
                this.hideVisualImmediate();
                done();
            })
            .start();
    }

    private hideVisualImmediate() {
        if (this._rootOp) {
            Tween.stopAllByTarget(this._rootOp);
            this._rootOp.opacity = 0;
        }
        if (this._artOp) Tween.stopAllByTarget(this._artOp);
        if (this._root) this._root.active = false;
    }

    private setHintVisible(on: boolean) {
        if (!on) this.stopHintPulse();
        if (this._hintRoot) this._hintRoot.active = on;
    }

    private startHintPulse() {
        if (!this._hintRoot || !this._hintOp) return;
        this.stopHintPulse();
        this._hintRoot.active = true;
        this._hintOp.opacity = 255;
        this._hintRoot.setPosition(this._hintRoot.position.x, this._hintBaseY, 0);

        tween(this._hintOp)
            .repeatForever(
                tween(this._hintOp).to(0.4, { opacity: 255 }).to(0.4, { opacity: 130 }),
            )
            .start();

        if (this._hintArrow) {
            const ax = this._hintArrow.position.x;
            this._hintArrow.setPosition(ax, this._arrowBaseY, 0);
            tween(this._hintArrow)
                .repeatForever(
                    tween(this._hintArrow)
                        .to(0.38, { position: new Vec3(ax, this._arrowBaseY + 5, 0) })
                        .to(0.38, { position: new Vec3(ax, this._arrowBaseY - 2, 0) }),
                )
                .start();
        }
    }

    private stopHintPulse() {
        if (this._hintOp) Tween.stopAllByTarget(this._hintOp);
        if (this._hintArrow) Tween.stopAllByTarget(this._hintArrow);
        if (this._hintOp) this._hintOp.opacity = 255;
        if (this._hintArrow) {
            this._hintArrow.setPosition(this._hintArrow.position.x, this._arrowBaseY, 0);
        }
        if (this._hintRoot) {
            this._hintRoot.setPosition(this._hintRoot.position.x, this._hintBaseY, 0);
        }
    }

    private ensureChromeHidden() {
        const canvas = this.node;
        for (const name of HUD_CHROME) {
            const n = canvas.getChildByName(name);
            if (!n?.isValid) continue;
            if (!this._chromeWas.has(name)) {
                // Always-on HUD pieces: don't snapshot Loading's temporary hide.
                const alwaysOn = name === 'FarmHotbar' || name === 'StickVisual';
                this._chromeWas.set(name, alwaysOn ? true : n.active);
            }
            if (n.active) n.active = false;
        }
    }

    private restoreChrome() {
        const canvas = this.node;
        for (const [name, was] of this._chromeWas) {
            const n = canvas.getChildByName(name);
            if (n?.isValid) n.active = was;
        }
        this._chromeWas.clear();
        const questUi = this.node.getComponent('QuestPanel') as {
            revealQuestHud?: () => void;
        } | null;
        questUi?.revealQuestHud?.();
        const hud = this.node.getComponent('FarmHUD') as {
            ensureDockVisible?: () => void;
        } | null;
        hud?.ensureDockVisible?.();
        const stick = canvas
            .getChildByName('TouchControls')
            ?.getComponent('TouchJoystick') as { showFixedStick?: () => void } | null;
        stick?.showFixedStick?.();
    }

    private bringToFront() {
        if (this._root?.isValid) this._root.setSiblingIndex(this.node.children.length - 1);
    }

    private listen() {
        if (this._listening) return;
        this._listening = true;
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        // TouchControls is hidden during intro — DOM fallback must live here.
        // Window capture: release outside the canvas still advances.
        if (sys.isBrowser) {
            window.addEventListener('pointerup', this.onDomPointerUp, { passive: true, capture: true });
            window.addEventListener('pointercancel', this.onDomPointerUp, {
                passive: true,
                capture: true,
            });
        }
    }

    private unlisten() {
        if (!this._listening) return;
        this._listening = false;
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        if (sys.isBrowser) {
            window.removeEventListener('pointerup', this.onDomPointerUp, true);
            window.removeEventListener('pointercancel', this.onDomPointerUp, true);
        }
    }

    private onDomPointerUp = (ev: PointerEvent) => {
        if (!this._open) return;
        const ui = clientToUiLocation(ev.clientX, ev.clientY, false);
        if (!ui) return;
        if (this.hitSkip(ui.x, ui.y)) {
            this.skip();
            return;
        }
        this.tryAdvance();
    };

    private onTouchEnd(e: EventTouch) {
        if (!this._open) return;
        e.propagationStopped = true;
        const loc = e.getUILocation();
        if (this.hitSkip(loc.x, loc.y)) {
            this.skip();
            return;
        }
        this.tryAdvance();
    }

    private onMouseUp(e: EventMouse) {
        if (!this._open) return;
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        e.propagationStopped = true;
        const loc = e.getUILocation();
        if (this.hitSkip(loc.x, loc.y)) {
            this.skip();
            return;
        }
        this.tryAdvance();
    }

    /** Same half-extents FarmHUD / TouchJoystick use for UI ↔ canvas-local. */
    private canvasHalf(): { halfW: number; halfH: number } {
        const canvasUi = this.node.getComponent(UITransform);
        const vis = portraitVisibleSize();
        return {
            halfW: (canvasUi?.contentSize.width || vis.width || DESIGN_W) * 0.5,
            halfH: (canvasUi?.contentSize.height || vis.height || DESIGN_H) * 0.5,
        };
    }

    private uiToCanvasLocal(uiX: number, uiY: number): { x: number; y: number } {
        const { halfW, halfH } = this.canvasHalf();
        return { x: uiX - halfW, y: uiY - halfH };
    }

    private hitSkip(uiX: number, uiY: number): boolean {
        if (!this._skipBtn?.isValid || !this._skipBtn.active) return false;
        const ut = this._skipBtn.getComponent(UITransform);
        const canvasUi = this.node.getComponent(UITransform);
        if (!ut || !canvasUi) return false;

        // Prefer world AABB → canvas local (parent offsets / scale safe).
        const pad = 32;
        const w = ut.contentSize.width;
        const h = ut.contentSize.height;
        const ax = ut.anchorX;
        const ay = ut.anchorY;
        const corners = [
            new Vec3(-w * ax, -h * ay, 0),
            new Vec3(w * (1 - ax), -h * ay, 0),
            new Vec3(-w * ax, h * (1 - ay), 0),
            new Vec3(w * (1 - ax), h * (1 - ay), 0),
        ];
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        const world = new Vec3();
        const local = new Vec3();
        for (let i = 0; i < corners.length; i++) {
            ut.convertToWorldSpaceAR(corners[i]!, world);
            canvasUi.convertToNodeSpaceAR(world, local);
            if (local.x < x0) x0 = local.x;
            if (local.y < y0) y0 = local.y;
            if (local.x > x1) x1 = local.x;
            if (local.y > y1) y1 = local.y;
        }
        const p = this.uiToCanvasLocal(uiX, uiY);
        return p.x >= x0 - pad && p.x <= x1 + pad && p.y >= y0 - pad && p.y <= y1 + pad;
    }

    private layoutArt() {
        if (!this._art?.node?.isValid) return;
        const vis = portraitVisibleSize();
        const vw = vis.width || DESIGN_W;
        const vh = vis.height || DESIGN_H;
        // Upper band above the dialogue box.
        const topPad = 40;
        const bottomReserve = L.boxH + 120;
        const maxW = Math.min(vw - 48, 1000);
        const maxH = Math.max(420, vh - bottomReserve - topPad);
        const src = STORY_INTRO_FRAMES.panels[0]?.size ?? [L.artW, L.artH];
        const aspect = src[0] / Math.max(1, src[1]);
        let w = maxW;
        let h = w / aspect;
        if (h > maxH) {
            h = maxH;
            w = h * aspect;
        }
        const ut = this._art.node.getComponent(UITransform);
        ut?.setContentSize(w, h);
        const y = vh * 0.5 - topPad - h * 0.5 - 20;
        this._art.node.setPosition(0, Math.min(220, y - (DESIGN_H - vh) * 0.25), 0);
    }

    private ensureBodyLayout() {
        const n = this._bodyLab?.node;
        if (!n?.isValid) return;
        const ut = n.getComponent(UITransform);
        if (!ut) return;
        ut.setAnchorPoint(0.5, 1);
        if (ut.contentSize.width < L.bodyW) {
            ut.setContentSize(L.bodyW, Math.max(ut.contentSize.height, 150));
        }
    }

    private loadPrefab() {
        const canvas = this.node;
        for (const name of ['StoryIntro', 'StoryIntroPanel']) {
            const old = canvas.getChildByName(name);
            if (old) old.destroy();
        }

        assetManager.loadAny({ uuid: STORY_INTRO_PANEL_PREFAB_UUID }, (err, asset) => {
            if (err || !asset) {
                console.warn('[StoryIntroPanel] prefab missing', err);
                this._ready = true;
                this.flushPending();
                return;
            }
            const inst = instantiate(asset as Prefab);
            inst.name = 'StoryIntro';
            inst.layer = canvas.layer;
            inst.setParent(canvas);
            this._root = inst;
            this.bindRefs(inst);
            this.paintChromeOnce();
            this.hideVisualImmediate();
            this._ready = true;
            this.flushPending();
        });
    }

    private bindRefs(root: Node) {
        this._rootOp = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        const artN = root.getChildByName('Art');
        this._art = artN?.getComponent(Sprite) ?? null;
        this._artOp = artN?.getComponent(UIOpacity) ?? artN?.addComponent(UIOpacity) ?? null;
        if (this._art) {
            this._art.sizeMode = Sprite.SizeMode.CUSTOM;
            this._art.type = Sprite.Type.SIMPLE;
        }
        const caption = root.getChildByName('Caption');
        this._bodyLab = caption?.getChildByName('Body')?.getComponent(Label) ?? null;
        this._hintRoot = caption?.getChildByName('Hint') ?? null;
        this._hintArrow = this._hintRoot?.getChildByName('HintArrow') ?? null;
        this._hintLab = this._hintRoot?.getChildByName('HintLab')?.getComponent(Label) ?? null;
        this._hintOp =
            this._hintRoot?.getComponent(UIOpacity) ?? this._hintRoot?.addComponent(UIOpacity) ?? null;
        this._hintBaseY = L.hintY;
        this._arrowBaseY = L.arrowY;
        this._skipBtn = root.getChildByName('SkipBtn');
        this._skipLab = this._skipBtn?.getChildByName('Label')?.getComponent(Label) ?? null;

        if (this._bodyLab) {
            styleUiLabel(this._bodyLab, {
                size: 34,
                color: new Color(255, 246, 220, 255),
                outline: true,
                outlineWidth: 3,
            });
            this._bodyLab.overflow = Label.Overflow.RESIZE_HEIGHT;
            this._bodyLab.enableWrapText = true;
            this._bodyLab.horizontalAlign = Label.HorizontalAlign.LEFT;
            this._bodyLab.verticalAlign = Label.VerticalAlign.TOP;
            this._bodyLab.lineHeight = 48;
        }
        if (this._hintLab) {
            styleUiLabel(this._hintLab, {
                size: 24,
                color: new Color(255, 230, 150, 255),
                outline: true,
                outlineWidth: 2,
                outlineColor: new Color(60, 36, 12, 255),
            });
            this._hintLab.horizontalAlign = Label.HorizontalAlign.CENTER;
            this._hintLab.verticalAlign = Label.VerticalAlign.CENTER;
            this._hintLab.overflow = Label.Overflow.CLAMP;
            this._hintLab.enableWrapText = false;
        }
        if (this._skipLab) {
            styleUiLabel(this._skipLab, {
                size: 28,
                color: UI_CREAM,
                outline: true,
                outlineWidth: 2,
                outlineColor: UI_STROKE,
            });
            this._skipLab.horizontalAlign = Label.HorizontalAlign.CENTER;
            this._skipLab.verticalAlign = Label.VerticalAlign.CENTER;
        }
        if (this._skipBtn) {
            this._skipBtn.on(Node.EventType.TOUCH_END, this.onSkipNodeTouch, this);
            this._skipBtn.on(Node.EventType.MOUSE_UP, this.onSkipNodeMouse, this);
        }
        if (this._hintRoot) this._hintRoot.active = false;
        this.applyFonts();
    }

    private paintChromeOnce() {
        const root = this._root;
        if (!root) return;
        const veil = root.getChildByName('Veil')?.getComponent(Graphics);
        if (veil) {
            veil.clear();
            veil.fillColor = new Color(8, 10, 18, 255);
            veil.rect(-1200, -1600, 2400, 3200);
            veil.fill();
        }
        const caption = root.getChildByName('Caption');
        if (caption) applyDialogueChrome(caption, L.boxW, L.boxH);

        const ag = this._hintArrow?.getComponent(Graphics);
        if (ag) {
            const gold = new Color(255, 220, 120, 255);
            const edge = new Color(90, 50, 16, 255);
            ag.clear();
            ag.fillColor = edge;
            ag.moveTo(0, -10);
            ag.lineTo(-13, 8);
            ag.lineTo(13, 8);
            ag.close();
            ag.fill();
            ag.fillColor = gold;
            ag.moveTo(0, -7);
            ag.lineTo(-10, 6);
            ag.lineTo(10, 6);
            ag.close();
            ag.fill();
        }

        if (this._skipBtn) applyWoodButton(this._skipBtn, 'on', L.skipW, L.skipH);
    }

    private onSkipNodeTouch = (e: EventTouch) => {
        if (!this._open) return;
        e.propagationStopped = true;
        this.skip();
    };

    private onSkipNodeMouse = (e: EventMouse) => {
        if (!this._open) return;
        if (e.getButton() !== EventMouse.BUTTON_LEFT) return;
        e.propagationStopped = true;
        this.skip();
    };
}
