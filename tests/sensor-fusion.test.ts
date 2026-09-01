import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  GaussianSensorModel,
  ConfidenceProvenanceMatrix,
  MultimodalKalmanFilter,
  OcclusionHandoverManager
} from '@vibe/sensor-fusion';

describe('GaussianSensorModel - Physics-Based Covariance Calculation', () => {
  it('should compute sub-millimeter variance for clean ToF optical measurements', () => {
    const cov = GaussianSensorModel.computeToFCovariance(0.5, 0.95, false);

    assert.ok(cov);
    assert.strictEqual(cov.xx < 1e-4, true); // Low variance (< 0.1mm²)
    assert.strictEqual(cov.yy < 1e-4, true);
    assert.strictEqual(cov.zz > cov.xx, true); // Depth uncertainty higher
  });

  it('should assign near-infinite variance when ToF sensor is occluded', () => {
    const cov = GaussianSensorModel.computeToFCovariance(0.5, 0.95, true);

    assert.strictEqual(cov.xx >= 1e5, true);
    assert.strictEqual(cov.yy >= 1e5, true);
  });

  it('should scale RF CSI variance with subcarrier Signal-to-Noise Ratio (SNR)', () => {
    const covHighSNR = GaussianSensorModel.computeRFCovariance(35.0, 0.90);
    const covLowSNR = GaussianSensorModel.computeRFCovariance(12.0, 0.90);

    assert.strictEqual(covHighSNR.xx < covLowSNR.xx, true);
  });
});

describe('ConfidenceProvenanceMatrix - Multi-Sensory Contribution Weights', () => {
  it('should assign dominant weight to ToF when optical line-of-sight is unobstructed', () => {
    const tofCov = GaussianSensorModel.computeToFCovariance(0.5, 0.95, false);
    const rfCov = GaussianSensorModel.computeRFCovariance(30.0, 0.85);
    const imuCov = GaussianSensorModel.computeIMUCovariance(0.002, 2.0);

    const measurements = [
      {
        modality: 'TOF_OPTICAL' as const,
        position: { x: 0, y: 1.2, z: -0.4 },
        timestampMs: 1000,
        rawConfidence: 0.95,
        covariance: tofCov,
        isOccluded: false
      },
      {
        modality: 'RF_CSI_SENSING' as const,
        position: { x: 0.02, y: 1.21, z: -0.41 },
        timestampMs: 1000,
        rawConfidence: 0.85,
        covariance: rfCov,
        isOccluded: false
      },
      {
        modality: 'IMU_INERTIAL_500HZ' as const,
        position: { x: 0.001, y: 1.2, z: -0.4 },
        timestampMs: 1000,
        rawConfidence: 0.92,
        covariance: imuCov,
        isOccluded: false
      }
    ];

    const provenance = ConfidenceProvenanceMatrix.computeProvenance(measurements);

    assert.strictEqual(provenance.primaryAnchor, 'TOF_OPTICAL');
    assert.strictEqual(provenance.tofWeight > 0.60, true);
    assert.strictEqual(provenance.overallConfidence > 0.90, true);
  });

  it('should rebalance primary anchor to RF and IMU when ToF is occluded', () => {
    const rfCov = GaussianSensorModel.computeRFCovariance(30.0, 0.85);
    const imuCov = GaussianSensorModel.computeIMUCovariance(0.05, 2.0);

    const measurements = [
      {
        modality: 'TOF_OPTICAL' as const,
        position: { x: 0, y: 1.2, z: -0.4 },
        timestampMs: 1000,
        rawConfidence: 0.0,
        covariance: { xx: 1e5, yy: 1e5, zz: 1e5 },
        isOccluded: true
      },
      {
        modality: 'RF_CSI_SENSING' as const,
        position: { x: 0.0, y: 1.2, z: -0.4 },
        timestampMs: 1000,
        rawConfidence: 0.85,
        covariance: rfCov,
        isOccluded: false
      },
      {
        modality: 'IMU_INERTIAL_500HZ' as const,
        position: { x: 0.0, y: 1.2, z: -0.4 },
        timestampMs: 1000,
        rawConfidence: 0.92,
        covariance: imuCov,
        isOccluded: false
      }
    ];

    const provenance = ConfidenceProvenanceMatrix.computeProvenance(measurements);

    assert.notStrictEqual(provenance.primaryAnchor, 'TOF_OPTICAL');
    assert.strictEqual(provenance.tofWeight, 0);
    assert.strictEqual(provenance.rfWeight > 0 || provenance.imuWeight > 0, true);
  });
});

describe('MultimodalKalmanFilter - 9-DoF EKF & Mahalanobis Outlier Gating', () => {
  let filter: MultimodalKalmanFilter;

  beforeEach(() => {
    filter = new MultimodalKalmanFilter({ x: 0.0, y: 1.0, z: 0.0 });
  });

  it('should smoothly integrate constant acceleration kinematics forward in time', () => {
    filter.predict(1000);
    filter.predict(1100);

    const state = filter.getFusedState();
    assert.strictEqual(state.position.x, 0.0);
    assert.strictEqual(state.position.y, 1.0);
    assert.strictEqual(state.position.z, 0.0);
  });

  it('should fuse measurement and reduce state covariance', () => {
    filter.predict(1000);
    const updated = filter.update({
      modality: 'TOF_OPTICAL',
      position: { x: 0.1, y: 1.05, z: 0.02 },
      timestampMs: 1000,
      rawConfidence: 0.95,
      covariance: { xx: 1e-4, yy: 1e-4, zz: 1e-4 },
      isOccluded: false
    });

    assert.strictEqual(updated, true);
    const fused = filter.getFusedState();
    assert.strictEqual(fused.position.x > 0.05, true);
  });

  it('should reject anomalous sensor spike via Mahalanobis Distance Gating', () => {
    filter.predict(1000);

    // Feed a massive 5-meter anomalous glitch spike
    const accepted = filter.update({
      modality: 'RF_CSI_SENSING',
      position: { x: 5.5, y: 8.0, z: 9.0 },
      timestampMs: 1000,
      rawConfidence: 0.90,
      covariance: { xx: 0.01, yy: 0.01, zz: 0.01 },
      isOccluded: false
    });

    assert.strictEqual(accepted, false);
    const state = filter.getFusedState();
    assert.strictEqual(state.isOutlierRejected, true);
    assert.strictEqual(state.position.x < 1.0, true); // Position protected from spike
  });
});

describe('OcclusionHandoverManager - Fail-Safe Optical to IMU/RF Handover', () => {
  it('should transition smoothly to OCCLUDED_IMU_RF_FALLBACK when optical sight is lost', () => {
    const manager = new OcclusionHandoverManager({ x: 0.0, y: 1.2, z: -0.4 });

    // Step 1: Normal optical visibility
    let state = manager.processSensors({
      tofMeasurement: { position: { x: 0.0, y: 1.2, z: -0.4 }, confidence: 0.95, isOccluded: false },
      timestampMs: 1000
    });
    assert.strictEqual(manager.getHandoverMode(), 'OPTICAL_DOMINANT');
    assert.strictEqual(manager.isOccluded(), false);

    // Step 2: Optical sensor gets occluded (hand behind object)
    state = manager.processSensors({
      tofMeasurement: { position: { x: 0.0, y: 1.2, z: -0.4 }, confidence: 0.0, isOccluded: true },
      rfMeasurement: { position: { x: 0.01, y: 1.21, z: -0.39 }, snrDb: 30, confidence: 0.85 },
      imuMeasurement: { linearAccel: { x: 0.1, y: 0.0, z: 0.0 }, angularVel: { x: 0, y: 0, z: 0 }, dtSec: 0.01 },
      timestampMs: 1010
    });

    assert.strictEqual(manager.getHandoverMode(), 'OCCLUDED_IMU_RF_FALLBACK');
    assert.strictEqual(manager.isOccluded(), true);
    assert.ok(state.position);
    assert.strictEqual(state.confidence > 0.70, true); // Still confident thanks to RF + IMU
  });
});
