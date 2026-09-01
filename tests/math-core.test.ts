/**
 * VIBE SpatialOS - Automated Test Suite
 * Mathematical verification for OBB intersections, SVD Kabsch calibrator,
 * Schmitt-trigger hysteresis, and binary packet decoder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MathCore,
  HysteresisGestureFilter,
  KalmanExtrapolator,
  HapticsAMSolver,
  PacketDecoder
} from '../packages/spatial-core/src/index.js';

import { KabschCalibrator } from '../packages/closed-loop/src/index.js';

describe('Spatial Math Core & OBB Collision', () => {
  it('should rotate vectors correctly with quaternions', () => {
    // 90-degree rotation around Y axis: (1, 0, 0) -> (0, 0, -1)
    const q = MathCore.quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    const v = { x: 1, y: 0, z: 0 };
    const rotated = MathCore.rotateVectorByQuat(v, q);

    assert.ok(Math.abs(rotated.x - 0) < 1e-5);
    assert.ok(Math.abs(rotated.y - 0) < 1e-5);
    assert.ok(Math.abs(rotated.z - (-1)) < 1e-5);
  });

  it('should intersect Ray with an Oriented Bounding Box (OBB)', () => {
    // Box at (0, 1, 0) rotated 45 degrees around Y, half-extents (0.5, 0.5, 0.5)
    const q = MathCore.quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 4);
    const box = {
      position: { x: 0, y: 1, z: 0 },
      rotation: q,
      halfExtents: { x: 0.5, y: 0.5, z: 0.5 }
    };

    // Ray aimed directly along -Z towards box center from (0, 1, 2)
    const rayOrigin = { x: 0, y: 1, z: 2 };
    const rayDir = { x: 0, y: 0, z: -1 };

    const hitDist = MathCore.intersectRayOBB(rayOrigin, rayDir, box);
    assert.ok(hitDist !== null);
    assert.ok(hitDist > 0 && hitDist < 2.0);

    // Ray completely missing the box
    const missRay = MathCore.intersectRayOBB({ x: 5, y: 5, z: 5 }, { x: 0, y: 1, z: 0 }, box);
    assert.strictEqual(missRay, null);
  });

  it('should score targets accurately using Gaussian Cone-Casting', () => {
    const origin = { x: 0, y: 0, z: 0 };
    const dir = { x: 0, y: 0, z: -1 };
    const targetOnAxis = { x: 0, y: 0, z: -2 };
    const targetOffAxis = { x: 1.5, y: 0, z: -2 };

    const scoreOn = MathCore.evaluateConeConfidence(origin, dir, targetOnAxis);
    const scoreOff = MathCore.evaluateConeConfidence(origin, dir, targetOffAxis);

    assert.ok(scoreOn > 0.4);
    assert.strictEqual(scoreOff, 0.0);
  });
});

describe('Schmitt Trigger Gesture Hysteresis', () => {
  it('should suppress chatter at boundary thresholds (20mm enter / 35mm exit)', () => {
    const filter = new HysteresisGestureFilter(20.0, 35.0);

    // Initial state: open hand (45mm)
    let evt = filter.updatePinch(45.0);
    assert.strictEqual(evt.active, false);

    // Moving closer (25mm) -> still not triggered (needs <= 20mm)
    evt = filter.updatePinch(25.0);
    assert.strictEqual(evt.active, false);

    // Entering pinch (18mm) -> triggered!
    evt = filter.updatePinch(18.0);
    assert.strictEqual(evt.active, true);
    assert.strictEqual(evt.type, 'PINCH_START');

    // Opening slightly to 30mm (between 20mm and 35mm) -> MUST REMAIN ACTIVE due to hysteresis
    evt = filter.updatePinch(30.0);
    assert.strictEqual(evt.active, true);
    assert.strictEqual(evt.type, 'PINCH_HOLD');

    // Opening beyond exit threshold (38mm) -> released!
    evt = filter.updatePinch(38.0);
    assert.strictEqual(evt.active, false);
    assert.strictEqual(evt.type, 'PINCH_RELEASE');
  });
});

describe('Kabsch-Umeyama SVD Closed-Loop Calibration', () => {
  it('should accurately recover 6-DoF rigid transform and minimize disparity', () => {
    const calibrator = new KabschCalibrator(1.0);

    const expected = [
      { x: -1, y: 0, z: -1 },
      { x: 1, y: 0, z: -1 },
      { x: -1, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 }
    ];

    // Shift observed by +0.1 in X and +0.05 in Y
    const observed = expected.map(p => ({
      x: p.x + 0.1,
      y: p.y + 0.05,
      z: p.z
    }));

    const result = calibrator.solve(expected, observed);
    assert.ok(result.converged);
    assert.ok(result.rmsErrorMm < 0.1);
    assert.ok(Math.abs(result.translation.x - 0.1) < 1e-4);
    assert.ok(Math.abs(result.translation.y - 0.05) < 1e-4);
  });
});

describe('Ultrasonic Phased Array Haptics Solver', () => {
  it('should compute valid phase delays and acoustic peak pressure for focal target', () => {
    const solver = new HapticsAMSolver(4, 4, 0.015);
    const focal = { x: 0, y: 0, z: 0.1 }; // 10cm above array
    solver.solveFocalPoint(focal);

    const transducers = solver.getTransducers();
    assert.strictEqual(transducers.length, 16);
    transducers.forEach(t => {
      assert.ok(t.phaseRad >= 0 && t.phaseRad <= 2 * Math.PI);
    });

    const { magnitude, amModulated } = solver.computePressureAt(focal, 0.0);
    assert.ok(magnitude > 0);
  });
});

describe('Packet Decoder & CRC16', () => {
  it('should encode and decode binary spatial frames with valid CRC16', () => {
    const originalFrame = {
      nodeId: 2,
      hardwareTimestampMicros: 1234567,
      quaternion: { w: 1, x: 0, y: 0, z: 0 },
      depthMatrixMm: new Array(64).fill(600),
      confidence: new Array(64).fill(255)
    };

    const encodedBuffer = PacketDecoder.encode(originalFrame);
    assert.strictEqual(encodedBuffer.length, PacketDecoder.PACKET_SIZE_BYTES);

    const decoded = PacketDecoder.decode(encodedBuffer);
    assert.ok(decoded !== null);
    assert.strictEqual(decoded.crcValid, true);
    assert.strictEqual(decoded.nodeId, 2);
    assert.strictEqual(decoded.depthMatrixMm[0], 600);
  });
});
