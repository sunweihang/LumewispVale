import { Component } from 'cc';
import { PlayerController } from '../game/PlayerController';
import { AbsStory } from './AbsStory';
import { createTsStory } from './generated/TsStoryClassMap';

export class StoryRuntime {
    private static _inst: StoryRuntime | null = null;

    private _host: Component | null = null;
    private _player: PlayerController | null = null;
    private _current: AbsStory | null = null;
    private _playToken = 0;

    public static get Inst(): StoryRuntime {
        if (!this._inst) this._inst = new StoryRuntime();
        return this._inst;
    }

    public get current(): AbsStory | null {
        return this._current;
    }

    public get isPlaying(): boolean {
        return !!this._current?.isPlaying;
    }

    public bindHost(host: Component, opts?: { player?: PlayerController | null }): void {
        this._host = host;
        this._player = opts?.player ?? this._player;
    }

    public isHost(c: Component | null): boolean {
        return !!c && this._host === c;
    }

    public hasHost(): boolean {
        return !!this._host?.isValid;
    }

    public async play(storyId: number): Promise<AbsStory | null> {
        const id = storyId | 0;
        if (!id) {
            console.warn('[StoryRuntime] play: invalid storyId');
            return null;
        }
        if (!this._host?.isValid) {
            console.warn('[StoryRuntime] play: host not bound');
            return null;
        }

        if (this._current?.isPlaying) {
            await this.interrupt();
        }

        const story = createTsStory(id);
        if (!story) {
            console.warn(`[StoryRuntime] no exported class for story ${id}`);
            return null;
        }

        story.bind({
            host: this._host,
            player: this._player,
        });
        this._current = story;
        const token = ++this._playToken;
        console.log(`[StoryRuntime] play ${id}`);
        await story.play();
        if (token === this._playToken && this._current === story && !story.isPlaying) {
            this._current = null;
        }
        return story;
    }

    public tick(deltaTime: number): void {
        this._current?.tick(deltaTime);
    }

    public async interrupt(): Promise<void> {
        const cur = this._current;
        this._playToken++;
        this._current = null;
        if (cur?.isPlaying) {
            await cur.interrupt();
        }
    }

    public clear(): void {
        void this.interrupt();
    }
}
