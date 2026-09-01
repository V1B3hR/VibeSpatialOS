import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SpatialWorldEngineV2, MathCore } from '@vibe/spatial-core';
import { MultimodalSpatialAgent } from '@vibe/semantic-ai';

describe('MultimodalSpatialAgent - Multimodal Deictic Spatial AI', () => {
  let engine: SpatialWorldEngineV2;
  let agent: MultimodalSpatialAgent;

  beforeEach(() => {
    engine = new SpatialWorldEngineV2();
    agent = new MultimodalSpatialAgent(engine);

    // Register test spatial objects
    engine.registerObject({
      id: 'obj_turbine_cad',
      name: 'Jet Turbine (CAD)',
      type: 'cad_part',
      position: { x: -0.35, y: 1.2, z: -0.4 },
      rotation: MathCore.quatIdentity(),
      scale: { x: 1, y: 1, z: 1 },
      halfExtents: { x: 0.22, y: 0.22, z: 0.28 },
      metadata: { exploded: false }
    });

    engine.registerObject({
      id: 'obj_molecule_caffeine',
      name: 'Caffeine Molecule',
      type: 'molecule',
      position: { x: 0.35, y: 1.2, z: -0.4 },
      rotation: MathCore.quatIdentity(),
      scale: { x: 1, y: 1, z: 1 },
      halfExtents: { x: 0.35, y: 0.35, z: 0.25 },
      metadata: { showHydrogenBonds: true, showOrbitals: false }
    });
  });

  it('should resolve deictic reference "here" to the nearest object to user hand', async () => {
    // Position right hand close to molecule (at 0.35, 1.2, -0.4)
    engine.updateUserState({
      rightHand: {
        palmPosition: { x: 0.34, y: 1.2, z: -0.39 },
        indexTipPosition: { x: 0.34, y: 1.25, z: -0.42 },
        thumbTipPosition: { x: 0.33, y: 1.25, z: -0.41 },
        pinchDistanceMm: 40.0,
        isPinching: false,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: { x: 0.34, y: 1.2, z: -0.39 }
      }
    });

    const res = await agent.processCommand('enlarge the object here by 20%');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'SCALE');
    assert.strictEqual(res.targetObjectId, 'obj_molecule_caffeine');
    assert.strictEqual(res.payload.scale.x > 1.15, true);
  });

  it('should resolve deictic reference "there" and pointing ray to distant object', async () => {
    // Point hand towards turbine
    engine.updateUserState({
      rightHand: {
        palmPosition: { x: -0.35, y: 1.0, z: -0.1 },
        indexTipPosition: { x: -0.35, y: 1.05, z: -0.15 },
        thumbTipPosition: { x: -0.34, y: 1.05, z: -0.14 },
        pinchDistanceMm: 40.0,
        isPinching: false,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: { x: -0.35, y: 1.0, z: -0.1 }
      },
      gazeRay: {
        origin: { x: 0, y: 1.7, z: 0 },
        direction: MathCore.v3Normalize({ x: -0.35, y: -0.5, z: -0.4 })
      }
    });

    const res = await agent.processCommand('rotate that over there by 90 degrees');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'ROTATE_3D');
    assert.strictEqual(res.payload.angleDeg, 90);
  });

  it('should execute 3D rotation with pitch, yaw, roll axes and custom degrees', async () => {
    const res = await agent.processCommand('rotate turbine 3D by 45 degrees pitch');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'ROTATE_3D');
    assert.strictEqual(res.payload.angleDeg, 45);
    assert.strictEqual(res.payload.axis.x, 1); // Pitch = X-axis
    assert.strictEqual(res.payload.axis.y, 0);
  });

  it('should handle bimanual scale using two hands span distance', async () => {
    // Set left and right hands with 0.5m span
    engine.updateUserState({
      leftHand: {
        palmPosition: { x: -0.25, y: 1.2, z: -0.4 },
        indexTipPosition: { x: -0.25, y: 1.25, z: -0.45 },
        thumbTipPosition: { x: -0.24, y: 1.25, z: -0.44 },
        pinchDistanceMm: 15.0,
        isPinching: true,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: { x: -0.25, y: 1.2, z: -0.4 }
      },
      rightHand: {
        palmPosition: { x: 0.25, y: 1.2, z: -0.4 },
        indexTipPosition: { x: 0.25, y: 1.25, z: -0.45 },
        thumbTipPosition: { x: 0.24, y: 1.25, z: -0.44 },
        pinchDistanceMm: 15.0,
        isPinching: true,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: { x: 0.25, y: 1.2, z: -0.4 }
      }
    });

    const res = await agent.processCommand('use two hands to expand turbine by 50%');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'BIMANUAL_SCALE');
    assert.strictEqual(res.payload.factor, 1.5);
    assert.strictEqual(res.payload.spanDistanceMm > 400, true);
  });

  it('should handle bimanual 3D rotation', async () => {
    const res = await agent.processCommand('rotate molecule with both hands 90 degrees');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'BIMANUAL_ROTATE');
    assert.strictEqual(res.targetObjectId, 'obj_molecule_caffeine');
  });

  it('should handle spatial stretch along X/Y/Z axes', async () => {
    const res = await agent.processCommand('stretch turbine along z by 50%');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'STRETCH');
    assert.strictEqual(res.payload.axis, 'Z');
    assert.strictEqual(res.payload.scale.z, 1.5);
  });

  it('should handle Semantic LOD transitions: expand, collapse, and orbitals', async () => {
    // 1. Expand
    const expandRes = await agent.processCommand('expand turbine components');
    assert.strictEqual(expandRes.success, true);
    assert.strictEqual(expandRes.actionType, 'EXPAND');
    assert.strictEqual(agent.getSemanticLOD(), 'MECHANICAL_COMPONENT');

    // 2. Quantum orbitals
    const orbitRes = await agent.processCommand('show molecular orbital electron cloud');
    assert.strictEqual(orbitRes.success, true);
    assert.strictEqual(agent.getSemanticLOD(), 'MOLECULAR_ORBITAL');

    // 3. Collapse
    const collapseRes = await agent.processCommand('collapse CAD assembly');
    assert.strictEqual(collapseRes.success, true);
    assert.strictEqual(collapseRes.actionType, 'COLLAPSE');
    assert.strictEqual(agent.getSemanticLOD(), 'MACRO_CAD');
  });

  it('should handle wipe / wave hand gesture and reset workspace', async () => {
    // Modify an object first
    const turbine = engine.getObject('obj_turbine_cad')!;
    turbine.scale = { x: 2, y: 2, z: 2 };

    const wipeRes = await agent.processCommand('wipe workspace (wave hand)');
    assert.strictEqual(wipeRes.success, true);
    assert.strictEqual(wipeRes.actionType, 'WIPE');
    assert.strictEqual(turbine.scale.x, 1);
    assert.strictEqual(turbine.scale.y, 1);
    assert.strictEqual(turbine.scale.z, 1);
    assert.strictEqual(agent.getSemanticLOD(), 'MACRO_CAD');
  });

  it('should handle spatial translation: move here and move there', async () => {
    engine.updateUserState({
      rightHand: {
        palmPosition: { x: 0.1, y: 1.5, z: -0.2 },
        indexTipPosition: { x: 0.1, y: 1.55, z: -0.25 },
        thumbTipPosition: { x: 0.11, y: 1.55, z: -0.24 },
        pinchDistanceMm: 40.0,
        isPinching: false,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: { x: 0.1, y: 1.5, z: -0.2 }
      }
    });

    const res = await agent.processCommand('move turbine here to my hand');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'TRANSLATE');
    assert.strictEqual(res.payload.position.x, 0.1);
    assert.strictEqual(res.payload.position.y, 1.5);
  });

  it('should handle full molecular disassembly into constituent atoms', async () => {
    const res = await agent.processCommand('disassemble molecule into atoms');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'MOLECULAR_DISASSEMBLE');
    assert.strictEqual(res.payload.disassembled, true);
    assert.strictEqual(agent.getSemanticLOD(), 'MOLECULAR_ORBITAL');
  });

  it('should handle functional group isolation on molecules', async () => {
    const res = await agent.processCommand('isolate xanthine ring group on molecule');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'ISOLATE_GROUP');
    assert.strictEqual(res.payload.groupType, 'RING_CORE');
  });

  it('should handle haptic perimeter and edge tracing', async () => {
    const res = await agent.processCommand('trace haptic perimeter of turbine');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'HAPTIC_TRACE_PERIMETER');
    assert.strictEqual(res.targetObjectId, 'obj_turbine_cad');
  });

  it('should handle motion along specific 3D axes (X/Y/Z)', async () => {
    const turbine = engine.getObject('obj_turbine_cad')!;
    const initX = turbine.position.x;
    const res = await agent.processCommand('move turbine along x-axis');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'TRANSLATE');
    assert.strictEqual(turbine.position.x > initX, true);
  });

  it('should handle optical perimeter calibration', async () => {
    const res = await agent.processCommand('calibrate perimeter fiducials');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'CALIBRATE_PERIMETER');
    assert.strictEqual(res.payload.perimeter, true);
  });
});
