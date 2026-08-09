import {
    _decorator,
    assetManager,
    Color,
    Component,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    tween,
    UIOpacity,
    UITransform,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * Opening loop: walk to the crystal meteor and inspect it.
 */
@ccclass('FirstQuest')
export class FirstQuest extends Component {
    @property(Node)
    player: Node | null = null;

    @property(Node)
    world: Node | null = null;

    @property
    markerUuid = '';

    @property
    triggerRadius = 110;

    private _meteor: Node | null = null;
    private _marker: Node | null = null;
    private _banner: Label | null = null;
    private _done = false;
    private _hint: Label | null = null;

    start() {
        if (!this.world) return;
        this._meteor = this.world.getChildByName('meteor');
        if (!this._meteor) {
            console.warn('[FirstQuest] meteor node not found');
            return;
        }
        this.spawnMarker();
        this.spawnBanner();
    }

    update() {
        if (this._done || !this.player || !this._meteor) return;
        const p = this.player.position;
        const m = this._meteor.position;
        const dx = p.x - m.x;
        const dy = p.y - m.y;
        if (dx * dx + dy * dy <= this.triggerRadius * this.triggerRadius) {
            this.complete();
        }
        if (this._marker && this._marker.isValid) {
            // Bob above meteor
            const t = Date.now() * 0.006;
            this._marker.setPosition(m.x, m.y + 200 + Math.sin(t) * 10, 0);
        }
    }

    private spawnBanner() {
        const canvas = this.node;
        const bar = new Node('QuestBanner');
        bar.layer = canvas.layer;
        bar.setParent(canvas);
        bar.setPosition(0, 880, 0);
        bar.addComponent(UITransform).setContentSize(1000, 90);
        const label = bar.addComponent(Label);
        label.string = '目标：走到紫晶陨石旁，查看异象';
        label.fontSize = 40;
        label.lineHeight = 48;
        label.color = new Color(255, 236, 170, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        this._banner = label;

        const hint = new Node('QuestHint');
        hint.layer = canvas.layer;
        hint.setParent(canvas);
        hint.setPosition(0, 820, 0);
        hint.addComponent(UITransform).setContentSize(980, 40);
        const h = hint.addComponent(Label);
        h.string = '按住屏幕拖动移动';
        h.fontSize = 26;
        h.color = new Color(220, 220, 210, 200);
        h.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._hint = h;
    }

    private spawnMarker() {
        if (!this.world || !this._meteor) return;
        const marker = new Node('QuestMarker');
        marker.layer = this.world.layer;
        marker.setParent(this.world);
        const ui = marker.addComponent(UITransform);
        ui.setContentSize(48, 48);
        ui.setAnchorPoint(0.5, 0.5);
        const sp = marker.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const m = this._meteor.position;
        marker.setPosition(m.x, m.y + 200, 0);
        this._marker = marker;

        if (this.markerUuid) {
            assetManager.loadAny({ uuid: this.markerUuid }, (err, asset) => {
                if (!err && asset && sp.isValid) {
                    sp.spriteFrame = asset as SpriteFrame;
                }
            });
        }
    }

    private complete() {
        this._done = true;
        if (this._marker) {
            this._marker.destroy();
            this._marker = null;
        }
        if (this._banner) {
            this._banner.string = '异象已确认：紫晶仍在脉动…';
            this._banner.color = new Color(200, 255, 210, 255);
        }
        if (this._hint) {
            this._hint.string = '下一步：熟悉农场田地与小屋（耕种系统即将开放）';
        }

        // Soft fade flash on banner parent
        const bannerNode = this._banner?.node;
        if (bannerNode) {
            let op = bannerNode.getComponent(UIOpacity);
            if (!op) op = bannerNode.addComponent(UIOpacity);
            op.opacity = 255;
            tween(op).to(0.15, { opacity: 80 }).to(0.25, { opacity: 255 }).start();
        }
    }
}
