    private {{METHOD_NAME}}(): void {
        const forward = this.getEntityForward(this.getCaster());
        {{OUT_0}} = this.findTargetsInSector({{IN_0}}, forward, {{IN_1}}, {{IN_3}}, {{IN_2}} | 0);
        {{OUT_1}} = {{OUT_0}}.length;
{{FLOW_0}}
    }
