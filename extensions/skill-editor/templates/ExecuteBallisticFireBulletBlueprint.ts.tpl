    private {{METHOD_NAME}}(): void {
        const templateId = ({{IN_0}} as number) || {{INNER_ballisticTemplate}};
        {{OUT_0}}.length = 0;
        {{OUT_1}} = 0;
        {{OUT_2}} = null;
        {{OUT_3}}.set(0, 0, 0);
        this.fireBallisticBullet(
            templateId | 0,
            {{IN_1}},
            {{IN_2}},
            {
                prefab: {{INNER_prefab}},
                lifetimeSec: {{INNER_lifetimeSec}},
                defaultSpeed: {{INNER_defaultSpeed}},
                target: {{IN_3}} as Node | null,
                hitTargetsOut: {{OUT_0}},
                onHitAppended: (hit, hitPos) => this.{{METHOD_NAME}}_OnHit(hit, hitPos),
            }
        );
{{FLOW_0}}
    }

    /** 对齐 GameAsset GraphHitAppendedCallback：去重首次命中时写入「当前命中单位/命中坐标」并跑「命中出口」子图 */
    private {{METHOD_NAME}}_OnHit(hitEntity: Node | null, hitWorldPos?: Vec3 | null): void {
        {{OUT_2}} = hitEntity;
        {{OUT_1}} = {{OUT_0}}.length;
        if (hitWorldPos) {
            {{OUT_3}}.set(hitWorldPos.x, hitWorldPos.y, hitWorldPos.z);
        } else if (hitEntity?.isValid) {
            {{OUT_3}}.set(hitEntity.getWorldPosition());
        } else {
            {{OUT_3}}.set(0, 0, 0);
        }
{{FLOW_1}}
    }
