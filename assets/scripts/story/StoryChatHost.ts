/**
 * Bridge between AbsStory.startChat and Vale DialoguePanel / StoryIntroPanel.
 * StoryDialogue registers itself as the host at bind time.
 */
export type StoryChatKind = 'dialogue' | 'intro';

export type StoryChatRequest = {
    chatId: number;
    scriptId: string;
    kind: StoryChatKind;
    /** Farm companion (露穗) — freeze patrol + face player for the chat. */
    usesCompanion: boolean;
};

export interface IStoryChatHost {
    playChat(req: StoryChatRequest): Promise<void>;
}

export class StoryChatBridge {
    private static _host: IStoryChatHost | null = null;

    static bind(host: IStoryChatHost | null): void {
        this._host = host;
    }

    static get host(): IStoryChatHost | null {
        return this._host;
    }
}
