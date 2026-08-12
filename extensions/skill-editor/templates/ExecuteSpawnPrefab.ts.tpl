    private {{METHOD_NAME}}(): void {
        const prefab = {{INNER_prefab}};
        const sfxPrefab = {{INNER_sfxPrefab}};
        const offsetY = {{IN_0}};
        const worldPos = {{IN_1}};
        const parentSlot = {{INNER_parentSlot}};
        this.spawnPrefab(prefab, offsetY, worldPos as Vec3 | null, parentSlot | 0);
        if (sfxPrefab) {
            this.spawnPrefab(sfxPrefab, offsetY + 1, worldPos as Vec3 | null, parentSlot | 0);
        }
{{FLOW_0}}
    }
