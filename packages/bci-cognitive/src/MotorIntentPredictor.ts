/**
 * VIBE SpatialOS - Motor Intent Predictor & Zero-Latency Pre-Buffer
 * Intercepts decoded neural motor imagery events (GCS-v7 Graph Attention Network)
 * to prime spatial Kalman filters and dual-threshold gesture state machines 50-120ms
 * before physical muscular contraction occurs.
 */

import { MotorImageryIntent, MotorIntentEvent } from './GCSBridgeTypes.js';

export class MotorIntentPredictor {
  private activeIntent: MotorIntentEvent | null = null;
  private readonly intentLifespanMs: number;

  constructor(intentLifespanMs: number = 220) {
    this.intentLifespanMs = intentLifespanMs;
  }

  /**
   * Ingests a decoded motor imagery event from GCS-v7
   */
  public registerIntent(event: MotorIntentEvent): void {
    if (event.confidence < 0.70) return;
    this.activeIntent = { ...event };
  }

  /**
   * Retrieves active pre-buffered intent if within valid temporal window
   */
  public getActiveIntent(): MotorIntentEvent | null {
    if (!this.activeIntent) return null;

    const ageMs = Date.now() - this.activeIntent.timestampMs;
    if (ageMs > this.intentLifespanMs) {
      this.activeIntent = null;
      return null;
    }

    return this.activeIntent;
  }

  /**
   * Consumes a matching intent once physical gesture or spatial action completes
   */
  public consumeIntent(expectedIntent: MotorImageryIntent): boolean {
    const current = this.getActiveIntent();
    if (current && current.intent === expectedIntent) {
      this.activeIntent = null;
      return true;
    }
    return false;
  }

  /**
   * Checks if pinch gesture is neurally pre-loaded by the motor cortex
   */
  public isPinchPreloaded(): boolean {
    const current = this.getActiveIntent();
    return current !== null && current.intent === 'MOTOR_IMAGERY_PINCH';
  }

  /**
   * Checks if 3D rotation is neurally pre-loaded
   */
  public isRotationPreloaded(): { preloaded: boolean; direction: 'CW' | 'CCW' | 'NONE' } {
    const current = this.getActiveIntent();
    if (!current) return { preloaded: false, direction: 'NONE' };

    if (current.intent === 'MOTOR_IMAGERY_ROTATE_CW') return { preloaded: true, direction: 'CW' };
    if (current.intent === 'MOTOR_IMAGERY_ROTATE_CCW') return { preloaded: true, direction: 'CCW' };
    return { preloaded: false, direction: 'NONE' };
  }

  public clear(): void {
    this.activeIntent = null;
  }
}
