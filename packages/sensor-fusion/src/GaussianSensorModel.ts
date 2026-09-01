/**
 * VIBE SpatialOS - Gaussian Sensor Uncertainty & Covariance Modeling
 * Computes state-dependent 3D measurement covariance matrices Σ ∈ ℝ³ˣ³
 * for optical ToF, Wi-Fi CSI RF, 500Hz IMU wearables, and BCI motor intent priors.
 */

import { Vector3 } from '@vibe/spatial-core';

export type SensorModality =
  | 'TOF_OPTICAL'
  | 'RF_CSI_SENSING'
  | 'IMU_INERTIAL_500HZ'
  | 'BCI_MOTOR_INTENT';

export interface Covariance3D {
  xx: number;
  yy: number;
  zz: number;
}

export interface SensorMeasurement {
  modality: SensorModality;
  position: Vector3;
  velocity?: Vector3;
  timestampMs: number;
  rawConfidence: number; // 0.0 to 1.0
  covariance: Covariance3D;
  isOccluded?: boolean;
}

export class GaussianSensorModel {
  /**
   * Evaluates dynamic 3D covariance for optical Time-of-Flight (VL53L5CX / Cameras)
   */
  public static computeToFCovariance(
    distanceFromSensorM: number,
    confidence: number,
    isOccluded: boolean = false
  ): Covariance3D {
    if (isOccluded || confidence < 0.15) {
      // Near-infinite variance when occluded (effectively ignored in Kalman update)
      return { xx: 1e5, yy: 1e5, zz: 1e5 };
    }

    // Baseline 1.5mm standard deviation at 0.5m, scaling with distance squared
    const distFactor = Math.max(1.0, distanceFromSensorM / 0.5);
    const sigmaBase = 0.0015 * (distFactor * distFactor) / Math.max(0.2, confidence);
    const variance = sigmaBase * sigmaBase;

    return {
      xx: variance,
      yy: variance,
      zz: variance * 1.4 // Higher longitudinal depth uncertainty
    };
  }

  /**
   * Evaluates dynamic 3D covariance for RF Wi-Fi CSI Sensing (π RuView / rvCSI)
   */
  public static computeRFCovariance(
    snrDb: number,
    confidence: number
  ): Covariance3D {
    // Macro room presence: ~75mm standard deviation at 30dB SNR
    const snrFactor = Math.max(0.5, 30.0 / Math.max(10.0, snrDb));
    const sigmaBase = 0.075 * snrFactor / Math.max(0.3, confidence);
    const variance = sigmaBase * sigmaBase;

    return {
      xx: variance,
      yy: variance * 0.9,
      zz: variance * 1.2
    };
  }

  /**
   * Evaluates dynamic 3D covariance for VIBE Pulse 500Hz 9-DoF IMU
   */
  public static computeIMUCovariance(
    dtSinceLastAnchorSec: number,
    accelMagnitude: number
  ): Covariance3D {
    // High dynamic fidelity, accumulating drift: σ = σ_base + ½ * a_noise * dt²
    const baseSigma = 0.006;
    const driftSigma = 0.5 * 0.15 * (dtSinceLastAnchorSec * dtSinceLastAnchorSec);
    const dynamicSigma = baseSigma + driftSigma + (accelMagnitude > 15.0 ? 0.012 : 0.0);
    const variance = dynamicSigma * dynamicSigma;

    return {
      xx: variance,
      yy: variance,
      zz: variance
    };
  }

  /**
   * Evaluates prior covariance for BCI Motor Intent
   */
  public static computeBCICovariance(
    intentConfidence: number
  ): Covariance3D {
    // Coarse spatial prior: ~140mm standard deviation
    const sigma = 0.140 / Math.max(0.5, intentConfidence);
    const variance = sigma * sigma;

    return {
      xx: variance,
      yy: variance,
      zz: variance
    };
  }
}
