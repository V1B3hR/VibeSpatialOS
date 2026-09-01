import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SpatialWorldEngineV2, SpatialNodeGraph, MathCore } from '@vibe/spatial-core';
import { MultimodalSpatialAgent } from '@vibe/semantic-ai';

describe('SpatialNodeGraph - Hierarchical 3D Partitioning & Wayfinding', () => {
  let graph: SpatialNodeGraph;

  beforeEach(() => {
    graph = new SpatialNodeGraph();

    graph.registerNode({
      id: 'node_fuselage',
      name: 'Aircraft Fuselage',
      category: 'ARCHITECTURAL',
      colorHex: 0x00f0ff,
      position: { x: 0, y: 1.5, z: 0 },
      halfExtents: { x: 1.0, y: 1.0, z: 4.0 },
      objectIds: ['obj_fuselage'],
      lodLevel: 'MACRO',
      isActive: true,
      metadata: { section: 'MAIN_BODY' }
    });

    graph.registerNode({
      id: 'node_left_wing',
      name: 'Left Titanium Wing',
      category: 'MECHANICAL',
      colorHex: 0x00ff88,
      position: { x: -3.5, y: 1.2, z: 0 },
      halfExtents: { x: 2.5, y: 0.3, z: 1.2 },
      objectIds: ['obj_left_wing'],
      lodLevel: 'SUB_ASSEMBLY',
      isActive: true,
      metadata: { fuelTanks: true }
    });

    graph.registerNode({
      id: 'node_left_engine',
      name: 'Jet Turbine Engine',
      category: 'MECHANICAL',
      colorHex: 0xffaa00,
      position: { x: -2.8, y: 0.8, z: -0.5 },
      halfExtents: { x: 0.6, y: 0.6, z: 1.2 },
      objectIds: ['obj_engine_1'],
      lodLevel: 'COMPONENT',
      isActive: true,
      metadata: { thrustKN: 120 }
    });

    // Connect links
    graph.registerLink({
      id: 'link_fuselage_to_wing',
      sourceNodeId: 'node_fuselage',
      targetNodeId: 'node_left_wing',
      type: 'STRUCTURAL_LOAD',
      colorHex: 0x00f0ff,
      flowIntensity: 0.9,
      bidirectional: true,
      label: 'Main Wing Spar Load'
    });

    graph.registerLink({
      id: 'link_wing_to_engine',
      sourceNodeId: 'node_left_wing',
      targetNodeId: 'node_left_engine',
      type: 'PIPING_FLUID',
      colorHex: 0xffaa00,
      flowIntensity: 1.0,
      bidirectional: false,
      label: 'Fuel Feed Line'
    });
  });

  it('should register and retrieve spatial nodes and directional links', () => {
    assert.strictEqual(graph.getAllNodes().length, 3);
    const engineNode = graph.getNode('node_left_engine');
    assert.ok(engineNode);
    assert.strictEqual(engineNode.category, 'MECHANICAL');

    const wingLinks = graph.getLinksForNode('node_left_wing');
    assert.strictEqual(wingLinks.length, 2);
  });

  it('should evaluate camera distance and partition nodes into Macro vs Detail LOD', () => {
    // Camera close to fuselage (dist = 1.0m) and far from wing/engine (dist > 3.0m)
    const cameraPos = { x: 0, y: 1.5, z: 1.0 };
    const { macroNodes, detailNodes } = graph.evaluateLODForCamera(cameraPos, 2.8);

    assert.strictEqual(detailNodes.some(n => n.id === 'node_fuselage'), true);
    assert.strictEqual(macroNodes.some(n => n.id === 'node_left_wing'), true);
  });

  it('should find shortest wayfinding route between spatial nodes (BFS)', () => {
    const path = graph.findShortestPath('node_fuselage', 'node_left_engine');
    assert.deepStrictEqual(path, ['node_fuselage', 'node_left_wing', 'node_left_engine']);
  });

  it('should search nodes by keyword or category', () => {
    const node = graph.findNodeByNameOrKeyword('engine');
    assert.ok(node);
    assert.strictEqual(node.id, 'node_left_engine');

    const archNode = graph.findNodeByNameOrKeyword('architectural');
    assert.ok(archNode);
    assert.strictEqual(archNode.id, 'node_fuselage');
  });
});

describe('MultimodalSpatialAgent - Node Graph & Wayfinding Navigation', () => {
  let engine: SpatialWorldEngineV2;
  let agent: MultimodalSpatialAgent;

  beforeEach(() => {
    engine = new SpatialWorldEngineV2();
    agent = new MultimodalSpatialAgent(engine);

    engine.nodeGraph.registerNode({
      id: 'node_turbine',
      name: 'Turbine Assembly',
      category: 'MECHANICAL',
      colorHex: 0x00f0ff,
      position: { x: -0.35, y: 1.2, z: -0.4 },
      halfExtents: { x: 0.25, y: 0.25, z: 0.3 },
      objectIds: ['obj_turbine_cad'],
      lodLevel: 'MACRO',
      isActive: true,
      metadata: {}
    });

    engine.nodeGraph.registerNode({
      id: 'node_molecule',
      name: 'Bio Molecule Complex',
      category: 'BIO_MOLECULAR',
      colorHex: 0x00ff88,
      position: { x: 0.35, y: 1.2, z: -0.4 },
      halfExtents: { x: 0.35, y: 0.35, z: 0.3 },
      objectIds: ['obj_molecule_caffeine'],
      lodLevel: 'ATOMIC',
      isActive: true,
      metadata: {}
    });

    engine.nodeGraph.registerLink({
      id: 'link_turbine_molecule',
      sourceNodeId: 'node_turbine',
      targetNodeId: 'node_molecule',
      type: 'DATA_BUS',
      colorHex: 0x00f0ff,
      flowIntensity: 0.8,
      bidirectional: true
    });
  });

  it('should execute Spatial Hyper-Jump to a specific node by voice/text command', async () => {
    const res = await agent.processCommand('jump to turbine node');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'NODE_NAVIGATE');
    assert.strictEqual(res.payload.node.id, 'node_turbine');
    assert.strictEqual(res.payload.targetPosition.x, -0.35);
    assert.strictEqual(engine.nodeGraph.getActiveFocusNodeId(), 'node_turbine');
  });

  it('should toggle and display holographic Spatial Node Graph', async () => {
    const res = await agent.processCommand('show node graph');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'NODE_GRAPH_TOGGLE');
    assert.strictEqual(res.payload.visible, true);
    assert.strictEqual(res.payload.nodes.length, 2);
  });

  it('should show holographic wayfinding directional arrows and links', async () => {
    const res = await agent.processCommand('show wayfinding arrows');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'SHOW_WAYFINDING');
    assert.strictEqual(res.payload.links.length, 1);
  });
});
