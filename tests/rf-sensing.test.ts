import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  SimulatedRFSource,
  RuViewAdapter,
  RFPoseEstimator,
  SensorCircuitBreaker,
  TemporalAligner
} from '@vibe/rf-sensing';

describe('RFPoseEstimator & Wi-Fi CSI Skeletal Extraction', () => {
  let estimator: RFPoseEstimator;

  beforeEach(() => {
    estimator = new RFPoseEstimator();
  });

  it('should estimate 17-keypoint human skeleton with anatomical constraints', () => {
    const subcarriers = [
      { subcarrierIndex: 0, amplitude: 25.0, phaseRad: 0.5, snrDb: 30.0 },
      { subcarrierIndex: 1, amplitude: 28.0, phaseRad: 0.8, snrDb: 32.0 },
      { subcarrierIndex: 2, amplitude: 22.0, phaseRad: 0.3, snrDb: 28.0 }
    ];

    const skeleton = estimator.estimateSkeleton(subcarriers, { x: 0, y: 0, z: 0 });

    assert.ok(skeleton);
    assert.strictEqual(skeleton.personId, 'human_occupant_01');
    assert.strictEqual(Object.keys(skeleton.keypoints).length, 17);

    // Check key anatomical landmarks
    assert.ok(skeleton.keypoints.nose);
    assert.strictEqual(Math.abs(skeleton.keypoints.nose.position.y - 1.65) < 1e-3, true);
    assert.ok(skeleton.keypoints.left_shoulder);
    assert.ok(skeleton.keypoints.right_shoulder);
    assert.ok(skeleton.keypoints.left_wrist);
    assert.ok(skeleton.keypoints.right_wrist);
    assert.strictEqual(skeleton.overallConfidence > 0.80, true);
  });

  it('should extract breathing and heart rate vitals from CSI multipath modulation', () => {
    const vitals = estimator.estimateVitals([], 10.0);

    assert.ok(vitals);
    assert.strictEqual(vitals.breathingRateBpm >= 12 && vitals.breathingRateBpm <= 20, true);
    assert.strictEqual(vitals.heartRateBpm >= 60 && vitals.heartRateBpm <= 90, true);
    assert.strictEqual(vitals.chestDisplacementMm > 3.0, true);
  });
});

describe('SimulatedRFSource - Synthetic CSI Wave Streamer', () => {
  it('should generate valid 64-subcarrier OFDM CSI frames', () => {
    const sim = new SimulatedRFSource(20);
    const frame = sim.generateFrame(1000);

    assert.strictEqual(frame.subcarriers.length, 64);
    assert.strictEqual(frame.presenceConfidence > 0.5, true);
    assert.strictEqual(frame.isMotionDetected, true);
    assert.ok(frame.skeleton);
    assert.ok(frame.vitals);
  });
});

describe('RuViewAdapter - rvCSI / ESP32-S3 Stream Ingestion', () => {
  it('should ingest raw CSI amplitude/phase arrays and emit structured frames', async () => {
    const adapter = new RuViewAdapter({ sourceId: 'esp32_s3_node_01' });
    await adapter.connect();

    let receivedFrame: any = null;
    adapter.onFrame((frame) => {
      receivedFrame = frame;
    });

    const amps = [24, 26, 28, 30, 22, 25];
    const phases = [0.1, 0.3, 0.5, 0.7, 0.2, 0.4];

    adapter.ingestRawCSIPacket(amps, phases, Date.now());

    assert.ok(receivedFrame);
    assert.strictEqual(receivedFrame.sourceNodeId, 'esp32_s3_node_01');
    assert.strictEqual(receivedFrame.subcarriers.length, 6);
    assert.strictEqual(adapter.getStatus().connected, true);
    assert.strictEqual(adapter.getStatus().packetsReceived, 1);
  });
});

describe('SensorCircuitBreaker - Fault Tolerance & Graceful Degradation', () => {
  it('should trip OPEN after reaching failure threshold and execute fallback', async () => {
    const breaker = new SensorCircuitBreaker('esp32_mesh', {
      failureThreshold: 3,
      resetTimeoutMs: 500,
      timeoutMs: 50
    });

    assert.strictEqual(breaker.getState(), 'CLOSED');

    // Simulate 3 failures
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    assert.strictEqual(breaker.getState(), 'OPEN');

    // Should execute fallback immediately without calling failing operation
    let fallbackCalled = false;
    const res = await breaker.execute(
      async () => { throw new Error('Hardware disconnected'); },
      () => {
        fallbackCalled = true;
        return { cached: true };
      }
    );

    assert.strictEqual(fallbackCalled, true);
    assert.strictEqual(res.cached, true);
  });
});

describe('TemporalAligner - Multi-Rate Sensor Interpolation', () => {
  it('should smoothly interpolate position between asynchronous sensor timestamps', () => {
    const aligner = new TemporalAligner();

    aligner.pushSample({
      timestampMs: 1000,
      position: { x: 0.0, y: 1.0, z: 0.0 },
      confidence: 1.0
    });

    aligner.pushSample({
      timestampMs: 1100,
      position: { x: 1.0, y: 1.0, z: 0.0 },
      confidence: 1.0
    });

    // Interpolate at t = 1050ms (halfway)
    const mid = aligner.interpolate(1050);
    assert.strictEqual(mid.isExtrapolated, false);
    assert.strictEqual(Math.abs(mid.position.x - 0.5) < 1e-3, true);
    assert.strictEqual(mid.position.y, 1.0);
  });

  it('should extrapolate into future with confidence decay', () => {
    const aligner = new TemporalAligner();

    aligner.pushSample({
      timestampMs: 1000,
      position: { x: 0.0, y: 0.0, z: 0.0 },
      velocity: { x: 1.0, y: 0.0, z: 0.0 },
      confidence: 0.95
    });

    // Extrapolate 200ms into future (t = 1200ms)
    const future = aligner.interpolate(1200);
    assert.strictEqual(future.isExtrapolated, true);
    assert.strictEqual(Math.abs(future.position.x - 0.2) < 1e-3, true);
    assert.strictEqual(future.confidence < 0.95, true); // Confidence decayed
  });
});
