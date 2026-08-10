import { AudioClip, AudioSource, Node, resources } from 'cc';

const CLICK_PATH = 'audio/ui/ui-click';
const CLICK_VOL = 0.85;

/**
 * One-shot UI click SFX (from TripleTown UIclick).
 * Host an AudioSource on Canvas; call {@link playUiClick} from HUD / panels.
 */
export class UiAudio {
    private _sfx: AudioSource | null = null;
    private _clip: AudioClip | null = null;
    private _loading: Promise<AudioClip | null> | null = null;

    attach(host: Node) {
        let n = host.getChildByName('UiSfx');
        if (!n?.isValid) {
            n = new Node('UiSfx');
            host.addChild(n);
        }
        this._sfx = n.getComponent(AudioSource) ?? n.addComponent(AudioSource);
        this._sfx.playOnAwake = false;
        this._sfx.loop = false;
        this._sfx.volume = CLICK_VOL;
    }

    preload(): Promise<AudioClip | null> {
        if (this._clip) return Promise.resolve(this._clip);
        if (this._loading) return this._loading;
        this._loading = new Promise((resolve) => {
            resources.load(CLICK_PATH, AudioClip, (err, clip) => {
                if (!err && clip) this._clip = clip;
                else console.warn(`[UiAudio] load failed: ${CLICK_PATH}`, err);
                this._loading = null;
                resolve(this._clip);
            });
        });
        return this._loading;
    }

    playClick() {
        const src = this._sfx;
        if (!src?.node?.isValid) return;
        const play = (clip: AudioClip | null) => {
            if (!clip || !src.node?.isValid) return;
            src.playOneShot(clip, CLICK_VOL);
        };
        if (this._clip) {
            play(this._clip);
            return;
        }
        void this.preload().then(play);
    }
}

let _uiAudio: UiAudio | null = null;

export function ensureUiAudio(host: Node): UiAudio {
    if (!_uiAudio) _uiAudio = new UiAudio();
    _uiAudio.attach(host);
    void _uiAudio.preload();
    return _uiAudio;
}

export function playUiClick() {
    _uiAudio?.playClick();
}
