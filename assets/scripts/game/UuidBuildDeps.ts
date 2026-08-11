import { _decorator, Component, Prefab, SpriteFrame } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Build-time anchor only — keeps UUID-loaded sprites/prefabs inside the
 * resources bundle (Cocos cannot trace string UUIDs in *Frames.ts).
 * Not used at runtime; AssetWarmup still loads via assetManager.loadAny.
 */
@ccclass('UuidBuildDeps')
export class UuidBuildDeps extends Component {
    @property([SpriteFrame])
    spriteFrames: SpriteFrame[] = [];

    @property([Prefab])
    prefabs: Prefab[] = [];
}
