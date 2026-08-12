"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildModifierGraphProfile = buildModifierGraphProfile;
const modifierNodes_1 = require("./nodes/modifierNodes");
function buildModifierGraphProfile() {
    return {
        name: 'modifier',
        useLightTheme: false,
        nodeFilter: {
            allowAll: false,
            whitelist: [...(0, modifierNodes_1.modifierNodeTypeNames)(), ...modifierNodes_1.BUILTIN_WHITELIST],
            blacklist: [],
        },
    };
}
//# sourceMappingURL=profile.js.map