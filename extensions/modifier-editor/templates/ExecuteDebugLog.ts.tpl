    private {{METHOD_NAME}}(): void {
        const msg = {{IN_0}};
        const fallback = {{INNER_message}};
        this.abilityDebugLog(msg != null && msg !== '' ? String(msg) : String(fallback));
{{FLOW_0}}
    }
