import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  HapticGridSnapper,
  SpatialWorldEngineV2,
  MathCore
} from '@vibe/spatial-core';
import { MultimodalSpatialAgent } from '@vibe/semantic-ai';

describe('HapticGridSnapper - Mid-Air Metric Grid Snapping & Virtual Rulers', () => {
  let snapper: HapticGridSnapper;

  beforeEach(() => {
    snapper = new HapticGridSnapper('10MM');
  });

  it('should snap coordinates to 10mm (0.01m) grid intervals', () => {
    // 0.122m is within 2mm of 0.120m (10mm grid line)
    const res = snapper.snap({ x: 0.122, y: 1.503, z: -0.401 });
    assert.strictEqual(res.isSnapped, true);
    assert.strictEqual(Math.abs(res.snappedPosition.x - 0.120) < 1e-4, true);
    assert.strictEqual(Math.abs(res.snappedPosition.y - 1.500) < 1e-4, true);
    assert.strictEqual(Math.abs(res.snappedPosition.z - (-0.400)) < 1e-4, true);
  });

  it('should snap coordinates to 1mm (0.001m) micro-grid intervals', () => {
    snapper.setResolution('1MM');
    const res = snapper.snap({ x: 0.1234, y: 1.5002, z: -0.4001 });
    assert.strictEqual(res.resolution, '1MM');
    assert.strictEqual(Math.abs(res.snappedPosition.x - 0.123) < 1e-4, true);
    assert.strictEqual(Math.abs(res.snappedPosition.y - 1.500) < 1e-4, true);
  });

  it('should trigger tactile detent pulses when crossing grid boundaries', () => {
    // Initial position
    snapper.snap({ x: 0.00, y: 1.00, z: 0.00 });

    // Step crossing into next 10mm cell (from 0.00 to 0.02m)
    const stepRes = snapper.snap({ x: 0.022, y: 1.00, z: 0.00 }, 0.25);
    assert.strictEqual(stepRes.detentTriggered, true);
    assert.strictEqual(stepRes.detentPressureKPa > 1.35, true);
  });

  it('should snap coordinates to CAD OBB surfaces and edges', () => {
    const obb = {
      position: { x: 0, y: 1.2, z: 0 },
      halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
      rotation: MathCore.quatIdentity()
    };

    // Point just outside +X face (x = 0.215, within 0.025m magnetic radius)
    const res = snapper.snapToOBB({ x: 0.215, y: 1.2, z: 0 }, obb, 0.03);
    assert.strictEqual(res.isSnapped, true);
    assert.strictEqual(res.snappedAxis, 'EDGE');
    assert.strictEqual(Math.abs(res.snappedPosition.x - 0.20) < 1e-4, true);
  });
});

describe('MultimodalSpatialAgent - Grid Snap Voice Intent Configuration', () => {
  let engine: SpatialWorldEngineV2;
  let agent: MultimodalSpatialAgent;

  beforeEach(() => {
    engine = new SpatialWorldEngineV2();
    agent = new MultimodalSpatialAgent(engine);
  });

  it('should configure grid snapping resolution to 1mm via voice command', async () => {
    const res = await agent.processCommand('snap to 1mm precision');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'GRID_SNAP_CONFIG');
    assert.strictEqual(res.payload.resolution, '1MM');
    assert.strictEqual(res.payload.enabled, true);
    assert.strictEqual(engine.gridSnapper.getResolution(), '1MM');
  });

  it('should disable grid snapping via voice command', async () => {
    const res = await agent.processCommand('disable grid snap');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.actionType, 'GRID_SNAP_CONFIG');
    assert.strictEqual(res.payload.enabled, false);
    assert.strictEqual(engine.gridSnapper.isEnabled(), false);
  });
});
