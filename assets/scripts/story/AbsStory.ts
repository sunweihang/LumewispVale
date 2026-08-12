import { Component, Node, Vec3, animation, find, director } from 'cc';
import { PlayerController } from '../game/PlayerController';
import { getDialogueScript } from './DialogueScripts';
import { GameEvent } from './GameEvent';
import { StoryChatBridge } from './StoryChatHost';
import { StoryFlags } from './StoryFlags';

/**
 * 剧情图基类。导出类 TsStory* 继承本类；由 StoryRuntime 驱动。
 * Flow 节点方法为 async，支持对话/等待等续跑。
 * Adapted from 后室 AbsStory for LumewispVale (DialoguePanel via StoryChatBridge).
 */
export class AbsStory {
    public readonly storyId: number = 0;

    protected host: Component | null = null;
    protected player: PlayerController | null = null;

    private _playing = false;
    private _ended = false;
    private _generation = 0;
    private _waitTimers: Array<{ remaining: number; resolve: () => void }> = [];
    private _inputLockedByStory = false;

    public get isPlaying(): boolean {
        return this._playing;
    }

    public get isEnded(): boolean {
        return this._ended;
    }

    public bind(opts: { host: Component; player?: PlayerController | null }): void {
        this.host = opts.host;
        this.player = opts.player ?? this.findPlayer();
    }

    /** 由 Runtime 调用：跑 onStart，结束后自动 onEnd（除非已 endStory/interrupt）。 */
    public async play(): Promise<void> {
        if (this._playing) return;
        this._playing = true;
        this._ended = false;
        const gen = ++this._generation;
        try {
            await this.onStart();
            if (gen !== this._generation) return;
            if (!this._ended) {
                await this.finishNormal();
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'story interrupted') return;
            console.error(`[AbsStory:${this.storyId}] play failed`, e);
            if (gen === this._generation) {
                await this.interruptInternal();
            }
        }
    }

    public tick(delta: number): void {
        if (!this._playing) return;
        const dt = Math.max(0, delta);
        for (let i = this._waitTimers.length - 1; i >= 0; i--) {
            const t = this._waitTimers[i]!;
            t.remaining -= dt;
            if (t.remaining <= 0) {
                this._waitTimers.splice(i, 1);
                t.resolve();
            }
        }
        this.onUpdate(dt);
    }

    public async interrupt(): Promise<void> {
        await this.interruptInternal();
    }

    private async interruptInternal(): Promise<void> {
        this._generation++;
        this.rejectPendingWaits();
        this._playing = false;
        try {
            await this.onInterrupted();
        } catch (e) {
            console.warn(`[AbsStory:${this.storyId}] onInterrupted error`, e);
        }
        this.setPlayerInputLocked(false);
    }

    private async finishNormal(): Promise<void> {
        this._ended = true;
        this._playing = false;
        this.rejectPendingWaits();
        try {
            await this.onEnd();
        } catch (e) {
            console.warn(`[AbsStory:${this.storyId}] onEnd error`, e);
        }
        this.setPlayerInputLocked(false);
    }

    private rejectPendingWaits(): void {
        const pending = this._waitTimers.splice(0, this._waitTimers.length);
        for (const t of pending) t.resolve();
    }

    // ---------- lifecycle (overridden by generated class) ----------

    protected async onStart(): Promise<void> {
        /* generated */
    }

    protected onUpdate(_delta: number): void {
        /* generated */
    }

    protected async onEnd(): Promise<void> {
        /* generated */
    }

    protected async onInterrupted(): Promise<void> {
        /* generated */
    }

    // ---------- node APIs ----------

    protected async startChat(chatId: number): Promise<void> {
        const id = chatId | 0;
        if (!id) return;
        const gen = this._generation;
        const def = getDialogueScript(id);
        if (!def) {
            console.warn(`[AbsStory:${this.storyId}] startChat: unknown chatId ${id}`);
            return;
        }
        const host = StoryChatBridge.host;
        if (!host) {
            console.warn(`[AbsStory:${this.storyId}] startChat: StoryChatBridge host not bound`);
            return;
        }
        await host.playChat({
            chatId: id,
            scriptId: def.scriptId,
            kind: def.kind,
            usesCompanion: def.kind === 'dialogue' && def.lines.some((l) => l.speaker === '露穗'),
        });
        if (gen !== this._generation) throw new Error('story interrupted');
    }

    protected waitSeconds(seconds: number): Promise<void> {
        const sec = Math.max(0, seconds);
        if (sec <= 1e-6) return Promise.resolve();
        const gen = this._generation;
        return new Promise<void>((resolve, reject) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                if (gen !== this._generation) reject(new Error('story interrupted'));
                else resolve();
            };
            this._waitTimers.push({ remaining: sec, resolve: finish });
            const host = this.host;
            if (host?.isValid) {
                host.scheduleOnce(finish, sec);
            } else {
                setTimeout(finish, sec * 1000);
            }
        });
    }

    protected waitGameEvent(eventName: string): Promise<void> {
        const name = (eventName || '').trim();
        if (!name) return Promise.resolve();
        const gen = this._generation;
        return new Promise<void>((resolve, reject) => {
            const onEv = () => {
                GameEvent.off(name, onEv, this);
                if (gen !== this._generation) reject(new Error('story interrupted'));
                else resolve();
            };
            GameEvent.on(name, onEv, this);
        });
    }

    protected emitGameEvent(eventName: string, payload?: unknown): void {
        const name = (eventName || '').trim();
        if (!name) return;
        if (payload !== undefined) GameEvent.emit(name, payload);
        else GameEvent.emit(name);
    }

    protected setFlag(key: string, value: boolean): void {
        StoryFlags.set(key, !!value);
    }

    protected getFlag(key: string): boolean {
        return StoryFlags.getBool(key);
    }

    protected setPlayerInputLocked(locked: boolean): void {
        const p = this.player ?? this.findPlayer();
        if (!p) return;
        this.player = p;
        const want = !!locked;
        if (want === this._inputLockedByStory && want === p.locked) return;
        this._inputLockedByStory = want;
        p.setLocked(want);
    }

    protected async cameraMoveToTarget(nodePath: string, duration = 1.2): Promise<void> {
        const path = (nodePath || '').trim();
        const dur = Number(duration) || 0;
        const target = this.resolveNode(path);
        if (!target?.isValid) {
            console.warn(`[AbsStory:${this.storyId}] cameraMoveToTarget: node not found "${path}"`);
            return;
        }
        // Vale CameraFollow has no cinematic tween yet — wait duration as a stand-in.
        this.emitGameEvent('CameraMoveToTarget', target);
        if (dur > 0) await this.waitSeconds(dur);
    }

    protected cameraShake(): void {
        this.emitGameEvent('CameraShake');
    }

    protected async cameraLockPlayer(duration = 0): Promise<void> {
        const dur = Number.isFinite(Number(duration)) ? Math.max(0, Number(duration)) : 0;
        this.emitGameEvent('CameraLockPlayer');
        if (dur > 0) await this.waitSeconds(dur);
    }

    protected playAnimation(targetPath: string, paramName: string, paramValue: number): void {
        const path = (targetPath || '').trim();
        if (!path || !paramName) return;
        const node = this.resolveNode(path);
        if (!node?.isValid) {
            console.warn(`[AbsStory:${this.storyId}] playAnimation: node not found "${path}"`);
            return;
        }
        const ctrl =
            node.getComponent(animation.AnimationController) ??
            node.getComponentInChildren(animation.AnimationController);
        if (!ctrl) {
            console.warn(`[AbsStory:${this.storyId}] playAnimation: no AnimationController on "${path}"`);
            return;
        }
        if (paramValue === 0 || paramValue === 1) {
            ctrl.setValue(paramName, paramValue !== 0);
        } else {
            ctrl.setValue(paramName, paramValue);
        }
    }

    /** Stub — Boss nodes kept for graph compatibility with 后室 editor. */
    protected bossPlayAppearShow(bossPath: string): void {
        console.warn(`[AbsStory:${this.storyId}] bossPlayAppearShow stub: "${bossPath}"`);
    }

    protected bossStartCombat(bossPath: string): void {
        console.warn(`[AbsStory:${this.storyId}] bossStartCombat stub: "${bossPath}"`);
    }

    protected playParticleEffect(prefabName: string, _worldPos?: Vec3 | null): void {
        console.warn(`[AbsStory:${this.storyId}] playParticleEffect stub: "${prefabName}"`);
    }

    protected playAudioOneShot(clipName: string): void {
        this.emitGameEvent('PlayAudioOneShot', clipName);
    }

    protected async endStory(): Promise<void> {
        if (this._ended) return;
        await this.finishNormal();
    }

    protected storyDebugLog(message: string): void {
        console.log(`[AbsStory:${this.storyId}] ${message}`);
    }

    private findPlayer(): PlayerController | null {
        const scene = director.getScene();
        if (!scene) return null;
        return scene.getComponentInChildren(PlayerController);
    }

    private resolveNode(path: string): Node | null {
        const p = (path || '').trim();
        if (!p) return null;
        let n = find(p);
        if (n?.isValid) return n;
        if (this.host?.node?.isValid) {
            n = this.host.node.getChildByPath(p);
            if (n?.isValid) return n;
        }
        const scene = director.getScene();
        if (!scene) return null;
        n = scene.getChildByPath(p);
        if (n?.isValid) return n;
        const leaf = p.includes('/') ? p.split('/').filter(Boolean).pop()! : p;
        return leaf ? this.findDescendantByName(scene, leaf) : null;
    }

    private findDescendantByName(root: Node, name: string): Node | null {
        if (!root?.isValid || !name) return null;
        if (root.name === name) return root;
        for (const child of root.children) {
            const hit = this.findDescendantByName(child, name);
            if (hit) return hit;
        }
        return null;
    }
}
