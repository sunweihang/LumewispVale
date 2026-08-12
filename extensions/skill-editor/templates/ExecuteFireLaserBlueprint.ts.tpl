    private {{METHOD_NAME}}(): void {
        {{OUT_0}} = null;
        {{OUT_1}}.set(0, 0, 0);
        {{OUT_2}} = this.fireLaser(
            {{INNER_prefab}},
            {{IN_0}} as Node | null,
            {{INNER_yOffset}},
            {{IN_1}},
            {
                durationSec: {{INNER_durationSec}},
                onHit: (hit, hitPos) => this.{{METHOD_NAME}}_OnHit(hit, hitPos),
            }
        );
{{FLOW_0}}
    }

    /** 激光瞬时命中：写入「当前命中单位/命中坐标」并跑「命中出口」子图；光束由 fireLaser 按时长销毁 */
    private {{METHOD_NAME}}_OnHit(hitEntity: Node | null, hitWorldPos?: Vec3 | null): void {
        {{OUT_0}} = hitEntity;
        if (hitWorldPos) {
            {{OUT_1}}.set(hitWorldPos.x, hitWorldPos.y, hitWorldPos.z);
        } else if (hitEntity?.isValid) {
            {{OUT_1}}.set(hitEntity.getWorldPosition());
        } else {
            {{OUT_1}}.set(0, 0, 0);
        }
{{FLOW_1}}
    }
