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
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    assetManager,
    input,
    tween,
    Tween,
} from 'cc';
import { DESIGN_H, DESIGN_W, portraitVisibleSize } from './PortraitFit';
import { InputBridge } from './InputBridge';
import { StoryIntroAudio } from './StoryIntroAudio';
import { STORY_INTRO_FRAMES } from './StoryIntroFrames';
import { playUiClick } from './UiAudio';
import { UI_CREAM, UI_STROKE, drawDialogueChrome, drawWoodButton } from './UiChrome';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

export type StoryIntroPage = {
    /** SpriteFrame uuid (@f9941). */
    uuid: string;
    text: string;
};

/** Match DialoguePanel chrome exactly. */
const BOX_W = 1000;
const BOX_H = 260;
const BOX_Y = -780;
/** Characters per second — slow, breathable prologue. */
const TYPE_CPS = 7;
const FADE_IN = 0.18;
const FADE_OUT = 0.12;
const INPUT_GUARD_SEC = FADE_IN + 0.35;
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
    'RewardDimmer',
    'GmChip',
    'GmPanel',
];

/** Default origin prologue — illustration + typewriter narration. */
export const ORIGIN_STORY_PAGES: StoryIntroPage[] = [
    {
        uuid: STORY_INTRO_FRAMES.panels[0].uuid,
        text: '星海深处，曾有人以身为刃。那一夜，灾兽的阴影覆过诸界——你守住了最后一道光，却没能守住自己的心跳。',
    },
    {
        uuid: STORY_INTRO_FRAMES.panels[1].uuid,
        text: '一拳落处，铠甲如花碎开。痛楚涌上喉间的刹那，名字、故土、所爱之人，都化作镜屑，无声消散。',
    },
    {
        uuid: STORY_INTRO_FRAMES.panels[2].uuid,
        text: '风暴自虚空倾泻而下，裹挟着你坠入未知。意识熄灭前，胸口仍残留一缕微光——像不肯熄灭的执念。',
    },
    {
        uuid: STORY_INTRO_FRAMES.panels[3].uuid,
        text: '再睁眼时，是人间的草香与灯火。溪谷少女露穗在紫晶坠落处扶起你，不问来处，只把你带回窗暖的小屋。',
    },
    {
        uuid: STORY_INTRO_FRAMES.panels[4].uuid,
        text: '伤会愈，土会暖。你与露穗并肩翻垄浇灌，在这片微光溪谷里，把遗忘的人生，重新种成一条路。',
    },
];

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
    private _hintBaseY = 0;
    private _arrowBaseY = 18;
    private _skipBtn: Node | null = null;
    private _skipLab: Label | null = null;

    private _pages: StoryIntroPage[] = [];
    private _index = 0;
    private _fullText = '';
    private _typed = 0;
    private _typing = false;
    private _onDone: (() => void) | null = null;
    private _open = false;
    private _inputReady = false;
    private _listening = false;
    private _busy = false;
    private _lastAdvanceAt = 0;
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
        this.build();
        this.hideVisualImmediate();
        this._audio.attach(this.node);
        void this._audio.preload();
        loadUiFont().then(() => {
            this.applyFonts();
            this._fontReady = true;
            const pending = this._pending;
            this._pending = null;
            if (pending) this.beginPlay(pending.pages, pending.onDone);
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
        this.layoutSkip();
        this.bringToFront();
    }

    /** Play prologue pages (defaults to ORIGIN_STORY_PAGES). */
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
            });
        }
        this.beginPlay(list, onDone);
    }

    /**
     * From GameBootstrap stick.onTap — advance + consume while open.
     * Debounced tryAdvance merges with global mouse/touch listeners.
     */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this._open) return false;
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
        if (!this._open || !this._inputReady || this._busy) return;
        const now = Date.now();
        if (now - this._lastAdvanceAt < 280) return;
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
        // Keep calm piano looping into the farm / main scene.
        this._audio.continueCalm();
        this.hide(() => done?.());
    }

    /** Top-right skip — same exit as finishing the last page (runs `onDone`). */
    private skip() {
        if (!this._open) return;
        this._busy = false;
        this.stopTypewriter();
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
            if (!this._chromeWas.has(name)) this._chromeWas.set(name, n.active);
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
    }

    private bringToFront() {
        if (this._root?.isValid) this._root.setSiblingIndex(this.node.children.length - 1);
    }

    private listen() {
        if (this._listening) return;
        this._listening = true;
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    private unlisten() {
        if (!this._listening) return;
        this._listening = false;
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    private onTouchEnd(e: EventTouch) {
        if (!this._open) return;
        e.propagationStopped = true;
        const loc = e.getUILocation();
        if (this.hitSkip(loc.x, loc.y)) {
            this.skip();
            return;
        }
        if (!this._inputReady) return;
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
        if (!this._inputReady) return;
        this.tryAdvance();
    }

    private hitSkip(uiX: number, uiY: number): boolean {
        if (!this._skipBtn?.isValid || !this._skipBtn.active) return false;
        const ut = this._skipBtn.getComponent(UITransform);
        if (!ut) return false;
        const canvasUt = this.node.getComponent(UITransform);
        const halfW = (canvasUt?.contentSize.width || DESIGN_W) * 0.5;
        const halfH = (canvasUt?.contentSize.height || DESIGN_H) * 0.5;
        const x = uiX - halfW;
        const y = uiY - halfH;
        const p = this._skipBtn.position;
        const hw = ut.contentSize.width * 0.5;
        const hh = ut.contentSize.height * 0.5;
        return Math.abs(x - p.x) <= hw && Math.abs(y - p.y) <= hh;
    }

    private layoutArt() {
        if (!this._art?.node?.isValid) return;
        const vis = portraitVisibleSize();
        const vw = vis.width || DESIGN_W;
        const vh = vis.height || DESIGN_H;
        // Upper band above the dialogue box.
        const topPad = 40;
        const bottomReserve = BOX_H + 120;
        const maxW = Math.min(vw - 48, 1000);
        const maxH = Math.max(420, vh - bottomReserve - topPad);
        const src = STORY_INTRO_FRAMES.panels[0]?.size ?? [720, 1080];
        const aspect = src[0] / Math.max(1, src[1]);
        let w = maxW;
        let h = w / aspect;
        if (h > maxH) {
            h = maxH;
            w = h * aspect;
        }
        const ut = this._art.node.getComponent(UITransform);
        ut?.setContentSize(w, h);
        const y = (vh * 0.5 - topPad) - h * 0.5 - 20;
        this._art.node.setPosition(0, Math.min(220, y - (DESIGN_H - vh) * 0.25), 0);
    }

    private layoutSkip() {
        if (!this._skipBtn?.isValid) return;
        const vis = portraitVisibleSize();
        const vw = vis.width || DESIGN_W;
        const vh = vis.height || DESIGN_H;
        const ut = this._skipBtn.getComponent(UITransform);
        const bw = ut?.contentSize.width ?? 148;
        const bh = ut?.contentSize.height ?? 56;
        const pad = 36;
        this._skipBtn.setPosition(vw * 0.5 - pad - bw * 0.5, vh * 0.5 - pad - bh * 0.5, 0);
    }

    private ensureBodyLayout() {
        const n = this._bodyLab?.node;
        if (!n?.isValid) return;
        const ut = n.getComponent(UITransform);
        if (!ut) return;
        ut.setAnchorPoint(0.5, 1);
        if (ut.contentSize.width < BOX_W - 100) {
            ut.setContentSize(BOX_W - 100, Math.max(ut.contentSize.height, 150));
        }
    }

    private build() {
        const canvas = this.node;
        const old = canvas.getChildByName('StoryIntro');
        if (old) old.destroy();

        const root = new Node('StoryIntro');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
        this._rootOp = root.addComponent(UIOpacity);
        this._rootOp.opacity = 0;
        this._root = root;

        const veilN = new Node('Veil');
        veilN.layer = root.layer;
        veilN.setParent(root);
        veilN.setSiblingIndex(0);
        veilN.addComponent(UITransform).setContentSize(2400, 3200);
        const vg = veilN.addComponent(Graphics);
        vg.fillColor = new Color(8, 10, 18, 255);
        vg.rect(-1200, -1600, 2400, 3200);
        vg.fill();

        const artN = new Node('Art');
        artN.layer = root.layer;
        artN.setParent(root);
        artN.setPosition(0, 180, 0);
        const artUt = artN.addComponent(UITransform);
        artUt.setContentSize(720, 1080);
        artUt.setAnchorPoint(0.5, 0.5);
        const art = artN.addComponent(Sprite);
        art.sizeMode = Sprite.SizeMode.CUSTOM;
        art.type = Sprite.Type.SIMPLE;
        this._art = art;
        this._artOp = artN.addComponent(UIOpacity);
        this._artOp.opacity = 255;

        // Caption chrome — same farm wood band as DialoguePanel.
        const box = new Node('Caption');
        box.layer = root.layer;
        box.setParent(root);
        box.setPosition(0, BOX_Y, 0);
        box.addComponent(UITransform).setContentSize(BOX_W, BOX_H);
        const g = box.addComponent(Graphics);
        const x0 = -BOX_W * 0.5;
        const y0 = -BOX_H * 0.5;
        drawDialogueChrome(g, BOX_W, BOX_H);

        const bodyN = new Node('Body');
        bodyN.layer = root.layer;
        bodyN.setParent(box);
        bodyN.setPosition(0, 96, 0);
        const bodyUt = bodyN.addComponent(UITransform);
        bodyUt.setAnchorPoint(0.5, 1);
        const body = bodyN.addComponent(Label);
        styleUiLabel(body, {
            size: 34,
            color: new Color(255, 246, 220, 255),
            outline: true,
            outlineWidth: 3,
        });
        body.overflow = Label.Overflow.RESIZE_HEIGHT;
        body.enableWrapText = true;
        body.horizontalAlign = Label.HorizontalAlign.LEFT;
        body.verticalAlign = Label.VerticalAlign.TOP;
        body.lineHeight = 48;
        bodyUt.setContentSize(BOX_W - 100, 150);
        this._bodyLab = body;

        const hintRoot = new Node('Hint');
        hintRoot.layer = root.layer;
        hintRoot.setParent(box);
        this._hintBaseY = y0 + 70;
        hintRoot.setPosition(x0 + BOX_W - 118, this._hintBaseY, 0);
        hintRoot.addComponent(UITransform).setContentSize(200, 64);
        this._hintOp = hintRoot.addComponent(UIOpacity);
        this._hintOp.opacity = 255;
        this._hintRoot = hintRoot;

        this._arrowBaseY = 16;
        const arrow = new Node('HintArrow');
        arrow.layer = root.layer;
        arrow.setParent(hintRoot);
        arrow.setPosition(0, this._arrowBaseY, 0);
        arrow.addComponent(UITransform).setContentSize(36, 24);
        const ag = arrow.addComponent(Graphics);
        const gold = new Color(255, 220, 120, 255);
        const edge = new Color(90, 50, 16, 255);
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
        this._hintArrow = arrow;

        const hintN = new Node('HintLab');
        hintN.layer = root.layer;
        hintN.setParent(hintRoot);
        hintN.setPosition(0, -14, 0);
        const hintUt = hintN.addComponent(UITransform);
        const hint = hintN.addComponent(Label);
        styleUiLabel(hint, {
            size: 24,
            color: new Color(255, 230, 150, 255),
            outline: true,
            outlineWidth: 2,
            outlineColor: new Color(60, 36, 12, 255),
        });
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        hint.overflow = Label.Overflow.CLAMP;
        hint.enableWrapText = false;
        hintUt.setContentSize(200, 32);
        hint.string = '点击继续';
        this._hintLab = hint;
        hintRoot.active = false;

        // Top-right skip — wood button matching farm chrome.
        const skipW = 148;
        const skipH = 56;
        const skip = new Node('SkipBtn');
        skip.layer = root.layer;
        skip.setParent(root);
        skip.setSiblingIndex(root.children.length - 1);
        skip.addComponent(UITransform).setContentSize(skipW, skipH);
        const sg = skip.addComponent(Graphics);
        drawWoodButton(sg, skipW, skipH, 'on');

        const skipLabN = new Node('Label');
        skipLabN.layer = root.layer;
        skipLabN.setParent(skip);
        skipLabN.addComponent(UITransform).setContentSize(skipW, skipH);
        const skipLab = skipLabN.addComponent(Label);
        skipLab.string = '跳过';
        skipLab.horizontalAlign = Label.HorizontalAlign.CENTER;
        skipLab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(skipLab, {
            size: 28,
            color: UI_CREAM,
            outline: true,
            outlineWidth: 2,
            outlineColor: UI_STROKE,
        });
        this._skipLab = skipLab;
        this._skipBtn = skip;
        this.layoutSkip();
    }
}
