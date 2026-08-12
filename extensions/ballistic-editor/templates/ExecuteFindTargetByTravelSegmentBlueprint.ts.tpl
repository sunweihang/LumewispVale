    private {{METHOD_NAME}}(): void {
        const radius = ({{IN_0}} as number) || {{INNER_defaultRadius}};
        const maxCount = (({{IN_1}} as number) | 0) || {{INNER_defaultCount}};
        {{OUT_0}} = this.findTargetsByTravelSegment(radius, maxCount);
        {{OUT_1}} = {{OUT_0}}.length;
{{FLOW_0}}
    }
