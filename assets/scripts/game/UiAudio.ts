import { AudioClip, AudioSource, Node, assetManager, director, resources } from 'cc';

/** Paths under assets/resources (no extension). */
const CLIP_PATHS = {
    click: 'audio/ui/ui-click',
    tool: 'audio/ui/farm-tool',
    gather: 'audio/ui/farm-gather',
    gold: 'audio/ui/ui-gold',
} as const;

/** UUID fallback when resources path map is stale (editor preview). */
const CLIP_UUIDS = {
    click: '644433bb-9764-472f-b052-a137fc2ad2ee',
    tool: '30217491-1f82-4528-bba4-0f3b5c663e05',
    gather: '2449c653-cf87-4b67-911c-5371f794bf7e',
    gold: '88b4b257-a123-4fd0-932e-97387d4829af',
} as const;

type ClipKey = keyof typeof CLIP_PATHS;

const VOL: Record<ClipKey, number> = {
    click: 0.9,
    tool: 0.95,
    gather: 1.05,
    gold: 1.0,
};

const GLOBAL_KEY = '__lumewispUiAudio';

/**
 * One-shot UI / farm SFX. Singleton lives on globalThis so editor HMR
 * cannot orphan a half-attached module copy.
 */
export class UiAudio {
    private _host: Node | null = null;
    private _sfx: AudioSource | null = null;
    private _clips = new Map<ClipKey, AudioClip>();
    private _loading: Promise<void> | null = null;

    attach(host: Node) {
        this._host = host;
        let n = host.getChildByName('UiSfx');
        if (!n?.isValid) {
            n = new Node('UiSfx');
            host.addChild(n);
        }
        this._sfx = n.getComponent(AudioSource) ?? n.addComponent(AudioSource);
        this._sfx.playOnAwake = false;
        this._sfx.loop = false;
        this._sfx.volume = 1;
    }

    preload(): Promise<void> {
        if (this._clips.size >= Object.keys(CLIP_PATHS).length) {
            return Promise.resolve();
        }
        if (this._loading) return this._loading;
        const keys = Object.keys(CLIP_PATHS) as ClipKey[];
        this._loading = Promise.all(keys.map((k) => this.loadClip(k))).then(() => {
            this._loading = null;
        });
        return this._loading;
    }

    play(key: ClipKey) {
        this.ensureSource();
        const src = this._sfx;
        if (!src?.node?.isValid) return;
        const vol = VOL[key] ?? 1;
        const clip = this._clips.get(key) ?? null;
        if (clip) {
            src.playOneShot(clip, vol);
            return;
        }
        void this.loadClip(key).then((loaded) => {
            if (loaded && this._sfx?.node?.isValid) {
                this._sfx.playOneShot(loaded, vol);
            }
        });
    }

    playClick() {
        this.play('click');
    }

    playTool() {
        this.play('tool');
    }

    playGather() {
        this.play('gather');
    }

    playGold() {
        this.play('gold');
    }

    private ensureSource() {
        if (this._sfx?.node?.isValid) return;
        const host =
            this._host?.isValid
                ? this._host
                : director.getScene()?.getChildByName('Canvas') ?? null;
        if (host) this.attach(host);
    }

    private loadClip(key: ClipKey): Promise<AudioClip | null> {
        const cached = this._clips.get(key);
        if (cached) return Promise.resolve(cached);
        const path = CLIP_PATHS[key];
        const uuid = CLIP_UUIDS[key];
        return new Promise((resolve) => {
            const done = (clip: AudioClip | null) => {
                if (clip) this._clips.set(key, clip);
                else console.warn(`[UiAudio] load failed: ${path}`);
                resolve(clip);
            };
            resources.load(path, AudioClip, (err, clip) => {
                if (!err && clip) {
                    done(clip);
                    return;
                }
                assetManager.loadAny({ uuid }, (err2, asset) => {
                    done(!err2 && asset ? (asset as AudioClip) : null);
                });
            });
        });
    }
}

function store(): UiAudio {
    const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: UiAudio };
    if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new UiAudio();
    return g[GLOBAL_KEY]!;
}

export function ensureUiAudio(host: Node): UiAudio {
    const audio = store();
    audio.attach(host);
    void audio.preload();
    return audio;
}

export function playUiClick() {
    store().playClick();
}

export function playFarmTool() {
    store().playTool();
}

export function playFarmGather() {
    store().playGather();
}

export function playUiGold() {
    store().playGold();
}
