    private {{METHOD_NAME}}(): void {
        const progressRate = ({{IN_0}} as number) || {{INNER_defaultProgressRate}};
        const lateralSpread = ({{IN_1}} as number) || {{INNER_defaultLateralSpread}};
        this.tickBezierHomingMove(progressRate, lateralSpread, {{INNER_targetYOffset}});
{{FLOW_0}}
    }
