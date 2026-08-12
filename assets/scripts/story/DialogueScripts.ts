import { CChat, CDialogue } from '../cfg/schema';
import { DialogueLine } from '../game/DialoguePanel';
import { StoryIntroPage } from '../game/StoryIntroPanel';
import { getConfigTables } from '../game/ConfigService';

/** Farm companion display name (portrait lookup). */
export const GIRL = '露穗';

export type ScriptId = string;

export type DialogueScriptDef = {
    scriptId: ScriptId;
    kind: 'dialogue' | 'intro';
    lines: DialogueLine[];
    /** Intro comic pages (kind === intro); empty for normal dialogue. */
    introPages: StoryIntroPage[];
    dialogueId: number;
    name: string;
};

type Index = {
    byChat: Map<number, DialogueScriptDef>;
    byScript: Map<string, DialogueScriptDef>;
};

let _index: Index | null = null;

function kindOf(raw: string): 'dialogue' | 'intro' {
    return raw === 'intro' ? 'intro' : 'dialogue';
}

function buildIndex(): Index | null {
    const tables = getConfigTables();
    if (!tables) return null;

    const linesByDialogue = new Map<number, CChat[]>();
    for (const row of tables.TChat.getDataList()) {
        let list = linesByDialogue.get(row.dialogueId);
        if (!list) {
            list = [];
            linesByDialogue.set(row.dialogueId, list);
        }
        list.push(row);
    }
    for (const list of linesByDialogue.values()) {
        list.sort((a, b) => a.seq - b.seq || a.id - b.id);
    }

    const byChat = new Map<number, DialogueScriptDef>();
    const byScript = new Map<string, DialogueScriptDef>();

    for (const d of tables.TDialogue.getDataList()) {
        const rows = linesByDialogue.get(d.id) ?? [];
        const kind = kindOf(d.kind);
        const def: DialogueScriptDef = {
            scriptId: d.scriptId,
            kind,
            dialogueId: d.id,
            name: d.name,
            lines:
                kind === 'intro'
                    ? []
                    : rows.map((r) => {
                          const line: DialogueLine = { text: r.text };
                          if (r.speaker) line.speaker = r.speaker;
                          return line;
                      }),
            introPages:
                kind === 'intro'
                    ? rows
                          .filter((r) => !!r.image && !!r.text)
                          .map((r) => ({ uuid: r.image, text: r.text }))
                    : [],
        };
        byChat.set(d.id, def);
        byScript.set(d.scriptId, def);
    }

    return { byChat, byScript };
}

function index(): Index | null {
    if (!_index) _index = buildIndex();
    return _index;
}

/** Call after config reload / GM table hot-swap. */
export function invalidateDialogueScriptCache(): void {
    _index = null;
}

export function listDialogueRows(): CDialogue[] {
    return getConfigTables()?.TDialogue.getDataList() ?? [];
}

export function getDialogueScript(chatId: number): DialogueScriptDef | undefined {
    return index()?.byChat.get(chatId | 0);
}

export function getDialogueScriptByScriptId(scriptId: string): DialogueScriptDef | undefined {
    if (!scriptId) return undefined;
    return index()?.byScript.get(scriptId);
}

export function getScriptLines(scriptId: string): DialogueLine[] {
    return getDialogueScriptByScriptId(scriptId)?.lines ?? [];
}

export function getIntroPages(scriptId: string = 'origin_story'): StoryIntroPage[] {
    return getDialogueScriptByScriptId(scriptId)?.introPages ?? [];
}

export function hasScript(scriptId: string): boolean {
    return !!getDialogueScriptByScriptId(scriptId);
}

export function isScriptId(id: string): id is ScriptId {
    return hasScript(id);
}

export function dialogueScriptHasGirl(scriptId: string): boolean {
    const def = getDialogueScriptByScriptId(scriptId);
    return !!def?.lines.some((l) => l.speaker === GIRL);
}

export function storyIdForScript(scriptId: string): number | undefined {
    return getDialogueScriptByScriptId(scriptId)?.dialogueId;
}

export function beatByScriptId(scriptId: string): DialogueScriptDef | undefined {
    return getDialogueScriptByScriptId(scriptId);
}

export function beatByChatId(chatId: number): DialogueScriptDef | undefined {
    return getDialogueScript(chatId);
}

export function beatByStoryId(storyId: number): DialogueScriptDef | undefined {
    return getDialogueScript(storyId);
}
