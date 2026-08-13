"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGuideGraphProfile = buildGuideGraphProfile;
const guideNodes_1 = require("./nodes/guideNodes");
function buildGuideGraphProfile() {
    return {
        name: 'guide',
        useLightTheme: false,
        nodeFilter: {
            allowAll: false,
            whitelist: [...(0, guideNodes_1.guideNodeTypeNames)(), ...guideNodes_1.BUILTIN_WHITELIST],
            blacklist: [],
        },
    };
}
//# sourceMappingURL=profile.js.map