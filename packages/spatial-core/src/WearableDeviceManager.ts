/**
 * VIBE SpatialOS - Wearable Device Manager & Hardware Bus (v2.0)
 * Processes high-frequency (500Hz) telemetry from the VIBE Pulse Wristband
 * (9-DoF IMU + 4-channel EMG bio-capacitive grip) and MIDI 2.0 / WebHID control interfaces.
 * 
 * Features:
 * - Real-time gesture detection: Wrist Flick (Undo/Redo), Pitch/Roll Tilt Plane Locks (XY, XZ, YZ)
 * - EMG Bio-Grip Squeeze detection with hysteresis thresholding
 * - User-customizable action mapping table
 * - MIDI 2.0 / WebHID CC parameter binding for hardware dials, faders, and knobs
 */

import { MathCore, Vector3, Quaternion } from './MathCore.js';

export type PlaneLockMode =
  | 'FREE_6DOF'
  | 'PLANE_XY_VERTICAL'
  | 'PLANE_XZ_HORIZONTAL'
  | 'PLANE_YZ_LATERAL';

export type WristGestureType =
  | 'FLICK_LEFT'
  | 'FLICK_RIGHT'
  | 'PITCH_TILT_VERTICAL'
  | 'ROLL_TILT_HORIZONTAL'
  | 'SQUEEZE_START'
  | 'SQUEEZE_RELEASE';

export interface IMUTelemetryFrame {
  timestampMs: number;
  gyroDps: Vector3;       // Angular velocity in deg/sec
  accelG: Vector3;        // Acceleration in Gs (including gravity)
  quaternion: Quaternion; // Fused 9-DoF orientation
  emgIntensity: number;   // 0.0 (relaxed) to 1.0 (maximum squeeze)
  batteryPercent: number; // 0 to 100%
}

export interface MidiControlMessage {
  channel: number;
  controlNumber: number;
  value: number; // 0 to 127
}

export type GestureCallback = (gesture: WristGestureType, actionCommand?: string) => void;

export class WearableDeviceManager {
  private activePlaneLock: PlaneLockMode = 'FREE_6DOF';
  private isSqueezing: boolean = false;
  private lastFlickTimestampMs: number = 0;
  private flickCooldownMs: number = 350;

  // Angular velocity thresholds for flick detection
  private flickThresholdDps: number = 420.0;

  // EMG Squeeze Hysteresis thresholds
  private emgEnterThreshold: number = 0.62;
  private emgExitThreshold: number = 0.35;

  // Custom User Gesture Action Mapping Table
  private gestureActionMap: Map<WristGestureType, string> = new Map([
    ['FLICK_LEFT', 'UNDO'],
    ['FLICK_RIGHT', 'REDO'],
    ['PITCH_TILT_VERTICAL', 'LOCK_PLANE_XY'],
    ['ROLL_TILT_HORIZONTAL', 'LOCK_PLANE_XZ'],
    ['SQUEEZE_START', 'PRECISION_GRAB_LOCK'],
    ['SQUEEZE_RELEASE', 'RELEASE_GRAB_LOCK']
  ]);

  // MIDI CC Parameter Bindings (CC Number -> Target 3D Property)
  private midiBindings: Map<number, { property: string; min: number; max: number }> = new Map([
    [1, { property: 'explosionFactor', min: 0.0, max: 1.0 }],   // Modulation Wheel -> CAD Explode
    [7, { property: 'hapticIntensity', min: 0.0, max: 1.0 }],   // Volume Fader -> Phased-Array Power
    [10, { property: 'semanticLOD', min: 0.0, max: 3.0 }]        // Pan Knob -> LOD Level Selector
  ]);

  private gestureListeners: GestureCallback[] = [];

  constructor() {}

  public addGestureListener(cb: GestureCallback): void {
    this.gestureListeners.push(cb);
  }

  public removeGestureListener(cb: GestureCallback): void {
    this.gestureListeners = this.gestureListeners.filter(l => l !== cb);
  }

  public getActivePlaneLock(): PlaneLockMode {
    return this.activePlaneLock;
  }

  public isGripSqueezing(): boolean {
    return this.isSqueezing;
  }

  public setCustomMapping(gesture: WristGestureType, actionCommand: string): void {
    this.gestureActionMap.set(gesture, actionCommand);
  }

  public getActionForGesture(gesture: WristGestureType): string | undefined {
    return this.gestureActionMap.get(gesture);
  }

  public bindMidiCC(
    ccNumber: number,
    property: string,
    min: number = 0.0,
    max: number = 1.0
  ): void {
    this.midiBindings.set(ccNumber, { property, min, max });
  }

  /**
   * Ingests high-speed 500Hz telemetry frame from VIBE Pulse Wristband
   */
  public processIMUFrame(frame: IMUTelemetryFrame): WristGestureType | null {
    let detectedGesture: WristGestureType | null = null;
    const now = frame.timestampMs;

    // 1. Evaluate Wrist Flick via Angular Velocity (Gyro Z/Roll or Gyro Y/Yaw rate)
    const gyroRoll = frame.gyroDps.z;
    if (now - this.lastFlickTimestampMs > this.flickCooldownMs) {
      if (gyroRoll > this.flickThresholdDps) {
        detectedGesture = 'FLICK_RIGHT';
        this.lastFlickTimestampMs = now;
      } else if (gyroRoll < -this.flickThresholdDps) {
        detectedGesture = 'FLICK_LEFT';
        this.lastFlickTimestampMs = now;
      }
    }

    // 2. Evaluate EMG Grip Squeeze with Hysteresis
    if (!this.isSqueezing && frame.emgIntensity >= this.emgEnterThreshold) {
      this.isSqueezing = true;
      if (!detectedGesture) {
        detectedGesture = 'SQUEEZE_START';
      }
    } else if (this.isSqueezing && frame.emgIntensity <= this.emgExitThreshold) {
      this.isSqueezing = false;
      if (!detectedGesture) {
        detectedGesture = 'SQUEEZE_RELEASE';
      }
    }

    // 3. Evaluate Wrist Orientation Tilt & Lock Plane Mode
    // Derive Euler angles (Pitch, Roll) from normalized Quaternion
    const q = MathCore.quatNormalize(frame.quaternion);
    const pitchRad = Math.asin(Math.max(-1.0, Math.min(1.0, 2.0 * (q.w * q.x - q.y * q.z))));
    const rollRad = Math.atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.x * q.x + q.z * q.z));

    const pitchDeg = (pitchRad * 180.0) / Math.PI;
    const rollDeg = (rollRad * 180.0) / Math.PI;

    if (pitchDeg > 38.0) {
      if (this.activePlaneLock !== 'PLANE_XY_VERTICAL') {
        this.activePlaneLock = 'PLANE_XY_VERTICAL';
        if (!detectedGesture) detectedGesture = 'PITCH_TILT_VERTICAL';
      }
    } else if (Math.abs(pitchDeg) < 22.0 && Math.abs(rollDeg) < 25.0) {
      if (this.activePlaneLock !== 'PLANE_XZ_HORIZONTAL') {
        this.activePlaneLock = 'PLANE_XZ_HORIZONTAL';
        if (!detectedGesture) detectedGesture = 'ROLL_TILT_HORIZONTAL';
      }
    } else if (Math.abs(rollDeg) > 42.0) {
      this.activePlaneLock = 'PLANE_YZ_LATERAL';
    } else {
      this.activePlaneLock = 'FREE_6DOF';
    }

    // Notify listeners if gesture occurred
    if (detectedGesture) {
      const action = this.getActionForGesture(detectedGesture);
      this.gestureListeners.forEach(listener => listener(detectedGesture!, action));
    }

    return detectedGesture;
  }

  /**
   * Processes incoming MIDI 2.0 / WebHID CC Message and routes to 3D parameters
   */
  public processMidiMessage(
    msg: MidiControlMessage
  ): { property: string; normalizedValue: number; scaledValue: number } | null {
    const binding = this.midiBindings.get(msg.controlNumber);
    if (!binding) return null;

    const normalized = Math.max(0, Math.min(127, msg.value)) / 127.0;
    const scaled = binding.min + normalized * (binding.max - binding.min);

    return {
      property: binding.property,
      normalizedValue: normalized,
      scaledValue: scaled
    };
  }
}
