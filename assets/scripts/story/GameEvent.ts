type Handler = (...args: unknown[]) => void;

/**
 * Minimal event bus for story graphs (WaitGameEvent / EmitGameEvent).
 * Ported from 后室 GameEvent; Vale-scoped under story/.
 */
export class GameEvent {
    private static _map = new Map<string, Set<Handler>>();

    static on(name: string, fn: Handler, _ctx?: unknown): void {
        const key = (name || '').trim();
        if (!key || !fn) return;
        let set = this._map.get(key);
        if (!set) {
            set = new Set();
            this._map.set(key, set);
        }
        set.add(fn);
    }

    static off(name: string, fn: Handler, _ctx?: unknown): void {
        const key = (name || '').trim();
        if (!key || !fn) return;
        this._map.get(key)?.delete(fn);
    }

    static emit(name: string, ...args: unknown[]): void {
        const key = (name || '').trim();
        if (!key) return;
        const set = this._map.get(key);
        if (!set?.size) return;
        for (const fn of [...set]) {
            try {
                fn(...args);
            } catch (e) {
                console.warn(`[GameEvent] handler error on "${key}"`, e);
            }
        }
    }

    static clear(): void {
        this._map.clear();
    }
}
