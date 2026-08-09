import { _decorator, Component, instantiate, Node, Prefab, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Drops a small demo strip of world prefabs into World/Layers for visual check.
 * Assign Prefab arrays in the Inspector after opening Main.scene.
 */
@ccclass('DemoTownBootstrap')
export class DemoTownBootstrap extends Component {
    @property(Node)
    midground: Node = null!;

    @property(Node)
    ground: Node = null!;

    @property(Node)
    foreground: Node = null!;

    @property([Prefab])
    groundTiles: Prefab[] = [];

    @property([Prefab])
    midProps: Prefab[] = [];

    @property([Prefab])
    foreProps: Prefab[] = [];

    start() {
        this.spawnRow(this.ground, this.groundTiles, -192, -200, 64);
        this.spawnRow(this.midground, this.midProps, -280, 40, 140);
        this.spawnRow(this.foreground, this.foreProps, -200, 120, 120);
    }

    private spawnRow(parent: Node, list: Prefab[], startX: number, y: number, gap: number) {
        if (!parent || !list.length) return;
        list.forEach((prefab, i) => {
            if (!prefab) return;
            const node = instantiate(prefab);
            node.setParent(parent);
            node.setPosition(new Vec3(startX + i * gap, y, 0));
        });
    }
}
