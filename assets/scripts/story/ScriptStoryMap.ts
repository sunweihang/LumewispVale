/**
 * scriptId ↔ story/chat id helpers.
 * Authoritative data: Luban `TDialogue` / `dialogue.xlsx` (via DialogueScripts).
 */
export type {
    ScriptId,
    DialogueScriptDef as StoryBeatDef,
} from './DialogueScripts';

export {
    isScriptId,
    storyIdForScript,
    beatByScriptId,
    beatByStoryId,
    beatByChatId,
    listDialogueRows,
} from './DialogueScripts';
