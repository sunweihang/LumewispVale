/**
 * In-process story flags (not persisted). Quest progression still uses QuestSystem flags.
 */
export class StoryFlags {
    private static _flags = new Map<string, boolean | number | string>();

    public static set(key: string, value: boolean | number | string): void {
        if (!key) return;
        this._flags.set(key, value);
    }

    public static get(key: string): boolean | number | string | undefined {
        if (!key) return undefined;
        return this._flags.get(key);
    }

    public static getBool(key: string): boolean {
        const v = this.get(key);
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        if (typeof v === 'string') return v.length > 0 && v !== '0' && v.toLowerCase() !== 'false';
        return false;
    }

    public static clear(): void {
        this._flags.clear();
    }
}
