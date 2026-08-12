"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStoryGraphProfile = buildStoryGraphProfile;
const storyNodes_1 = require("./nodes/storyNodes");
function buildStoryGraphProfile() {
    return {
        name: 'story',
        useLightTheme: false,
        nodeFilter: {
            allowAll: false,
            whitelist: [...(0, storyNodes_1.storyNodeTypeNames)(), ...storyNodes_1.BUILTIN_WHITELIST],
            blacklist: [],
        },
    };
}
//# sourceMappingURL=profile.js.map