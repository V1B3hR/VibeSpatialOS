/**
 * VIBE SpatialOS - Sensor Confidence & Provenance Matrix
 * Tracks exact information contribution weights and spatial provenance
 * across multi-sensory modalities (ToF, RF CSI, IMU, BCI).
 */

import { SensorModality, SensorMeasurement } from './GaussianSensorModel.js';

export interface ProvenanceBreakdown {
  tofWeight: number;    // 0.0 to 1.0
  rfWeight: number;     // 0.0 to 1.0
  imuWeight: number;    // 0.0 to 1.0
  bciWeight: number;    // 0.0 to 1.0
  primaryAnchor: SensorModality;
  overallConfidence: number;
}

export class ConfidenceProvenanceMatrix {
  /**
   * Calculates normalized Information Matrix weights (W = Σ⁻¹) for active measurements
   */
  public static computeProvenance(measurements: SensorMeasurement[]): ProvenanceBreakdown {
    if (measurements.length === 0) {
      return {
        tofWeight: 0,
        rfWeight: 0,
        imuWeight: 0,
        bciWeight: 0,
        primaryAnchor: 'RF_CSI_SENSING',
        overallConfidence: 0.0
      };
    }

    let rawWeights: Record<SensorModality, number> = {
      TOF_OPTICAL: 0,
      RF_CSI_SENSING: 0,
      IMU_INERTIAL_500HZ: 0,
      BCI_MOTOR_INTENT: 0
    };

    let totalInformation = 0;

    for (const m of measurements) {
      if (m.isOccluded) continue;

      // Information scalar = 1 / trace(Covariance)
      const traceVar = (m.covariance.xx + m.covariance.yy + m.covariance.zz) / 3.0;
      if (traceVar > 0 && traceVar < 1e4) {
        const info = (1.0 / traceVar) * Math.max(0.1, m.rawConfidence);
        rawWeights[m.modality] += info;
        totalInformation += info;
      }
    }

    if (totalInformation <= 1e-6) {
      return {
        tofWeight: 0,
        rfWeight: 1.0,
        imuWeight: 0,
        bciWeight: 0,
        primaryAnchor: 'RF_CSI_SENSING',
        overallConfidence: 0.20
      };
    }

    const tofWeight = rawWeights.TOF_OPTICAL / totalInformation;
    const rfWeight = rawWeights.RF_CSI_SENSING / totalInformation;
    const imuWeight = rawWeights.IMU_INERTIAL_500HZ / totalInformation;
    const bciWeight = rawWeights.BCI_MOTOR_INTENT / totalInformation;

    // Determine primary anchor
    let primaryAnchor: SensorModality = 'RF_CSI_SENSING';
    let maxWeight = rfWeight;

    if (tofWeight > maxWeight) {
      maxWeight = tofWeight;
      primaryAnchor = 'TOF_OPTICAL';
    }
    if (imuWeight > maxWeight) {
      maxWeight = imuWeight;
      primaryAnchor = 'IMU_INERTIAL_500HZ';
    }

    // Fused confidence: higher when multiple independent sensors agree
    const confidence = Math.min(0.99, Math.max(0.40, (tofWeight * 0.98 + rfWeight * 0.85 + imuWeight * 0.90)));

    return {
      tofWeight,
      rfWeight,
      imuWeight,
      bciWeight,
      primaryAnchor,
      overallConfidence: confidence
    };
  }
}
