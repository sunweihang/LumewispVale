    private {{METHOD_NAME}}(): void {
        const explodeDistance = ({{IN_0}} as number) || {{INNER_defaultExplodeDistance}};
        {{OUT_0}} = this.findLockTargetByProximity(explodeDistance);
        {{OUT_1}} = {{OUT_0}}.length;
{{FLOW_0}}
    }
