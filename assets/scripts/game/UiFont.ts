import { Color, Font, Label, assetManager, resources } from 'cc';

/** Clear rounded Chinese UI font (ZCOOL KuaiLe). */
const FONT_UUID = 'c9b4299d-5eb0-4a39-bf66-b033d0359a48';
const FONT_PATH = 'fonts/ZCOOLKuaiLe-Regular';

let _font: Font | null = null;
let _loading: Promise<Font | null> | null = null;

export function loadUiFont(): Promise<Font | null> {
    if (_font) return Promise.resolve(_font);
    if (_loading) return _loading;
    _loading = new Promise((resolve) => {
        const done = (font: Font | null) => {
            _font = font;
            resolve(font);
        };
        resources.load(FONT_PATH, Font, (err, font) => {
            if (!err && font) {
                done(font);
                return;
            }
            assetManager.loadAny({ uuid: FONT_UUID }, (err2, asset) => {
                done(!err2 && asset ? (asset as Font) : null);
            });
        });
    });
    return _loading;
}

export type UiLabelStyle = {
    size: number;
    color: Color;
    /** Dark outline for readability on busy scenes. */
    outline?: boolean;
    outlineWidth?: number;
    outlineColor?: Color;
};

/** Apply project UI font + optional outline (Cocos 3.8 Label built-in). */
export function styleUiLabel(lab: Label, style: UiLabelStyle) {
    lab.fontSize = style.size;
    lab.lineHeight = style.size + 8;
    lab.color = style.color;
    if (_font) {
        lab.useSystemFont = false;
        lab.font = _font;
    } else {
        // Fallback until asset finishes loading / editor reimports.
        lab.useSystemFont = true;
        lab.fontFamily = 'PingFang SC';
        lab.isBold = true;
    }
    if (style.outline === false) {
        lab.enableOutline = false;
    } else {
        lab.enableOutline = true;
        lab.outlineWidth = style.outlineWidth ?? Math.max(2, Math.round(style.size * 0.12));
        lab.outlineColor = style.outlineColor ?? new Color(28, 24, 18, 230);
    }
}

export function applyUiFont(lab: Label) {
    if (!_font) return;
    lab.useSystemFont = false;
    lab.font = _font;
}
