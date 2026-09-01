import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  WearableDeviceManager,
  MathCore,
  WristGestureType
} from '@vibe/spatial-core';

describe('WearableDeviceManager - VIBE Pulse 9-DoF IMU, EMG & MIDI 2.0', () => {
  let manager: WearableDeviceManager;

  beforeEach(() => {
    manager = new WearableDeviceManager();
  });

  it('should detect rapid wrist flick right (clockwise) and trigger REDO action', () => {
    let triggeredGesture: WristGestureType | null = null;
    let triggeredAction: string | undefined;

    manager.addGestureListener((gesture, action) => {
      triggeredGesture = gesture;
      triggeredAction = action;
    });

    const gesture = manager.processIMUFrame({
      timestampMs: 1000,
      gyroDps: { x: 10, y: 15, z: 520.0 }, // Roll rate > 420 dps
      accelG: { x: 0, y: 1, z: 0 },
      quaternion: MathCore.quatIdentity(),
      emgIntensity: 0.15,
      batteryPercent: 95
    });

    assert.strictEqual(gesture, 'FLICK_RIGHT');
    assert.strictEqual(triggeredGesture, 'FLICK_RIGHT');
    assert.strictEqual(triggeredAction, 'REDO');
  });

  it('should detect rapid wrist flick left (counter-clockwise) and trigger UNDO action', () => {
    const gesture = manager.processIMUFrame({
      timestampMs: 1000,
      gyroDps: { x: 0, y: 0, z: -550.0 }, // Roll rate < -420 dps
      accelG: { x: 0, y: 1, z: 0 },
      quaternion: MathCore.quatIdentity(),
      emgIntensity: 0.1,
      batteryPercent: 90
    });

    assert.strictEqual(gesture, 'FLICK_LEFT');
    assert.strictEqual(manager.getActionForGesture('FLICK_LEFT'), 'UNDO');
  });

  it('should enforce cooldown period between consecutive wrist flicks', () => {
    manager.processIMUFrame({
      timestampMs: 1000,
      gyroDps: { x: 0, y: 0, z: 550.0 },
      accelG: { x: 0, y: 1, z: 0 },
      quaternion: MathCore.quatIdentity(),
      emgIntensity: 0.1,
      batteryPercent: 90
    });

    // Second flick within 100ms (cooldown is 350ms)
    const quickFlick = manager.processIMUFrame({
      timestampMs: 1080,
      gyroDps: { x: 0, y: 0, z: 550.0 },
      accelG: { x: 0, y: 1, z: 0 },
      quaternion: MathCore.quatIdentity(),
      emgIntensity: 0.1,
      batteryPercent: 90
    });

    assert.strictEqual(quickFlick, null);
  });

  it('should detect EMG muscle squeeze and release with hysteresis suppression', () => {
    // 1. Muscle squeeze above enter threshold (0.62)
    const squeezeStart = manager.processIMUFrame({
      timestampMs: 1000,
      gyroDps: { x: 0, y: 0, z: 0 },
      accelG: { x: 0, y: 1, z: 0 },
      quaternion: MathCore.quatIdentity(),
      emgIntensity: 0.85,
      batteryPercent: 90
    });

    assert.strictEqual(squeezeStart, 'SQUEEZE_START');
    assert.strictEqual(manager.isGripSqueezing(), true);

    // 2. Intermediate tension (0.45) should retain grip state (hysteresis)
    manager.processIMUFrame({
      timestampMs: 1050,
      gyroDps: { x: 0, y: 0, z: 0 },
      accelG: { x: 0, y: 1, z: 0 },
      quaternion: MathCore.quatIdentity(),
      emgIntensity: 0.45,
      batteryPercent: 90
    });
    assert.strictEqual(manager.isGripSqueezing(), true);

    // 3. Drop below exit threshold (0.35)
    const squeezeRelease = manager.processIMUFrame({
      timestampMs: 1100,
      gyroDps: { x: 0, y: 0, z: 0 },
      accelG: { x: 0, y: 1, z: 0 },
      quaternion: MathCore.quatIdentity(),
      emgIntensity: 0.20,
      batteryPercent: 90
    });

    assert.strictEqual(squeezeRelease, 'SQUEEZE_RELEASE');
    assert.strictEqual(manager.isGripSqueezing(), false);
  });

  it('should detect vertical pitch tilt and engage PLANE_XY_VERTICAL lock', () => {
    // Quaternion rotated 45 degrees around X-axis (Pitch)
    const qPitch45 = MathCore.quatFromAxisAngle({ x: 1, y: 0, z: 0 }, (45 * Math.PI) / 180);

    const gesture = manager.processIMUFrame({
      timestampMs: 1000,
      gyroDps: { x: 0, y: 0, z: 0 },
      accelG: { x: 0, y: 0.707, z: 0.707 },
      quaternion: qPitch45,
      emgIntensity: 0.1,
      batteryPercent: 90
    });

    assert.strictEqual(gesture, 'PITCH_TILT_VERTICAL');
    assert.strictEqual(manager.getActivePlaneLock(), 'PLANE_XY_VERTICAL');
  });

  it('should allow user custom action remapping', () => {
    manager.setCustomMapping('FLICK_LEFT', 'SWITCH_CAMERA_ORTHO');
    assert.strictEqual(manager.getActionForGesture('FLICK_LEFT'), 'SWITCH_CAMERA_ORTHO');
  });

  it('should route and scale MIDI 2.0 / WebHID CC messages to 3D parameters', () => {
    // CC1 (Modulation) -> explosionFactor [0.0 .. 1.0]
    const resMod = manager.processMidiMessage({
      channel: 1,
      controlNumber: 1,
      value: 64 // ~50%
    });

    assert.ok(resMod);
    assert.strictEqual(resMod.property, 'explosionFactor');
    assert.strictEqual(Math.abs(resMod.scaledValue - 0.5039) < 0.01, true);

    // CC10 (Pan) -> semanticLOD [0.0 .. 3.0]
    const resLod = manager.processMidiMessage({
      channel: 1,
      controlNumber: 10,
      value: 127 // 100% -> 3.0
    });

    assert.ok(resLod);
    assert.strictEqual(resLod.property, 'semanticLOD');
    assert.strictEqual(resLod.scaledValue, 3.0);
  });
});
