    private {{METHOD_NAME}}(): void {
        const hitTimes = this.parseHitTimes({{INNER_hitTimes}});
        this.playAnimation(
            {{INNER_paramName}},
            {{INNER_paramValue}},
            hitTimes,
            (index) => this.{{METHOD_NAME}}_OnHitPoint(index),
            {{INNER_sticky}}
        );
{{FLOW_0}}
    }

    private {{METHOD_NAME}}_OnHitPoint(index: number): void {
        switch (index) {
            case 0: {
{{FLOW_1}}
                break;
            }
            case 1: {
{{FLOW_2}}
                break;
            }
            case 2: {
{{FLOW_3}}
                break;
            }
            default:
                break;
        }
    }
