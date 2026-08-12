"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBallisticGraphProfile = buildBallisticGraphProfile;
const ballisticNodes_1 = require("./nodes/ballisticNodes");
function buildBallisticGraphProfile() {
    return {
        name: 'ballistic',
        useLightTheme: false,
        nodeFilter: {
            allowAll: false,
            whitelist: [...(0, ballisticNodes_1.ballisticNodeTypeNames)(), ...ballisticNodes_1.BUILTIN_WHITELIST],
            blacklist: [],
        },
    };
}
//# sourceMappingURL=profile.js.map