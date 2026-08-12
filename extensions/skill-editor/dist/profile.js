"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSkillGraphProfile = buildSkillGraphProfile;
const skillNodes_1 = require("./nodes/skillNodes");
function buildSkillGraphProfile() {
    return {
        name: 'skill',
        useLightTheme: false,
        nodeFilter: {
            allowAll: false,
            whitelist: [...(0, skillNodes_1.skillNodeTypeNames)(), ...skillNodes_1.BUILTIN_WHITELIST],
            blacklist: [],
        },
    };
}
//# sourceMappingURL=profile.js.map