import { JsonAsset, resources } from 'cc';
import { Tables } from '../cfg/schema';

const TABLE_FILES = [
    'tcondition',
    'tcraftrecipe',
    'tcraftcost',
    'tquest',
    'tgoto',
    'tflag',
    'titem',
    'tdialogue',
    'tchat',
] as const;

let _tables: Tables | null = null;
let _loading: Promise<Tables> | null = null;

function loadJson(name: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        resources.load(`config/${name}`, JsonAsset, (err, asset) => {
            if (err || !asset) {
                reject(err ?? new Error(`missing config/${name}`));
                return;
            }
            resolve(asset.json);
        });
    });
}

/** Load Luban JSON tables from `assets/resources/config`. */
export function loadConfigTables(): Promise<Tables> {
    if (_tables) return Promise.resolve(_tables);
    if (_loading) return _loading;
    _loading = (async () => {
        const map = new Map<string, unknown>();
        await Promise.all(
            TABLE_FILES.map(async (name) => {
                map.set(name, await loadJson(name));
            }),
        );
        _tables = new Tables((file) => {
            const data = map.get(file);
            if (data === undefined) throw new Error(`Luban table missing: ${file}`);
            return data;
        });
        return _tables;
    })();
    return _loading;
}

export function getConfigTables(): Tables | null {
    return _tables;
}
