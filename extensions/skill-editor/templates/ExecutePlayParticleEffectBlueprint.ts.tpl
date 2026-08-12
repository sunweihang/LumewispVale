    private {{METHOD_NAME}}(): void {
        {{OUT_0}} = this.playParticleEffect({{IN_0}} as Node | null, {
            prefab: {{INNER_prefab}},
            delayTime: {{INNER_delayTime}},
            boneSlot: {{INNER_bone}},
            position: new Vec3({{INNER_localOffsetX}}, {{INNER_localOffsetY}}, {{INNER_localOffsetZ}}),
            eulerAngles: new Vec3({{INNER_eulerX}}, {{INNER_eulerY}}, {{INNER_eulerZ}}),
            scale: {{INNER_scale}},
        });
{{FLOW_0}}
    }
