    private {{METHOD_NAME}}(): void {
        const interval = {{IN_0}};
        const key = {{INNER_key}};
        const repeat = {{INNER_repeat}};
        this.scheduleBurst(key, interval, repeat, () => {
{{FLOW_1}}
        });
{{FLOW_0}}
    }
