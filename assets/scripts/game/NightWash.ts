import {
    Color,
    Graphics,
    ImageAsset,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    UIOpacity,
    UITransform,
} from 'cc';
import { DESIGN_H, DESIGN_W } from './PortraitFit';

/** `world.nightTint` #0A1420 — docs/ui-design-tokens.md */
const NIGHT_COLOR = new Color(10, 20, 32, 255);
/** Peak UIOpacity — clear evening cast without blacking out the farm. */
export const NIGHT_OPACITY_MAX = 150;

let _whiteSf: SpriteFrame | null = null;

function whiteSpriteFrame(): SpriteFrame {
    if (_whiteSf?.isValid) return _whiteSf;
    const data = new Uint8Array([255, 255, 255, 255]);
    const image = new ImageAsset();
    image.reset({
        _data: data,
        width: 1,
        height: 1,
        format: Texture2D.PixelFormat.RGBA8888,
        _compressed: false,
    });
    const tex = new Texture2D();
    tex.image = image;
    const sf = new SpriteFrame();
    sf.texture = tex;
    sf.packable = false;
    _whiteSf = sf;
    return sf;
}

/**
 * Full-screen night wash above World, below HUD.
 * Sprite + UIOpacity (Graphics fill alpha is unreliable for this wash).
 */
export function ensureNightWash(canvas: Node, world: Node | null, w = DESIGN_W, h = DESIGN_H): Node {
    let n = canvas.getChildByName('NightOverlay');
    if (!n?.isValid) {
        n = new Node('NightOverlay');
        n.layer = canvas.layer;
        n.setParent(canvas);
        n.addComponent(UITransform);
        const sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        sp.spriteFrame = whiteSpriteFrame();
        sp.color = NIGHT_COLOR;
        n.addComponent(UIOpacity).opacity = 0;
        n.active = false;
    } else {
        // Migrate older Graphics-based wash.
        const legacy = n.getComponent(Graphics);
        if (legacy) legacy.destroy();

        let sp = n.getComponent(Sprite);
        if (!sp) sp = n.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        if (!sp.spriteFrame) sp.spriteFrame = whiteSpriteFrame();
        sp.color = NIGHT_COLOR;

        if (!n.getComponent(UIOpacity)) n.addComponent(UIOpacity).opacity = 0;
    }

    const ut = n.getComponent(UITransform)!;
    ut.setContentSize(w, h);
    n.setPosition(0, 0, 0);

    if (world?.isValid) {
        const idx = world.getSiblingIndex() + 1;
        if (n.getSiblingIndex() !== idx) n.setSiblingIndex(idx);
    }
    return n;
}

/** intensity 0..1 → translucent night over the farm. */
export function applyNightWash(canvas: Node | null, intensity: number, w?: number, h?: number) {
    if (!canvas?.isValid) return;
    const world = canvas.getChildByName('World');
    const n = ensureNightWash(canvas, world, w ?? DESIGN_W, h ?? DESIGN_H);
    const op = n.getComponent(UIOpacity)!;
    const opacity = Math.round(NIGHT_OPACITY_MAX * Math.max(0, Math.min(1, intensity)));
    if (opacity <= 0) {
        op.opacity = 0;
        n.active = false;
        return;
    }
    n.active = true;
    op.opacity = opacity;
    if (world?.isValid) {
        const idx = world.getSiblingIndex() + 1;
        if (n.getSiblingIndex() !== idx) n.setSiblingIndex(idx);
    }
}
