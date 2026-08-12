    private {{METHOD_NAME}}(): void {
        const prefab = {{INNER_prefab}};
        const sfxPrefab = {{INNER_sfxPrefab}};
        const activateDelay = {{INNER_activateDelay}};
        const offsetY = {{IN_0}};
        const worldPos = {{IN_1}};
        {{OUT_0}} = this.startFollower(
            prefab,
            sfxPrefab,
            offsetY,
            worldPos as Vec3 | null,
            activateDelay
        );
{{FLOW_0}}
    }
