/**
 * VIBE SpatialOS - Occlusion Handover & Multi-Sensory Fallback Manager
 * Manages seamless transitions when optical line-of-sight is blocked,
 * switching to high-rate IMU dead-reckoning anchored by Wi-Fi CSI RF presence.
 */

import { Vector3, MathCore } from '@vibe/spatial-core';
import { MultimodalKalmanFilter, FusedSpatialState } from './MultimodalKalmanFilter.js';
import { GaussianSensorModel, SensorMeasurement } from './GaussianSensorModel.js';

export type HandoverMode = 'OPTICAL_DOMINANT' | 'OCCLUDED_IMU_RF_FALLBACK' | 'RF_PROXIMITY_ONLY';

export class OcclusionHandoverManager {
  private mode: HandoverMode = 'OPTICAL_DOMINANT';
  private occlusionStartTimeMs: number = 0;
  private lastOpticalFix: Vector3 = { x: 0, y: 1.2, z: -0.4 };
  public readonly filter: MultimodalKalmanFilter;

  constructor(initialPosition: Vector3 = { x: 0, y: 1.2, z: -0.4 }) {
    this.filter = new MultimodalKalmanFilter(initialPosition);
    this.lastOpticalFix = { ...initialPosition };
  }

  /**
   * Processes multi-sensory packet frame and resolves occlusion handover
   */
  public processSensors(params: {
    tofMeasurement?: { position: Vector3; confidence: number; isOccluded?: boolean };
    rfMeasurement?: { position: Vector3; snrDb: number; confidence: number };
    imuMeasurement?: { linearAccel: Vector3; angularVel: Vector3; dtSec: number };
    timestampMs: number;
  }): FusedSpatialState {
    const { tofMeasurement, rfMeasurement, imuMeasurement, timestampMs } = params;

    // 1. Predict EKF state forward
    this.filter.predict(timestampMs);

    // 2. Assess Occlusion Status
    const isToFOccluded = !tofMeasurement || tofMeasurement.isOccluded || tofMeasurement.confidence < 0.20;

    if (isToFOccluded) {
      if (this.mode === 'OPTICAL_DOMINANT') {
        this.mode = 'OCCLUDED_IMU_RF_FALLBACK';
        this.occlusionStartTimeMs = timestampMs;
      }
    } else {
      this.mode = 'OPTICAL_DOMINANT';
      this.occlusionStartTimeMs = 0;
      this.lastOpticalFix = { ...tofMeasurement.position };
    }

    // 3. Inject Measurements into Fusion Filter

    // A. Optical ToF (if visible)
    if (tofMeasurement && !isToFOccluded) {
      const cov = GaussianSensorModel.computeToFCovariance(0.5, tofMeasurement.confidence, false);
      const m: SensorMeasurement = {
        modality: 'TOF_OPTICAL',
        position: tofMeasurement.position,
        timestampMs,
        rawConfidence: tofMeasurement.confidence,
        covariance: cov,
        isOccluded: false
      };
      this.filter.update(m);
    }

    // B. Wi-Fi CSI RF Sensing (Always active anchor)
    if (rfMeasurement) {
      const cov = GaussianSensorModel.computeRFCovariance(rfMeasurement.snrDb, rfMeasurement.confidence);
      const m: SensorMeasurement = {
        modality: 'RF_CSI_SENSING',
        position: rfMeasurement.position,
        timestampMs,
        rawConfidence: rfMeasurement.confidence,
        covariance: cov,
        isOccluded: false
      };
      this.filter.update(m);
    }

    // C. 500Hz Wearable IMU
    if (imuMeasurement) {
      const dtSinceAnchor = isToFOccluded ? (timestampMs - this.occlusionStartTimeMs) / 1000.0 : 0.002;
      const accelMag = MathCore.v3Length(imuMeasurement.linearAccel);
      const cov = GaussianSensorModel.computeIMUCovariance(dtSinceAnchor, accelMag);

      // Synthesize high-rate integrated estimate from previous state + acceleration
      const currentState = this.filter.getFusedState();
      const posEstimate = MathCore.v3Add(
        currentState.position,
        MathCore.v3Scale(currentState.velocity, imuMeasurement.dtSec)
      );

      const m: SensorMeasurement = {
        modality: 'IMU_INERTIAL_500HZ',
        position: posEstimate,
        velocity: currentState.velocity,
        timestampMs,
        rawConfidence: 0.92,
        covariance: cov,
        isOccluded: false
      };
      this.filter.update(m);
    }

    return this.filter.getFusedState();
  }

  public getHandoverMode(): HandoverMode {
    return this.mode;
  }

  public isOccluded(): boolean {
    return this.mode !== 'OPTICAL_DOMINANT';
  }
}
