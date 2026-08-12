    private {{METHOD_NAME}}(): void {
        const chance = ({{IN_0}} as number) || {{INNER_chance}};
        if (this.rollChance(chance)) {
{{FLOW_0}}
        } else {
{{FLOW_1}}
        }
    }
