'use strict';

import { NodeRegistry } from './core/NodeRegistry';
import { PortTypeRegistry } from './core/PortTypeRegistry';
import { BUILTIN_NODES, createSandboxGraphJSON } from './nodes/builtins';
import type { OpenGraphPayload, UnregisterNodesPayload } from './api/messages';
import type { NodeDefinition, PortTypeDef } from './nodes/types';
import type { GraphProfileJSON } from './core/GraphProfile';
import type { NodeGraphJSON } from './core/NodeGraph';

const PKG = 'node-graph';

let pendingOpen: OpenGraphPayload | null = null;
let panelReady = false;

function ensureBuiltins(): void {
  PortTypeRegistry.ensureInit();
  if (!NodeRegistry.get('FlowStart')) {
    NodeRegistry.registerMany(BUILTIN_NODES);
  }
}

async function ensurePanelOpen(): Promise<void> {
  Editor.Panel.open(PKG);
  // wait briefly for panel ready
  for (let i = 0; i < 40; i++) {
    if (panelReady) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function pushToPanel(payload: OpenGraphPayload): Promise<void> {
  await ensurePanelOpen();
  await Editor.Message.request(PKG, 'load-into-panel', payload);
}

export const methods = {
  openPanel() {
    ensureBuiltins();
    Editor.Panel.open(PKG);
  },

  async openSandbox() {
    ensureBuiltins();
    pendingOpen = { graph: createSandboxGraphJSON() as NodeGraphJSON };
    await pushToPanel(pendingOpen);
    pendingOpen = null;
  },

  async openGraph(payload: OpenGraphPayload = {}) {
    ensureBuiltins();
    pendingOpen = payload || {};
    await pushToPanel(pendingOpen);
    pendingOpen = null;
  },

  registerNodes(arg: NodeDefinition[] | { nodes: NodeDefinition[] }) {
    ensureBuiltins();
    const nodes = Array.isArray(arg) ? arg : arg?.nodes ?? [];
    NodeRegistry.registerMany(nodes);
    Editor.Message.send(PKG, 'panel-refresh-registry');
    return { ok: true, count: nodes.length };
  },

  registerPortTypes(arg: PortTypeDef[] | { portTypes: PortTypeDef[] }) {
    ensureBuiltins();
    const portTypes = Array.isArray(arg) ? arg : arg?.portTypes ?? [];
    PortTypeRegistry.registerMany(portTypes);
    Editor.Message.send(PKG, 'panel-refresh-registry');
    return { ok: true, count: portTypes.length };
  },

  unregisterNodes(arg: UnregisterNodesPayload) {
    const typeNames = Array.isArray(arg) ? arg : arg?.typeNames ?? [];
    NodeRegistry.unregister(typeNames);
    Editor.Message.send(PKG, 'panel-refresh-registry');
    return { ok: true, count: typeNames.length };
  },

  queryNodeDefs() {
    ensureBuiltins();
    return NodeRegistry.toJSONList();
  },

  queryPortTypes() {
    ensureBuiltins();
    return PortTypeRegistry.list();
  },

  onPanelReady() {
    panelReady = true;
    ensureBuiltins();
    if (pendingOpen) {
      const p = pendingOpen;
      pendingOpen = null;
      Editor.Message.send(PKG, 'load-into-panel', p);
    }
    return {
      nodes: NodeRegistry.toJSONList(),
      portTypes: PortTypeRegistry.list(),
    };
  },

  onPanelClosed() {
    panelReady = false;
  },

  async getGraph() {
    return Editor.Message.request(PKG, 'panel-get-graph');
  },

  async setGraph(graph: NodeGraphJSON | Partial<NodeGraphJSON>) {
    return Editor.Message.request(PKG, 'panel-set-graph', { graph });
  },

  async saveGraph(arg?: { path?: string }) {
    return Editor.Message.request(PKG, 'panel-save-graph', arg || {});
  },
};

export function load() {
  ensureBuiltins();
  console.log('[node-graph] extension loaded');
}

export function unload() {
  panelReady = false;
  console.log('[node-graph] extension unloaded');
}

// re-export types for consumers reading source
export type { OpenGraphPayload, GraphProfileJSON, NodeDefinition, PortTypeDef };
