import {
  Camera,
  Color,
  Rect,
  ResolutionPolicy,
  Size,
  screen,
  view,
} from 'cc';

/** Design canvas — mobile portrait. */
export const DESIGN_W = 1080;
export const DESIGN_H = 1920;

/** Desktop side bars outside the 1080 portrait frame — plain black. */
export const LETTERBOX_CLEAR = new Color(0, 0, 0, 255);

const _rect = new Rect();
const _size = new Size();

let _appliedPolicy = -1;
let _appliedWinW = -1;
let _appliedWinH = -1;

/**
 * Portrait policy (same as Unravel):
 * - Tall/narrow phones (aspect ≤ 9:16): FIXED_WIDTH — fill width, grow height.
 * - Wide desktop windows: SHOW_ALL — keep a 9:16 frame with side letterbox.
 */
export function applyDesignResolution(): void {
  const win = screen.windowSize;
  const ww = win.width;
  const wh = win.height;
  const winAspect = ww / Math.max(wh, 1);
  const designAspect = DESIGN_W / DESIGN_H;
  const policy =
    winAspect <= designAspect + 1e-3
      ? ResolutionPolicy.FIXED_WIDTH
      : ResolutionPolicy.SHOW_ALL;
  if (_appliedPolicy === policy && _appliedWinW === ww && _appliedWinH === wh) {
    return;
  }
  _appliedPolicy = policy;
  _appliedWinW = ww;
  _appliedWinH = wh;
  view.setDesignResolutionSize(DESIGN_W, DESIGN_H, policy);
}

/** Visible design-space size after the active resolution policy. */
export function portraitVisibleSize(out: Size = _size): Size {
  const v = view.getVisibleSize();
  out.set(Math.max(v.width, DESIGN_W), Math.max(v.height, DESIGN_H));
  return out;
}

/**
 * Normalized Camera.rect matching the content viewport.
 * FIXED_WIDTH on phones → full window; SHOW_ALL on desktop → letterboxed frame.
 */
export function portraitCameraRect(out: Rect = _rect): Rect {
  const vp = view.getViewportRect();
  const win = screen.windowSize;
  const ww = Math.max(win.width, 1);
  const wh = Math.max(win.height, 1);
  out.set(vp.x / ww, vp.y / wh, vp.width / ww, vp.height / wh);
  return out;
}

/** Apply portrait viewport rect to a camera. */
export function applyPortraitCameraRect(cam: Camera): void {
  const r = portraitCameraRect();
  cam.rect = new Rect(r.x, r.y, r.width, r.height);
}
