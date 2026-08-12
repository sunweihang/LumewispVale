#!/usr/bin/env node
/**
 * Generate story-graphs + TsStory classes for all Vale dialogue beats.
 * Pattern (后室 10001 sample): Lock → StartChat(chatId) → Unlock → StoryEnd
 *
 * Usage: node tools/story/generate_dialogue_stories.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

/** Beats from Luban TDialogue (`npm run gen:config` → tdialogue.json). */
const BEATS = (() => {
  const dialoguePath = path.join(ROOT, 'assets/resources/config/tdialogue.json');
  if (!fs.existsSync(dialoguePath)) {
    throw new Error('missing tdialogue.json — run npm run gen:config first');
  }
  const rows = JSON.parse(fs.readFileSync(dialoguePath, 'utf8'));
  return rows
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((r) => ({
      storyId: r.id,
      chatId: r.id,
      scriptId: r.script_id,
      name: r.name || r.script_id,
    }));
})();

const WHITELIST = [
  'StoryEntranceBlueprint',
  'StartChatBlueprint',
  'WaitSecondsBlueprint',
  'WaitGameEventBlueprint',
  'EmitGameEventBlueprint',
  'SetFlagBlueprint',
  'FlagBranchBlueprint',
  'LockPlayerInputBlueprint',
  'UnlockPlayerInputBlueprint',
  'CameraMoveToTargetBlueprint',
  'CameraShakeBlueprint',
  'CameraLockPlayerBlueprint',
  'PlayAnimationBlueprint',
  'PlayParticleEffectBlueprint',
  'PlayAudioOneShotBlueprint',
  'BossPlayAppearShowBlueprint',
  'BossStartCombatBlueprint',
  'StoryEndBlueprint',
  'FloatConst',
  'Add',
  'Branch',
  'BoolConst',
  'StringConst',
  'DebugLog',
  'FloatCompareBranch',
];

function uuid() {
  return crypto.randomUUID();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJsonMeta(filePath) {
  const meta = {
    ver: '2.0.1',
    importer: 'json',
    imported: true,
    uuid: uuid(),
    files: ['.json'],
    subMetas: {},
    userData: {},
  };
  fs.writeFileSync(filePath + '.meta', JSON.stringify(meta, null, 2) + '\n');
}

function writeDirMeta(dirPath) {
  const meta = {
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid: uuid(),
    files: [],
    subMetas: {},
    userData: {},
  };
  fs.writeFileSync(dirPath + '.meta', JSON.stringify(meta, null, 2) + '\n');
}

function writeTsMeta(filePath) {
  const meta = {
    ver: '4.0.24',
    importer: 'typescript',
    imported: true,
    uuid: uuid(),
    files: [],
    subMetas: {},
    userData: { simulateGlobals: false },
  };
  fs.writeFileSync(filePath + '.meta', JSON.stringify(meta, null, 2) + '\n');
}

function buildGraph(beat) {
  const { storyId, chatId, scriptId, name } = beat;
  return {
    version: 1,
    graphId: `story_${storyId}_${scriptId}`,
    profile: {
      name: 'story',
      useLightTheme: false,
      nodeFilter: {
        allowAll: false,
        whitelist: [...WHITELIST],
        blacklist: [],
      },
    },
    nodes: [
      {
        id: 'node_entrance',
        typeName: 'StoryEntranceBlueprint',
        title: '剧情入口',
        position: { x: 40, y: 40, w: 220, h: 180 },
        minWidth: 220,
        minHeight: 180,
        inputs: [],
        outputs: [
          { name: '开始', portType: 'GraphFlow' },
          { name: '每帧更新', portType: 'GraphFlow' },
          { name: '正常结束', portType: 'GraphFlow' },
          { name: '中断', portType: 'GraphFlow' },
        ],
        customData: {},
      },
      {
        id: 'node_lock',
        typeName: 'LockPlayerInputBlueprint',
        title: '锁定玩家输入',
        position: { x: 300, y: 40, w: 180, h: 80 },
        minWidth: 180,
        minHeight: 80,
        inputs: [{ name: '前序', portType: 'GraphFlow' }],
        outputs: [{ name: '后继', portType: 'GraphFlow' }],
        customData: {},
      },
      {
        id: 'node_chat',
        typeName: 'StartChatBlueprint',
        title: '播对话',
        position: { x: 520, y: 40, w: 200, h: 100 },
        minWidth: 200,
        minHeight: 100,
        inputs: [{ name: '前序', portType: 'GraphFlow' }],
        outputs: [{ name: '后继', portType: 'GraphFlow' }],
        customData: { chatId },
      },
      {
        id: 'node_unlock',
        typeName: 'UnlockPlayerInputBlueprint',
        title: '解锁玩家输入',
        position: { x: 760, y: 40, w: 180, h: 80 },
        minWidth: 180,
        minHeight: 80,
        inputs: [{ name: '前序', portType: 'GraphFlow' }],
        outputs: [{ name: '后继', portType: 'GraphFlow' }],
        customData: {},
      },
      {
        id: 'node_end',
        typeName: 'StoryEndBlueprint',
        title: '结束剧情',
        position: { x: 980, y: 40, w: 160, h: 80 },
        minWidth: 160,
        minHeight: 80,
        inputs: [{ name: '前序', portType: 'GraphFlow' }],
        outputs: [],
        customData: {},
      },
    ],
    connections: [
      { fromNodeId: 'node_entrance', fromPortIndex: 0, toNodeId: 'node_lock', toPortIndex: 0 },
      { fromNodeId: 'node_lock', fromPortIndex: 0, toNodeId: 'node_chat', toPortIndex: 0 },
      { fromNodeId: 'node_chat', fromPortIndex: 0, toNodeId: 'node_unlock', toPortIndex: 0 },
      { fromNodeId: 'node_unlock', fromPortIndex: 0, toNodeId: 'node_end', toPortIndex: 0 },
    ],
  };
}

function buildTsStory(beat) {
  const { storyId, chatId, name } = beat;
  return `/*
 * AUTO-GENERATED by tools/story/generate_dialogue_stories.mjs from story graph ${storyId}.
 * Do not edit manually — re-export from the story editor, or re-run the generator.
 */
import { AbsStory } from '../AbsStory';

export class TsStory${storyId} extends AbsStory {
    public readonly storyId = ${storyId};

    protected async onStart(): Promise<void> {
        //OnStart — ${name}
        await this.LockPlayerInputBlueprint_0();

    }


    protected async onEnd(): Promise<void> {
        //OnEnd
        // (empty)

    }


    protected async onInterrupted(): Promise<void> {
        //OnInterrupted
        // (empty)

    }



    private async LockPlayerInputBlueprint_0(): Promise<void> {
        this.setPlayerInputLocked(true);
        await this.StartChatBlueprint_1();

    }


    private async StartChatBlueprint_1(): Promise<void> {
        await this.startChat(${chatId} | 0);
        await this.UnlockPlayerInputBlueprint_2();

    }


    private async UnlockPlayerInputBlueprint_2(): Promise<void> {
        this.setPlayerInputLocked(false);
        await this.StoryEndBlueprint_3();

    }


    private async StoryEndBlueprint_3(): Promise<void> {
        await this.endStory();
    }
}
`;
}

function buildClassMap(beats) {
  const imports = beats
    .map((b) => `import { TsStory${b.storyId} } from './TsStory${b.storyId}';`)
    .join('\n');
  const entries = beats.map((b) => `  ${b.storyId}: () => new TsStory${b.storyId}(),`).join('\n');
  return `/*
 * AUTO-GENERATED by tools/story/generate_dialogue_stories.mjs. Do not edit manually.
 */
import type { AbsStory } from '../AbsStory';
${imports}

const MAP: Record<number, () => AbsStory> = {
${entries}
};

export function createTsStory(storyId: number): AbsStory | null {
  const factory = MAP[storyId | 0];
  return factory ? factory() : null;
}

export function listExportedStoryIds(): number[] {
  return Object.keys(MAP).map((k) => Number(k));
}
`;
}

function main() {
  const graphsRoot = path.join(ROOT, 'assets/resources/story-graphs');
  const genRoot = path.join(ROOT, 'assets/scripts/story/generated');
  ensureDir(graphsRoot);
  ensureDir(genRoot);
  if (!fs.existsSync(graphsRoot + '.meta')) writeDirMeta(graphsRoot);

  const storyDirMeta = path.join(ROOT, 'assets/scripts/story.meta');
  if (!fs.existsSync(storyDirMeta)) writeDirMeta(path.join(ROOT, 'assets/scripts/story'));
  if (!fs.existsSync(genRoot + '.meta')) writeDirMeta(genRoot);

  for (const beat of BEATS) {
    const folder = path.join(graphsRoot, String(beat.storyId));
    ensureDir(folder);
    if (!fs.existsSync(folder + '.meta')) writeDirMeta(folder);

    const index = {
      storyId: beat.storyId,
      name: beat.name,
      description: `scriptId=${beat.scriptId}; Lock→StartChat(${beat.chatId})→Unlock→End`,
      category: 'mainline',
      exportFlag: true,
    };
    const indexPath = path.join(folder, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
    if (!fs.existsSync(indexPath + '.meta')) writeJsonMeta(indexPath);

    const graphPath = path.join(folder, 'graph.graph.json');
    fs.writeFileSync(graphPath, JSON.stringify(buildGraph(beat), null, 2) + '\n');
    if (!fs.existsSync(graphPath + '.meta')) writeJsonMeta(graphPath);

    const tsPath = path.join(genRoot, `TsStory${beat.storyId}.ts`);
    fs.writeFileSync(tsPath, buildTsStory(beat));
    if (!fs.existsSync(tsPath + '.meta')) writeTsMeta(tsPath);
  }

  const mapPath = path.join(genRoot, 'TsStoryClassMap.ts');
  fs.writeFileSync(mapPath, buildClassMap(BEATS));
  if (!fs.existsSync(mapPath + '.meta')) writeTsMeta(mapPath);

  // Runtime .meta for core story modules if missing
  for (const name of [
    'AbsStory.ts',
    'StoryRuntime.ts',
    'StoryFlags.ts',
    'GameEvent.ts',
    'StoryChatHost.ts',
    'DialogueScripts.ts',
    'ScriptStoryMap.ts',
  ]) {
    const p = path.join(ROOT, 'assets/scripts/story', name);
    if (fs.existsSync(p) && !fs.existsSync(p + '.meta')) writeTsMeta(p);
  }

  console.log(`Generated ${BEATS.length} story graphs + TsStory classes →`);
  console.log(`  ${graphsRoot}`);
  console.log(`  ${genRoot}`);
}

main();
