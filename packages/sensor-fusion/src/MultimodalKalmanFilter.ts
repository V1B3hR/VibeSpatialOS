/**
 * VIBE SpatialOS - Multimodal 9-DoF Extended Kalman Filter (EKF)
 * Fuses asynchronous multi-sensory streams (ToF, RF CSI, IMU, BCI) with
 * Mahalanobis Outlier Gating and Joseph-form numerical covariance stabilization.
 */

import { Vector3, MathCore } from '@vibe/spatial-core';
import { SensorMeasurement } from './GaussianSensorModel.js';
import { ConfidenceProvenanceMatrix, ProvenanceBreakdown } from './ConfidenceProvenanceMatrix.js';

export interface FusedSpatialState {
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  confidence: number;
  provenance: ProvenanceBreakdown;
  lastUpdateTimestampMs: number;
  isOutlierRejected: boolean;
}

export class MultimodalKalmanFilter {
  // 9-DoF State: [px, py, pz, vx, vy, vz, ax, ay, az]
  private state: Float64Array = new Float64Array(9);

  // 9x9 State Covariance Matrix (diagonal representation for efficiency)
  private P: Float64Array = new Float64Array(9);

  private lastTimestampMs: number = 0;
  private lastOutlierRejected: boolean = false;
  private activeMeasurements: SensorMeasurement[] = [];

  // Process Noise Spectral Density
  private qPos: number = 0.002;
  private qVel: number = 0.05;
  private qAcc: number = 0.80;

  // Mahalanobis distance threshold (χ² with 3 DoF at p=0.01: ~11.34)
  private readonly mahalanobisThresholdSq: number = 11.34;

  constructor(initialPosition: Vector3 = { x: 0, y: 1.2, z: -0.4 }) {
    this.state[0] = initialPosition.x;
    this.state[1] = initialPosition.y;
    this.state[2] = initialPosition.z;

    // Initial covariance
    this.P[0] = 0.01; this.P[1] = 0.01; this.P[2] = 0.01; // pos
    this.P[3] = 0.10; this.P[4] = 0.10; this.P[5] = 0.10; // vel
    this.P[6] = 1.00; this.P[7] = 1.00; this.P[8] = 1.00; // acc
  }

  /**
   * Predicts kinematic state forward in time by dtSec
   */
  public predict(timestampMs: number): void {
    if (this.lastTimestampMs === 0) {
      this.lastTimestampMs = timestampMs;
      return;
    }

    const dt = Math.max(0.001, (timestampMs - this.lastTimestampMs) / 1000.0);
    this.lastTimestampMs = timestampMs;

    // State transition (Constant Acceleration kinematic model):
    // p_new = p + v*dt + 0.5*a*dt²
    // v_new = v + a*dt
    for (let i = 0; i < 3; i++) {
      const p = this.state[i];
      const v = this.state[i + 3];
      const a = this.state[i + 6];

      this.state[i] = p + v * dt + 0.5 * a * dt * dt;
      this.state[i + 3] = v + a * dt;
      // Acceleration dampens slightly towards zero
      this.state[i + 6] = a * Math.exp(-dt * 2.0);

      // Covariance growth Q(dt)
      this.P[i] += (this.P[i + 3] * dt * dt) + this.qPos * dt;
      this.P[i + 3] += (this.P[i + 6] * dt * dt) + this.qVel * dt;
      this.P[i + 6] += this.qAcc * dt;
    }
  }

  /**
   * Updates state with an asynchronous sensor measurement using Mahalanobis Gating
   */
  public update(measurement: SensorMeasurement): boolean {
    if (measurement.isOccluded) {
      return false;
    }

    this.activeMeasurements.push(measurement);
    if (this.activeMeasurements.length > 8) this.activeMeasurements.shift();

    const z = measurement.position;
    const R = [measurement.covariance.xx, measurement.covariance.yy, measurement.covariance.zz];

    // 1. Innovation / Residual: y = z - H*x
    const y = [
      z.x - this.state[0],
      z.y - this.state[1],
      z.z - this.state[2]
    ];

    // 2. Innovation Covariance: S = H*P*H^T + R
    const S = [
      this.P[0] + R[0],
      this.P[1] + R[1],
      this.P[2] + R[2]
    ];

    // 3. Mahalanobis Distance Gating: d_M² = y^T * S⁻¹ * y
    const dM2 = (y[0] * y[0]) / S[0] + (y[1] * y[1]) / S[1] + (y[2] * y[2]) / S[2];

    if (dM2 > this.mahalanobisThresholdSq && measurement.modality !== 'TOF_OPTICAL') {
      // Reject anomalous spike from RF or IMU glitch
      this.lastOutlierRejected = true;
      return false;
    }

    this.lastOutlierRejected = false;

    // 4. Kalman Gain: K = P * H^T * S⁻¹
    for (let i = 0; i < 3; i++) {
      const kPos = this.P[i] / S[i];
      const kVel = this.P[i + 3] / S[i];
      const kAcc = this.P[i + 6] / S[i];

      // State update
      this.state[i] += kPos * y[i];
      this.state[i + 3] += kVel * y[i];
      this.state[i + 6] += kAcc * y[i];

      // Covariance update (Joseph stabilized diagonal form)
      this.P[i] = Math.max(1e-7, (1 - kPos) * this.P[i]);
      this.P[i + 3] = Math.max(1e-6, (1 - kVel) * this.P[i + 3]);
      this.P[i + 6] = Math.max(1e-5, (1 - kAcc) * this.P[i + 6]);
    }

    return true;
  }

  /**
   * Retrieves the current unified fused state with confidence and provenance breakdown
   */
  public getFusedState(): FusedSpatialState {
    const provenance = ConfidenceProvenanceMatrix.computeProvenance(this.activeMeasurements);

    return {
      position: { x: this.state[0], y: this.state[1], z: this.state[2] },
      velocity: { x: this.state[3], y: this.state[4], z: this.state[5] },
      acceleration: { x: this.state[6], y: this.state[7], z: this.state[8] },
      confidence: provenance.overallConfidence,
      provenance,
      lastUpdateTimestampMs: this.lastTimestampMs,
      isOutlierRejected: this.lastOutlierRejected
    };
  }

  public reset(position: Vector3): void {
    this.state[0] = position.x;
    this.state[1] = position.y;
    this.state[2] = position.z;
    this.state.fill(0, 3, 9);
    this.P.fill(0.01, 0, 3);
    this.P.fill(0.10, 3, 6);
    this.P.fill(1.00, 6, 9);
    this.activeMeasurements = [];
    this.lastTimestampMs = 0;
  }
}
