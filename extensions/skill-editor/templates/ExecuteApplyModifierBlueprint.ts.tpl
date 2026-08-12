    private {{METHOD_NAME}}(): void {
        const templateId = ({{IN_0}} as number) || {{INNER_templateId}};
        const configId = ({{IN_1}} as number) || {{INNER_configId}};
        const duration = ({{IN_3}} as number) || {{INNER_durationSeconds}};
        this.applyModifier(
            templateId | 0,
            {{IN_2}} as Node | null,
            duration,
            configId | 0,
            {{IN_4}} as Vec3 | null
        );
{{FLOW_0}}
    }
