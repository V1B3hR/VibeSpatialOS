/**
 * VIBE SpatialOS - Simulated GCS-v7 Neural Backend
 * Generates synthetic GAT motor imagery decodings, focus index waves,
 * and cognitive load events for offline development and test suites.
 */

import { GCSBridgeConnector } from './GCSBridgeConnector.js';
import { MotorImageryIntent } from './GCSBridgeTypes.js';

export class SimulatedGCSBackend {
  private timerId: any = null;
  private isStreaming: boolean = false;

  constructor(private bridge: GCSBridgeConnector) {}

  public startSimulation(intervalMs: number = 250): void {
    this.isStreaming = true;

    this.timerId = setInterval(() => {
      if (!this.isStreaming) return;
      const now = Date.now();
      const timeSec = now / 1000.0;

      // Dynamic Focus & Stress Wave
      const focus = 0.75 + Math.sin(timeSec * 0.4) * 0.18;
      const stress = 0.25 + Math.cos(timeSec * 0.3) * 0.15;
      const load = 0.40 + Math.sin(timeSec * 0.2) * 0.20;

      this.bridge.ingestIncomingMessage({
        type: 'AFFECTIVE_STATE',
        timestampMs: now,
        confidence: 0.91,
        payload: {
          focusIndex: Math.max(0.1, Math.min(0.99, focus)),
          stressLevel: Math.max(0.05, Math.min(0.95, stress)),
          cognitiveLoad: Math.max(0.1, Math.min(0.95, load)),
          emotionalValence: 0.65
        }
      });
    }, intervalMs);
  }

  /**
   * Triggers a specific motor imagery intent impulse
   */
  public triggerMotorIntent(intent: MotorImageryIntent, confidence: number = 0.88): void {
    this.bridge.ingestIncomingMessage({
      type: 'MOTOR_INTENT',
      timestampMs: Date.now(),
      confidence,
      payload: {
        intent,
        latencyLeadTimeMs: 85,
        targetMuscleGroup: 'flexor_digitorum'
      }
    });
  }

  public stopSimulation(): void {
    this.isStreaming = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
