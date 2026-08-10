import { AudioClip, AudioSource, Node, resources, tween } from 'cc';

/** Paths under assets/resources (no extension). */
const CLIP_PATHS = {
    calm: 'audio/story/storyThemeCalm',
    alert: 'audio/story/storyThemeAlert',
    thunder: 'audio/story/story-thunder-boom',
} as const;

/** Same seek as SpaceCard: skip long drum intro on Volatile Reaction. */
const ALERT_SKIP_SEC = 16;
const BGM_VOL = 0.46;
const THUNDER_VOL = 0.9;
const FADE_OUT_SEC = 0.45;

type Track = 'alert' | 'calm' | null;

/**
 * Opening audio for the illustrated prologue — SpaceCard cold-open pack:
 * tense alert BGM during battle/storm, thunder on the fall, calm piano on farm wake.
 * After the prologue, calm keeps looping as the farm bed (nodes live on Canvas).
 */
export class StoryIntroAudio {
    private _host: Node | null = null;
    private _bgm: AudioSource | null = null;
    private _sfx: AudioSource | null = null;
    private _clips = new Map<string, AudioClip>();
    private _loading: Promise<void> | null = null;
    private _track: Track = null;
    /** Illustrated pages are advancing — page cues apply. */
    private _prologue = false;
    /** Any bed should keep running (prologue or farm calm). */
    private _bed = false;
    private _thunderPlayed = false;
    /** Desired track while bed is on — used to retry after browser autoplay unlock. */
    private _wanted: Track = null;

    attach(host: Node) {
        this._host = host;

        let bgmNode = host.getChildByName('StoryIntroBgm');
        if (!bgmNode?.isValid) {
            bgmNode = new Node('StoryIntroBgm');
            host.addChild(bgmNode);
        }
        this._bgm = bgmNode.getComponent(AudioSource) ?? bgmNode.addComponent(AudioSource);
        this._bgm.playOnAwake = false;
        this._bgm.loop = true;
        if (!this._bgm.playing) this._bgm.volume = BGM_VOL;

        let sfxNode = host.getChildByName('StoryIntroSfx');
        if (!sfxNode?.isValid) {
            sfxNode = new Node('StoryIntroSfx');
            host.addChild(sfxNode);
        }
        this._sfx = sfxNode.getComponent(AudioSource) ?? sfxNode.addComponent(AudioSource);
        this._sfx.playOnAwake = false;
        this._sfx.loop = false;
        this._sfx.volume = 1;

        // Recover track flag if Canvas already has calm looping from a prior intro.
        if (this._bgm.playing && this._bgm.clip) {
            const name = this._bgm.clip.name || '';
            if (name.includes('Calm') || name.includes('calm')) {
                this._track = 'calm';
                this._wanted = 'calm';
                this._bed = true;
            } else if (name.includes('Alert') || name.includes('alert')) {
                this._track = 'alert';
                this._wanted = 'alert';
                this._bed = true;
            }
        }
    }

    /** Warm clips so the first page can unlock audio inside a gesture. */
    preload(): Promise<void> {
        if (this._loading) return this._loading;
        this._loading = Promise.all(
            (Object.keys(CLIP_PATHS) as (keyof typeof CLIP_PATHS)[]).map(
                (key) =>
                    new Promise<void>((resolve) => {
                        const path = CLIP_PATHS[key];
                        resources.load(path, AudioClip, (err, clip) => {
                            if (!err && clip) this._clips.set(key, clip);
                            else console.warn(`[StoryIntroAudio] load failed: ${path}`, err);
                            resolve();
                        });
                    }),
            ),
        ).then(() => undefined);
        return this._loading;
    }

    /** Begin prologue bed (alert). Call from play()/beginPlay. */
    start() {
        this._prologue = true;
        this._bed = true;
        this._thunderPlayed = false;
        this._track = null;
        this._wanted = 'alert';
        void this.preload().then(() => {
            if (!this._prologue) return;
            this.setTrack('alert', true);
        });
    }

    /**
     * Retry play after the first tap — browsers often block autoplay until a gesture.
     */
    unlockFromGesture() {
        if (!this._bed || !this._wanted) return;
        const src = this._bgm;
        if (src?.isValid && src.playing) return;
        this.setTrack(this._wanted, true);
    }

    /** Sync bed + one-shots to the visible page index (0-based). */
    onPage(index: number) {
        if (!this._prologue) return;
        if (index <= 2) {
            this._wanted = 'alert';
            this.setTrack('alert', index === 0);
            if (index === 2 && !this._thunderPlayed) {
                this._thunderPlayed = true;
                this.playThunder();
            }
            return;
        }
        this._wanted = 'calm';
        this.setTrack('calm', false);
    }

    /**
     * Prologue closed — keep the calm piano looping into the farm scene.
     * Does not fade out.
     */
    continueCalm() {
        this._prologue = false;
        this._bed = true;
        this._wanted = 'calm';
        this.setTrack('calm', this._track !== 'calm');
        const src = this._bgm;
        if (src?.isValid) {
            src.loop = true;
            src.volume = BGM_VOL;
        }
    }

    /** Fade out and stop (explicit mute / teardown). */
    stop() {
        this._prologue = false;
        this._bed = false;
        this._wanted = null;
        const src = this._bgm;
        if (!src?.isValid) {
            this._track = null;
            return;
        }
        const from = { v: src.volume };
        tween(from)
            .to(
                FADE_OUT_SEC,
                { v: 0 },
                {
                    onUpdate: () => {
                        if (src.isValid) src.volume = from.v;
                    },
                },
            )
            .call(() => {
                if (!src.isValid) return;
                try {
                    src.stop();
                } catch {
                    /* ignore */
                }
                src.volume = BGM_VOL;
                this._track = null;
            })
            .start();
    }

    /**
     * Panel teardown: drop refs only. Leave Canvas BGM/SFX nodes so farm calm
     * survives StoryIntroPanel remount on scene travel.
     */
    dispose() {
        this._prologue = false;
        this._bgm = null;
        this._sfx = null;
        this._host = null;
    }

    private setTrack(track: 'alert' | 'calm', forceRestart: boolean) {
        if (this._track === track && !forceRestart) return;
        const clip = this._clips.get(track) ?? null;
        const src = this._bgm;
        if (!clip || !src?.isValid) {
            void this.preload().then(() => {
                if (!this._bed) return;
                if (this._track === track && !forceRestart) return;
                this.setTrack(track, forceRestart);
            });
            return;
        }

        this._track = track;
        try {
            src.stop();
        } catch {
            /* ignore */
        }
        src.clip = clip;
        src.loop = true;
        src.volume = BGM_VOL;
        src.play();
        if (track === 'alert') {
            try {
                src.currentTime = ALERT_SKIP_SEC;
            } catch {
                /* some backends ignore seek until buffered */
            }
        } else {
            try {
                src.currentTime = 0;
            } catch {
                /* ignore */
            }
        }
    }

    private playThunder() {
        const clip = this._clips.get('thunder') ?? null;
        const src = this._sfx;
        if (!clip || !src?.isValid) {
            void this.preload().then(() => {
                if (!this._prologue) return;
                const late = this._clips.get('thunder');
                if (late && this._sfx?.isValid) this._sfx.playOneShot(late, THUNDER_VOL);
            });
            return;
        }
        src.playOneShot(clip, THUNDER_VOL);
    }
}
