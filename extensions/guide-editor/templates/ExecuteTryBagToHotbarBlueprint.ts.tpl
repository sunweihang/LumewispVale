private {{METHOD_NAME}}(): void {
        if (this.tryBagToHotbar({{INNER_itemId}}, {
            ensureHoe: {{INNER_ensureHoe}},
            openTip: {{INNER_openTip}},
        })) {
{{FLOW_0}}
        } else {
{{FLOW_1}}
        }
    }
