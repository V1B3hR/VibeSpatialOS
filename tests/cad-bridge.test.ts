import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  CADBridgeConnector,
  SpatialWorldEngineV2,
  MathCore
} from '@vibe/spatial-core';
import { MultimodalSpatialAgent } from '@vibe/semantic-ai';

describe('CADBridgeConnector - SolidWorks, Rhino 8, Revit & Universal CAD Bus', () => {
  let bridge: CADBridgeConnector;

  beforeEach(() => {
    bridge = new CADBridgeConnector();
  });

  it('should connect and perform handshake with host CAD software (SolidWorks)', () => {
    let handshakeReceived = false;
    bridge.onMessage((msg) => {
      if (msg.type === 'HANDSHAKE') {
        handshakeReceived = true;
        assert.strictEqual(msg.host, 'SOLIDWORKS');
        assert.strictEqual(msg.payload.protocolVersion, '2.0.0');
      }
    });

    const ok = bridge.connect('SOLIDWORKS');
    assert.strictEqual(ok, true);

    const status = bridge.getStatus();
    assert.strictEqual(status.connected, true);
    assert.strictEqual(status.host, 'SOLIDWORKS');
    assert.strictEqual(handshakeReceived, true);
  });

  it('should ingest hierarchical CAD assembly tree and store constituent parts', () => {
    bridge.connect('RHINO_8');

    bridge.ingestAssemblyTree([
      {
        partId: 'part_rotor',
        partName: 'Turbine Rotor Disc',
        position: { x: 0, y: 1.2, z: 0 },
        rotation: MathCore.quatIdentity(),
        scale: { x: 1, y: 1, z: 1 },
        halfExtents: { x: 0.2, y: 0.2, z: 0.05 },
        vertexCount: 1420,
        faceCount: 2840,
        material: { colorHex: 0x00f0ff, metalness: 0.9, roughness: 0.1, opacity: 1.0 },
        parametricFeatures: { bladeCount: 24, outerRadius: 200 }
      },
      {
        partId: 'part_casing',
        partName: 'Stator Outer Casing',
        parentPartId: 'part_rotor',
        position: { x: 0, y: 1.2, z: 0 },
        rotation: MathCore.quatIdentity(),
        scale: { x: 1, y: 1, z: 1 },
        halfExtents: { x: 0.28, y: 0.28, z: 0.2 },
        vertexCount: 3200,
        faceCount: 6400,
        material: { colorHex: 0x334155, metalness: 0.8, roughness: 0.3, opacity: 0.7 }
      }
    ]);

    assert.strictEqual(bridge.getParts().length, 2);
    const rotor = bridge.getPart('part_rotor');
    assert.ok(rotor);
    assert.strictEqual(rotor.vertexCount, 1420);
    assert.strictEqual(rotor.parametricFeatures?.bladeCount, 24);
  });

  it('should modify parametric CAD dimensions and broadcast update message', () => {
    bridge.connect('SOLIDWORKS');
    bridge.ingestAssemblyTree([
      {
        partId: 'part_turbine_rotor',
        partName: 'Turbine Rotor',
        position: { x: 0, y: 0, z: 0 },
        rotation: MathCore.quatIdentity(),
        scale: { x: 1, y: 1, z: 1 },
        halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
        vertexCount: 100,
        faceCount: 200,
        material: { colorHex: 0xffffff, metalness: 0.5, roughness: 0.5, opacity: 1.0 },
        parametricFeatures: { radius: 25.0 }
      }
    ]);

    let updateEventReceived = false;
    bridge.onMessage((msg) => {
      if (msg.type === 'PARAMETRIC_UPDATE') {
        updateEventReceived = true;
        assert.strictEqual(msg.payload.featureName, 'radius');
        assert.strictEqual(msg.payload.newValue, 35.5);
      }
    });

    const ok = bridge.updateParametricFeature('part_turbine_rotor', 'radius', 35.5);
    assert.strictEqual(ok, true);
    assert.strictEqual(updateEventReceived, true);

    const part = bridge.getPart('part_turbine_rotor')!;
    assert.strictEqual(part.parametricFeatures?.radius, 35.5);
  });

  it('should dispatch 3D deictic spatial pick rays back to CAD host viewport', () => {
    bridge.connect('AUTODESK_REVIT');

    const pickMsg = bridge.dispatchDeicticPick(
      'part_beam_104',
      { x: 0.12, y: 1.45, z: -0.32 },
      { x: 0, y: -0.2, z: -1 }
    );

    assert.strictEqual(pickMsg.type, 'DEICTIC_PICK_EVENT');
    assert.strictEqual(pickMsg.host, 'AUTODESK_REVIT');
    assert.strictEqual(pickMsg.payload.selectedPartId, 'part_beam_104');
    assert.strictEqual(pickMsg.payload.pickPosition.x, 0.12);
  });
});

describe('MultimodalSpatialAgent - CAD Bridge Voice Commands', () => {
  let engine: SpatialWorldEngineV2;
  let agent: MultimodalSpatialAgent;

  beforeEach(() => {
    engine = new SpatialWorldEngineV2();
    agent = new MultimodalSpatialAgent(engine);
  });

  it('should handle voice command to connect to Rhino 8', async () => {
    const res = await agent.processCommand('connect to Rhino');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'CAD_CONNECT');
    assert.strictEqual(res.payload.host, 'RHINO_8');
    assert.strictEqual(engine.cadBridge.getStatus().host, 'RHINO_8');
  });

  it('should handle voice command to update CAD parametric feature dimension', async () => {
    engine.cadBridge.connect('SOLIDWORKS');
    const res = await agent.processCommand('update cad radius to 45mm');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'CAD_PARAMETRIC_EDIT');
    assert.strictEqual(res.payload.featureName, 'radius');
    assert.strictEqual(res.payload.value, 45);
  });
});
