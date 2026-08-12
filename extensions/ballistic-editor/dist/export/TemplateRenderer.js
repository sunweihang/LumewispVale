"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTemplate = renderTemplate;
exports.loadTemplate = loadTemplate;
exports.findNodeTemplate = findNodeTemplate;
exports.splitLifecycleMethodBlocks = splitLifecycleMethodBlocks;
exports.findLifecycleBlock = findLifecycleBlock;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("../paths");
function renderTemplate(template, placeholders) {
    let out = template;
    for (const [key, value] of Object.entries(placeholders)) {
        out = out.split(`{{${key}}}`).join(value !== null && value !== void 0 ? value : '');
    }
    return out;
}
function loadTemplate(fileName) {
    const p = path.join((0, paths_1.templatesDir)(), fileName);
    if (!fs.existsSync(p))
        return null;
    return fs.readFileSync(p, 'utf8');
}
function findNodeTemplate(typeName) {
    for (const c of [`Execute${typeName}.ts.tpl`, `${typeName}.ts.tpl`]) {
        const t = loadTemplate(c);
        if (t != null)
            return t;
    }
    return null;
}
function splitLifecycleMethodBlocks(fullText) {
    const lines = fullText.split(/\r?\n/);
    const blocks = [];
    let sb = [];
    let inBlock = false;
    const methodStart = '    protected ';
    for (const line of lines) {
        if (line.startsWith(methodStart) && line.includes('(')) {
            if (inBlock) {
                blocks.push(sb.join('\n') + '\n');
                sb = [];
            }
            inBlock = true;
        }
        if (inBlock)
            sb.push(line);
    }
    if (inBlock && sb.length > 0)
        blocks.push(sb.join('\n') + '\n');
    return blocks;
}
function findLifecycleBlock(blocks, methodName) {
    const needle = `${methodName}(`;
    for (const b of blocks) {
        if (b.includes(needle))
            return b;
    }
    return null;
}
//# sourceMappingURL=TemplateRenderer.js.map