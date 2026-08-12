    private {{METHOD_NAME}}(): void {
        const interval = {{IN_0}};
        const immediate = {{INNER_immediate}};
        this.scheduleRepeating(interval, () => {
{{FLOW_1}}
        }, immediate);
{{FLOW_0}}
    }
