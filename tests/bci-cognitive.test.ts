import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  GCSBridgeConnector,
  SimulatedGCSBackend,
  MotorIntentPredictor,
  CognitiveStateManager,
  BiometricEncryption
} from '@vibe/bci-cognitive';

describe('BiometricEncryption - AES-256-GCM & SHA-256 Anonymization', () => {
  let crypto: BiometricEncryption;

  beforeEach(() => {
    crypto = new BiometricEncryption();
  });

  it('should anonymize raw user ID into a deterministic 16-character SHA-256 hash', () => {
    const rawId = 'user_engineer_andrz_001';
    const anon1 = crypto.anonymizeUserId(rawId);
    const anon2 = crypto.anonymizeUserId(rawId);

    assert.strictEqual(anon1, anon2);
    assert.strictEqual(anon1.length, 16);
    assert.strictEqual(anon1.includes('andrz'), false);
  });

  it('should encrypt sensitive EEG biometric payload and decrypt back correctly', () => {
    const telemetry = {
      eegMuRhythmPower: 0.724,
      eegBetaPower: 0.312,
      hrvRmssdMs: 48.5,
      gsrConductanceUs: 4.2
    };

    const encrypted = crypto.encryptBiometricData(telemetry, 'user_001');

    assert.ok(encrypted.ciphertextBase64);
    assert.ok(encrypted.ivHex);
    assert.ok(encrypted.authTagHex);
    assert.notStrictEqual(encrypted.ciphertextBase64, JSON.stringify(telemetry));

    const decrypted = crypto.decryptBiometricData<typeof telemetry>(encrypted);
    assert.strictEqual(decrypted.eegMuRhythmPower, 0.724);
    assert.strictEqual(decrypted.hrvRmssdMs, 48.5);
  });
});

describe('MotorIntentPredictor - Zero-Latency Neural Pre-Buffering', () => {
  let predictor: MotorIntentPredictor;

  beforeEach(() => {
    predictor = new MotorIntentPredictor(200);
  });

  it('should pre-buffer motor imagery pinch intent and report preloaded state', () => {
    predictor.registerIntent({
      intent: 'MOTOR_IMAGERY_PINCH',
      confidence: 0.88,
      latencyLeadTimeMs: 80,
      timestampMs: Date.now()
    });

    assert.strictEqual(predictor.isPinchPreloaded(), true);

    const active = predictor.getActiveIntent();
    assert.ok(active);
    assert.strictEqual(active.intent, 'MOTOR_IMAGERY_PINCH');
    assert.strictEqual(active.confidence, 0.88);

    // Consume intent upon physical gesture completion
    const consumed = predictor.consumeIntent('MOTOR_IMAGERY_PINCH');
    assert.strictEqual(consumed, true);
    assert.strictEqual(predictor.isPinchPreloaded(), false);
  });

  it('should ignore low-confidence motor imagery intents (< 0.70)', () => {
    predictor.registerIntent({
      intent: 'MOTOR_IMAGERY_GRAB',
      confidence: 0.55,
      latencyLeadTimeMs: 50,
      timestampMs: Date.now()
    });

    assert.strictEqual(predictor.getActiveIntent(), null);
  });
});

describe('CognitiveStateManager - Adaptive Auto-LOD & Focus Evaluation', () => {
  let manager: CognitiveStateManager;

  beforeEach(() => {
    manager = new CognitiveStateManager();
  });

  it('should trigger REDUCE_COMPLEXITY when user is under high stress or cognitive overload', () => {
    // Feed high cognitive load and stress
    manager.updateState({ cognitiveLoad: 0.95, stressLevel: 0.85, focusIndex: 0.40 }, true);

    const state = manager.getCurrentState();
    assert.strictEqual(state.isCognitiveOverload, true);
    assert.strictEqual(state.suggestedLOD, 'REDUCE_COMPLEXITY');
  });

  it('should trigger MAX_PRECISION when user is in deep focus flow with low stress', () => {
    // Feed high focus and calm state
    manager.updateState({ focusIndex: 0.95, stressLevel: 0.15, cognitiveLoad: 0.30 }, true);

    const state = manager.getCurrentState();
    assert.strictEqual(state.suggestedLOD, 'MAX_PRECISION');
    assert.strictEqual(manager.getFocusQuality(), 'DEEP_FLOW');
  });
});

describe('GCSBridgeConnector & SimulatedGCSBackend - Neural IPC Integration', () => {
  it('should connect to GCS-v7 and stream neural motor intents', async () => {
    const bridge = new GCSBridgeConnector();
    await bridge.connect();

    const sim = new SimulatedGCSBackend(bridge);

    let receivedMsg: any = null;
    bridge.onMessage((msg) => {
      receivedMsg = msg;
    });

    sim.triggerMotorIntent('MOTOR_IMAGERY_PINCH', 0.89);

    assert.ok(receivedMsg);
    assert.strictEqual(receivedMsg.type, 'MOTOR_INTENT');
    assert.strictEqual(receivedMsg.payload.intent, 'MOTOR_IMAGERY_PINCH');
    assert.strictEqual(bridge.intentPredictor.isPinchPreloaded(), true);
  });
});
