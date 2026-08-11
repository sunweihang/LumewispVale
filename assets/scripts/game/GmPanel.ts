import {
    _decorator,
    Color,
    Component,
    EventKeyboard,
    Graphics,
    Input,
    KeyCode,
    Label,
    Node,
    UITransform,
    director,
    input,
    view,
} from 'cc';
import { FarmHUD } from './FarmHUD';
import { FarmInfoBoard } from './FarmInfoBoard';
import { FarmSystem } from './FarmSystem';
import { InputBridge } from './InputBridge';
import { travelTo } from './MapTravel';
import { QuestSystem } from './QuestSystem';
import { StoryDialogue } from './StoryDialogue';
import { TownWorldLayout } from './TownWorldLayout';
import { TutorialGuide } from './TutorialGuide';
import { applyUiFont, loadUiFont, styleUiLabel } from './UiFont';

const { ccclass } = _decorator;

type GmBtn = {
    node: Node;
    action: () => void;
};

type GmTabId = 'time' | 'quest' | 'system';

type GmTabDef = {
    id: GmTabId;
    label: string;
};

const GM_TABS: GmTabDef[] = [
    { id: 'time', label: '时间' },
    { id: 'quest', label: '任务' },
    { id: 'system', label: '系统' },
];

/**
 * Dev / GM overlay: farm clock, skip newbie tutorial, jump quest lines.
 * Toggle: F1 or ` · Esc closes · small GM chip stays on-screen.
 */
@ccclass('GmPanel')
export class GmPanel extends Component {
    infoBoard: FarmInfoBoard | null = null;

    private _open = false;
    private _prevBlocking = false;
    private _chip: Node | null = null;
    private _root: Node | null = null;
    private _clockLab: Label | null = null;
    private _dateLab: Label | null = null;
    private _pauseLab: Label | null = null;
    private _btns: GmBtn[] = [];
    private _chipHit = { x: 0, y: 0, hw: 0, hh: 0 };
    private _tab: GmTabId = 'time';
    private _tabPages = new Map<GmTabId, Node>();
    private _tabBtns = new Map<GmTabId, Node>();

    onLoad() {
        InputBridge.gmUiHit = (x, y) => this.hitChip(x, y) || this._open;
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
        this.buildChip();
        loadUiFont().then((font) => {
            if (!font) return;
            const title = this._chip?.getChildByName('Label')?.getComponent(Label);
            if (title) applyUiFont(title);
            if (this._clockLab) applyUiFont(this._clockLab);
            if (this._dateLab) applyUiFont(this._dateLab);
            if (this._pauseLab) applyUiFont(this._pauseLab);
        });
    }

    onDestroy() {
        if (InputBridge.gmUiHit) InputBridge.gmUiHit = null;
        InputBridge.gmPanelOpen = false;
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
        if (this._open) InputBridge.uiBlocking = this._prevBlocking;
        this._root?.destroy();
        this._chip?.destroy();
    }

    get isOpen(): boolean {
        return this._open;
    }

    setInfoBoard(info: FarmInfoBoard | null) {
        this.infoBoard = info;
        if (this._open) this.refreshLabels();
    }

    toggle() {
        this.setOpen(!this._open);
    }

    setOpen(open: boolean) {
        if (open === this._open) {
            if (open) this.refreshLabels();
            return;
        }
        this._open = open;
        InputBridge.gmPanelOpen = open;
        if (open) {
            this._prevBlocking = InputBridge.uiBlocking;
            InputBridge.uiBlocking = true;
            InputBridge.clear();
            this.buildPanel();
            this.refreshLabels();
        } else {
            InputBridge.uiBlocking = this._prevBlocking;
            if (this._root?.isValid) this._root.destroy();
            this._root = null;
            this._clockLab = null;
            this._dateLab = null;
            this._pauseLab = null;
            this._btns = [];
            this._tabPages.clear();
            this._tabBtns.clear();
        }
        if (this._chip) this._chip.active = !open;
    }

    /** UI coords origin bottom-left. Returns true if consumed. */
    handleTap(uiX: number, uiY: number): boolean {
        if (!this._open) {
            if (this.hitChip(uiX, uiY)) {
                this.setOpen(true);
                return true;
            }
            return false;
        }
        const local = this.uiToCanvasLocal(uiX, uiY);
        for (const b of this._btns) {
            if (this.hitNode(b.node, local.x, local.y)) {
                b.action();
                this.refreshLabels();
                return true;
            }
        }
        // Dimmer swallows the rest.
        return true;
    }

    update() {
        if (this._open) this.refreshLabels();
    }

    private onKey = (e: EventKeyboard) => {
        if (e.keyCode === KeyCode.F1 || e.keyCode === KeyCode.BACK_QUOTE) {
            this.toggle();
            return;
        }
        if (e.keyCode === KeyCode.ESCAPE && this._open) {
            this.setOpen(false);
        }
    };

    private buildChip() {
        const canvas = this.node;
        const old = canvas.getChildByName('GmChip');
        if (old) old.destroy();

        const chip = new Node('GmChip');
        chip.layer = canvas.layer;
        chip.setParent(canvas);
        chip.setSiblingIndex(canvas.children.length - 1);
        const w = 72;
        const h = 44;
        const { halfW, halfH } = this.canvasHalf();
        // Top-left, clear of the info board.
        const x = -halfW + 48;
        const y = halfH - 56;
        chip.setPosition(x, y, 0);
        chip.addComponent(UITransform).setContentSize(w, h);
        const g = chip.addComponent(Graphics);
        g.fillColor = new Color(54, 40, 28, 210);
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 10);
        g.fill();
        g.strokeColor = new Color(232, 198, 140, 230);
        g.lineWidth = 3;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 10);
        g.stroke();

        const labN = new Node('Label');
        labN.layer = canvas.layer;
        labN.setParent(chip);
        labN.addComponent(UITransform).setContentSize(w, h);
        const lab = labN.addComponent(Label);
        lab.string = 'GM';
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size: 22,
            color: new Color(255, 236, 180, 255),
            outline: true,
            outlineWidth: 3,
        });

        this._chip = chip;
        this._chipHit = { x, y, hw: w * 0.5 + 8, hh: h * 0.5 + 8 };
    }

    private buildPanel() {
        const canvas = this.node;
        const old = canvas.getChildByName('GmPanel');
        if (old) old.destroy();
        this._btns = [];
        this._tabPages.clear();
        this._tabBtns.clear();
        if (!GM_TABS.some((t) => t.id === this._tab)) this._tab = 'time';

        const root = new Node('GmPanel');
        root.layer = canvas.layer;
        root.setParent(canvas);
        root.setSiblingIndex(canvas.children.length - 1);
        const vis = view.getVisibleSize();
        root.addComponent(UITransform).setContentSize(vis.width, vis.height);
        this._root = root;

        const dim = new Node('Dim');
        dim.layer = root.layer;
        dim.setParent(root);
        dim.addComponent(UITransform).setContentSize(vis.width * 2, vis.height * 2);
        const dimG = dim.addComponent(Graphics);
        dimG.fillColor = new Color(0, 0, 0, 150);
        dimG.rect(-vis.width, -vis.height, vis.width * 2, vis.height * 2);
        dimG.fill();

        const panelW = 560;
        const panelH = 620;
        const panel = new Node('Panel');
        panel.layer = root.layer;
        panel.setParent(root);
        panel.setPosition(0, 20, 0);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);

        const chrome = panel.addComponent(Graphics);
        this.drawChrome(chrome, panelW, panelH);

        const titleN = new Node('Title');
        titleN.layer = root.layer;
        titleN.setParent(panel);
        titleN.setPosition(0, panelH * 0.5 - 38, 0);
        titleN.addComponent(UITransform).setContentSize(panelW - 120, 40);
        const title = titleN.addComponent(Label);
        title.string = 'GM · 调试';
        title.horizontalAlign = Label.HorizontalAlign.CENTER;
        title.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(title, {
            size: 30,
            color: new Color(255, 244, 214, 255),
            outline: true,
        });

        this.addBtn(panel, '关闭', panelW * 0.5 - 66, panelH * 0.5 - 38, 88, 40, () => this.setOpen(false), true);

        // Tab bar
        const tabY = panelH * 0.5 - 96;
        const tabW = 148;
        const tabH = 44;
        const tabGap = 12;
        const tabTotal = GM_TABS.length * tabW + (GM_TABS.length - 1) * tabGap;
        GM_TABS.forEach((t, i) => {
            const x = -tabTotal * 0.5 + tabW * 0.5 + i * (tabW + tabGap);
            const btn = this.addBtn(panel, t.label, x, tabY, tabW, tabH, () => this.selectTab(t.id));
            this._tabBtns.set(t.id, btn);
        });

        const pageHost = new Node('Pages');
        pageHost.layer = root.layer;
        pageHost.setParent(panel);
        pageHost.setPosition(0, -18, 0);
        pageHost.addComponent(UITransform).setContentSize(panelW - 48, panelH - 180);

        const timePage = this.makePage(pageHost, 'Page_time');
        this.buildTimePage(timePage, panelW);
        this._tabPages.set('time', timePage);

        const questPage = this.makePage(pageHost, 'Page_quest');
        this.buildQuestPage(questPage);
        this._tabPages.set('quest', questPage);

        const systemPage = this.makePage(pageHost, 'Page_system');
        this.buildSystemPage(systemPage);
        this._tabPages.set('system', systemPage);

        const hintN = new Node('Hint');
        hintN.layer = root.layer;
        hintN.setParent(panel);
        hintN.setPosition(0, -panelH * 0.5 + 28, 0);
        hintN.addComponent(UITransform).setContentSize(panelW - 24, 28);
        const hint = hintN.addComponent(Label);
        hint.string = 'F1 / ` 开关 · Esc 关闭';
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(hint, {
            size: 18,
            color: new Color(180, 160, 120, 255),
            outline: false,
        });

        this.applyTabVisuals();

        loadUiFont().then((font) => {
            if (!font || !root.isValid) return;
            for (const lab of root.getComponentsInChildren(Label)) applyUiFont(lab);
        });
    }

    private makePage(host: Node, name: string): Node {
        const page = new Node(name);
        page.layer = host.layer;
        page.setParent(host);
        page.setPosition(0, 0, 0);
        page.addComponent(UITransform).setContentSize(host.getComponent(UITransform)!.contentSize);
        return page;
    }

    private buildTimePage(page: Node, panelW: number) {
        const clockN = new Node('Clock');
        clockN.layer = page.layer;
        clockN.setParent(page);
        clockN.setPosition(0, 168, 0);
        clockN.addComponent(UITransform).setContentSize(panelW - 40, 64);
        const clock = clockN.addComponent(Label);
        clock.string = '06:00';
        clock.horizontalAlign = Label.HorizontalAlign.CENTER;
        clock.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(clock, {
            size: 52,
            color: new Color(255, 236, 160, 255),
            outline: true,
            outlineWidth: 5,
        });
        this._clockLab = clock;

        const dateN = new Node('Date');
        dateN.layer = page.layer;
        dateN.setParent(page);
        dateN.setPosition(0, 112, 0);
        dateN.addComponent(UITransform).setContentSize(panelW - 40, 36);
        const date = dateN.addComponent(Label);
        date.string = '';
        date.horizontalAlign = Label.HorizontalAlign.CENTER;
        date.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(date, {
            size: 24,
            color: new Color(220, 200, 160, 255),
            outline: true,
        });
        this._dateLab = date;

        const presets: { label: string; h: number; m: number }[] = [
            { label: '清晨 6:00', h: 6, m: 0 },
            { label: '正午 12:00', h: 12, m: 0 },
            { label: '黄昏 18:00', h: 18, m: 0 },
            { label: '深夜 22:00', h: 22, m: 0 },
        ];
        const presetY = 40;
        const presetW = 118;
        const presetGap = 12;
        const presetTotal = presets.length * presetW + (presets.length - 1) * presetGap;
        presets.forEach((p, i) => {
            const x = -presetTotal * 0.5 + presetW * 0.5 + i * (presetW + presetGap);
            this.addBtn(page, p.label, x, presetY, presetW, 48, () => {
                this.infoBoard?.setTime(p.h, p.m);
            });
        });

        const nudges: { label: string; fn: () => void }[] = [
            { label: '-1时', fn: () => this.infoBoard?.addMinutes(-60) },
            { label: '-10分', fn: () => this.infoBoard?.addMinutes(-10) },
            { label: '+10分', fn: () => this.infoBoard?.addMinutes(10) },
            { label: '+1时', fn: () => this.infoBoard?.addMinutes(60) },
        ];
        const nudgeY = -36;
        const nudgeW = 110;
        const nudgeGap = 14;
        const nudgeTotal = nudges.length * nudgeW + (nudges.length - 1) * nudgeGap;
        nudges.forEach((n, i) => {
            const x = -nudgeTotal * 0.5 + nudgeW * 0.5 + i * (nudgeW + nudgeGap);
            this.addBtn(page, n.label, x, nudgeY, nudgeW, 48, n.fn);
        });

        const dayY = -112;
        this.addBtn(page, '-1日', -150, dayY, 120, 48, () => this.infoBoard?.addMinutes(-20 * 60));
        this.addBtn(page, '+1日', 0, dayY, 120, 48, () => this.infoBoard?.addMinutes(20 * 60));
        const pauseBtn = this.addBtn(page, '暂停', 150, dayY, 120, 48, () => {
            const board = this.infoBoard;
            if (!board) return;
            board.setPaused(!board.paused);
        });
        this._pauseLab = pauseBtn.getChildByName('Label')?.getComponent(Label) ?? null;
    }

    private buildQuestPage(page: Node) {
        this.addSectionLabel(page, '跳转到主线章节起点（会自动前往小镇）', 140);

        const lines: { label: string; line: 'town' | 'market' | 'spring'; desc: string }[] = [
            { label: '城镇任务', line: 'town', desc: '解锁小镇后的城镇线' },
            { label: '市集任务', line: 'market', desc: '市集 / 交易相关章节' },
            { label: '春厅任务', line: 'spring', desc: '春厅剧情线' },
        ];
        lines.forEach((q, i) => {
            const y = 60 - i * 96;
            this.addBtn(page, q.label, 0, y, 280, 48, () => this.jumpQuestLine(q.line));
            this.addSectionLabel(page, q.desc, y - 36, 20);
        });
    }

    private buildSystemPage(page: Node) {
        this.addSectionLabel(page, '引导与调试开关', 140);
        this.addBtn(page, '跳过新手引导', 0, 40, 300, 52, () => this.skipNewbieGuide(), true);
        this.addSectionLabel(page, '结束农场新手、解锁小镇并跳到城镇线', -20, 20);
    }

    private addSectionLabel(parent: Node, text: string, y: number, size = 22) {
        const n = new Node('Section');
        n.layer = parent.layer;
        n.setParent(parent);
        n.setPosition(0, y, 0);
        n.addComponent(UITransform).setContentSize(480, 32);
        const lab = n.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size,
            color: new Color(120, 88, 48, 255),
            outline: false,
        });
        return lab;
    }

    private selectTab(id: GmTabId) {
        if (this._tab === id) return;
        this._tab = id;
        this.applyTabVisuals();
    }

    private applyTabVisuals() {
        for (const [id, page] of this._tabPages) {
            page.active = id === this._tab;
        }
        for (const [id, btn] of this._tabBtns) {
            this.paintBtn(btn, id === this._tab ? 'tabOn' : 'tabOff');
        }
    }

    private paintBtn(btn: Node, kind: 'normal' | 'danger' | 'tabOn' | 'tabOff') {
        const ut = btn.getComponent(UITransform);
        const g = btn.getComponent(Graphics);
        if (!ut || !g) return;
        const w = ut.contentSize.width;
        const h = ut.contentSize.height;
        let fill: Color;
        let inner: Color;
        if (kind === 'danger') {
            fill = new Color(160, 72, 48, 255);
            inner = new Color(210, 120, 80, 255);
        } else if (kind === 'tabOn') {
            fill = new Color(120, 72, 32, 255);
            inner = new Color(210, 150, 72, 255);
        } else if (kind === 'tabOff') {
            fill = new Color(176, 110, 48, 255);
            inner = new Color(236, 214, 170, 255);
        } else {
            fill = new Color(176, 110, 48, 255);
            inner = new Color(232, 198, 140, 255);
        }
        g.clear();
        g.fillColor = fill;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 12);
        g.fill();
        g.fillColor = inner;
        g.roundRect(-w * 0.5 + 4, -h * 0.5 + 4, w - 8, h - 8, 9);
        g.fill();
        g.strokeColor = new Color(54, 30, 14, 255);
        g.lineWidth = 3;
        g.roundRect(-w * 0.5, -h * 0.5, w, h, 12);
        g.stroke();

        const lab = btn.getChildByName('Label')?.getComponent(Label);
        if (lab) {
            lab.color =
                kind === 'tabOn' ? new Color(255, 244, 214, 255) : new Color(48, 32, 18, 255);
        }
    }

    /** Close spotlight / story, finish farm quests 1001–1007, unlock town → 1009. */
    private skipNewbieGuide() {
        const story = this.node.getComponent(StoryDialogue);
        const guide = this.node.getComponent(TutorialGuide);
        const quests = this.node.getComponent(QuestSystem);
        const hud = this.node.getComponent(FarmHUD);

        story?.skipNewbieGuide();
        hud?.clearTutorialCraftGuide();
        const jumped = quests?.skipFarmTutorial() ?? false;
        guide?.dismissSpotlight();

        this.infoBoard?.showToast(
            jumped ? '已跳过新手引导 · 小镇已解锁' : '新手引导已跳过 / 已完成',
        );
        this.setOpen(false);
    }

    /** Jump to chapter start and travel to the matching map when needed. */
    private jumpQuestLine(line: 'town' | 'market' | 'spring') {
        const story = this.node.getComponent(StoryDialogue);
        const guide = this.node.getComponent(TutorialGuide);
        const quests = this.node.getComponent(QuestSystem);
        const hud = this.node.getComponent(FarmHUD);
        const farm = this.node.getComponent(FarmSystem);

        story?.prepareQuestLineJump(line);
        hud?.clearTutorialCraftGuide();
        guide?.dismissSpotlight();

        const result = quests?.jumpToQuestLine(line);
        if (!result) {
            this.infoBoard?.showToast('任务线跳转失败');
            return;
        }

        const scene = director.getScene()?.name ?? '';
        const onTown = scene === 'Town';
        this.setOpen(false);

        if (!onTown) {
            this.infoBoard?.showToast(`已跳转 ${result.label} · 前往小镇`);
            travelTo('town', {
                farm,
                quests,
                spawnX: TownWorldLayout.PLAYER_SPAWN.x,
                spawnY: TownWorldLayout.PLAYER_SPAWN.y,
            });
            return;
        }

        this.infoBoard?.showToast(`已跳转 ${result.label}（${result.activeId}）`);
    }

    private addBtn(
        parent: Node,
        text: string,
        x: number,
        y: number,
        w: number,
        h: number,
        action: () => void,
        danger = false,
    ): Node {
        const btn = new Node(`Btn_${text}`);
        btn.layer = parent.layer;
        btn.setParent(parent);
        btn.setPosition(x, y, 0);
        btn.addComponent(UITransform).setContentSize(w, h);
        btn.addComponent(Graphics);

        const labN = new Node('Label');
        labN.layer = parent.layer;
        labN.setParent(btn);
        labN.addComponent(UITransform).setContentSize(w, h);
        const lab = labN.addComponent(Label);
        lab.string = text;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        styleUiLabel(lab, {
            size: 22,
            color: new Color(48, 32, 18, 255),
            outline: false,
        });

        this.paintBtn(btn, danger ? 'danger' : 'normal');
        this._btns.push({ node: btn, action });
        return btn;
    }

    private drawChrome(g: Graphics, w: number, h: number) {
        const x0 = -w * 0.5;
        const y0 = -h * 0.5;
        g.fillColor = new Color(176, 110, 48, 255);
        g.roundRect(x0, y0, w, h, 18);
        g.fill();
        g.fillColor = new Color(120, 72, 32, 255);
        g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, 14);
        g.fill();
        g.fillColor = new Color(232, 198, 140, 255);
        g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, 10);
        g.fill();
        g.fillColor = new Color(246, 226, 180, 255);
        g.roundRect(x0 + 20, y0 + 20, w - 40, h - 40, 8);
        g.fill();
    }

    private refreshLabels() {
        const c = this.infoBoard?.getClock();
        if (!c || !this._clockLab) return;
        this._clockLab.string = `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
        if (this._dateLab) {
            const season = this.infoBoard?.seasonName(c.season) ?? '';
            const wd = this.infoBoard?.weekdayName(c.weekday) ?? '';
            this._dateLab.string = `${season} ${c.day}日 ${wd}${c.paused ? '  · 已暂停' : ''}`;
        }
        if (this._pauseLab) this._pauseLab.string = c.paused ? '继续' : '暂停';
    }

    private canvasHalf(): { halfW: number; halfH: number } {
        const canvasUi = this.node.getComponent(UITransform);
        const vis = view.getVisibleSize();
        return {
            halfW: (canvasUi?.contentSize.width || vis.width) * 0.5,
            halfH: (canvasUi?.contentSize.height || vis.height) * 0.5,
        };
    }

    private uiToCanvasLocal(uiX: number, uiY: number): { x: number; y: number } {
        const { halfW, halfH } = this.canvasHalf();
        return { x: uiX - halfW, y: uiY - halfH };
    }

    private hitChip(uiX: number, uiY: number): boolean {
        if (!this._chip?.active) return false;
        const local = this.uiToCanvasLocal(uiX, uiY);
        const { x, y, hw, hh } = this._chipHit;
        return local.x >= x - hw && local.x <= x + hw && local.y >= y - hh && local.y <= y + hh;
    }

    private hitNode(n: Node | null, lx: number, ly: number): boolean {
        if (!n?.isValid || !n.activeInHierarchy || !this._root) return false;
        const ut = n.getComponent(UITransform);
        if (!ut) return false;
        // Accumulate local positions up to canvas (root's parent).
        let px = 0;
        let py = 0;
        let cur: Node | null = n;
        while (cur && cur !== this.node) {
            px += cur.position.x;
            py += cur.position.y;
            cur = cur.parent;
        }
        const hw = ut.contentSize.width * 0.5 + 6;
        const hh = ut.contentSize.height * 0.5 + 6;
        return lx >= px - hw && lx <= px + hw && ly >= py - hh && ly <= py + hh;
    }
}
