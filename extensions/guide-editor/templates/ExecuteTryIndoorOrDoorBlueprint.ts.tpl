private {{METHOD_NAME}}(): void {
        if (this.tryIndoorOrDoor({
            indoorName: {{INNER_indoorName}},
            doorName: {{INNER_doorName}},
            indoorTip: {{INNER_indoorTip}},
            doorTip: {{INNER_doorTip}},
            farTip: {{INNER_farTip}},
        })) {
{{FLOW_0}}
        } else {
{{FLOW_1}}
        }
    }
