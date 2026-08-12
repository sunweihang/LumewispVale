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
exports.graphToString = graphToString;
exports.graphFromString = graphFromString;
exports.saveGraphToFile = saveGraphToFile;
exports.loadGraphFromFile = loadGraphFromFile;
exports.dbUrlToFsPath = dbUrlToFsPath;
exports.saveGraphToDb = saveGraphToDb;
exports.loadGraphFromDb = loadGraphFromDb;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const NodeGraph_1 = require("./NodeGraph");
function graphToString(graph, pretty = true) {
    return JSON.stringify(graph.toJSON(), null, pretty ? 2 : undefined);
}
function graphFromString(text) {
    const json = JSON.parse(text);
    return NodeGraph_1.NodeGraph.fromJSON(json);
}
function saveGraphToFile(filePath, graph) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, graphToString(graph), 'utf8');
}
function loadGraphFromFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    return graphFromString(text);
}
async function dbUrlToFsPath(dbUrl) {
    try {
        const fsPath = (await Editor.Message.request('asset-db', 'query-path', dbUrl));
        return fsPath || null;
    }
    catch {
        return null;
    }
}
async function saveGraphToDb(dbUrl, graph) {
    const content = graphToString(graph);
    let fsPath = await dbUrlToFsPath(dbUrl);
    if (!fsPath) {
        try {
            await Editor.Message.request('asset-db', 'create-asset', dbUrl, content);
            return true;
        }
        catch (e) {
            console.error('[node-graph] create-asset failed', dbUrl, e);
            return false;
        }
    }
    try {
        saveGraphToFile(fsPath, graph);
        await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
        return true;
    }
    catch (e) {
        console.error('[node-graph] save failed', dbUrl, e);
        return false;
    }
}
async function loadGraphFromDb(dbUrl) {
    const fsPath = await dbUrlToFsPath(dbUrl);
    if (!fsPath || !fs.existsSync(fsPath))
        return null;
    try {
        return loadGraphFromFile(fsPath);
    }
    catch (e) {
        console.error('[node-graph] load failed', dbUrl, e);
        return null;
    }
}
//# sourceMappingURL=serialize.js.map