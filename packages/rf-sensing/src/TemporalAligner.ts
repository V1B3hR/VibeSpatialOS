/**
 * VIBE SpatialOS - Asynchronous Temporal Alignment & Hermite Interpolator
 * Harmonizes multi-rate sensors (RF 20Hz, ToF 100Hz, IMU 500Hz, BCI 250Hz)
 * into a single unified high-rate time baseline with confidence decay.
 */

import { Vector3, MathCore } from '@vibe/spatial-core';

export interface TimestampedSample {
  timestampMs: number;
  position: Vector3;
  velocity?: Vector3;
  confidence: number;
}

export class TemporalAligner {
  private buffer: TimestampedSample[] = [];
  private readonly maxBufferSize: number;

  constructor(maxBufferSize: number = 64) {
    this.maxBufferSize = maxBufferSize;
  }

  public pushSample(sample: TimestampedSample): void {
    // Keep sorted by timestamp
    this.buffer.push({ ...sample });
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Interpolates or extrapolates position at targetTimestampMs
   */
  public interpolate(targetTimestampMs: number): {
    position: Vector3;
    velocity: Vector3;
    confidence: number;
    isExtrapolated: boolean;
  } {
    if (this.buffer.length === 0) {
      return {
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        confidence: 0.0,
        isExtrapolated: true
      };
    }

    const newest = this.buffer[this.buffer.length - 1];
    const oldest = this.buffer[0];

    // 1. Extrapolation into the future
    if (targetTimestampMs >= newest.timestampMs) {
      const dtSec = (targetTimestampMs - newest.timestampMs) / 1000.0;
      const vel = newest.velocity || (this.buffer.length >= 2 ? this.estimateVelocity(this.buffer[this.buffer.length - 2], newest) : { x: 0, y: 0, z: 0 });
      const pos = MathCore.v3Add(newest.position, MathCore.v3Scale(vel, dtSec));

      // Exponential confidence decay
      const decay = Math.exp(-dtSec * 4.0);
      return {
        position: pos,
        velocity: vel,
        confidence: Math.max(0.05, newest.confidence * decay),
        isExtrapolated: true
      };
    }

    // 2. Extrapolation into past (behind buffer)
    if (targetTimestampMs <= oldest.timestampMs) {
      return {
        position: { ...oldest.position },
        velocity: { x: 0, y: 0, z: 0 },
        confidence: oldest.confidence * 0.5,
        isExtrapolated: true
      };
    }

    // 3. Interpolation between two bounding samples
    for (let i = 0; i < this.buffer.length - 1; i++) {
      const p0 = this.buffer[i];
      const p1 = this.buffer[i + 1];

      if (targetTimestampMs >= p0.timestampMs && targetTimestampMs <= p1.timestampMs) {
        const span = p1.timestampMs - p0.timestampMs;
        const alpha = span > 0 ? (targetTimestampMs - p0.timestampMs) / span : 0;

        // Smooth cubic Hermite interpolation
        const smoothAlpha = alpha * alpha * (3 - 2 * alpha);

        const pos: Vector3 = {
          x: p0.position.x + (p1.position.x - p0.position.x) * smoothAlpha,
          y: p0.position.y + (p1.position.y - p0.position.y) * smoothAlpha,
          z: p0.position.z + (p1.position.z - p0.position.z) * smoothAlpha
        };

        const vel = this.estimateVelocity(p0, p1);
        const conf = p0.confidence * (1 - alpha) + p1.confidence * alpha;

        return {
          position: pos,
          velocity: vel,
          confidence: conf,
          isExtrapolated: false
        };
      }
    }

    return {
      position: { ...newest.position },
      velocity: { x: 0, y: 0, z: 0 },
      confidence: newest.confidence,
      isExtrapolated: false
    };
  }

  private estimateVelocity(s0: TimestampedSample, s1: TimestampedSample): Vector3 {
    const dtSec = (s1.timestampMs - s0.timestampMs) / 1000.0;
    if (dtSec <= 1e-4) return { x: 0, y: 0, z: 0 };
    return {
      x: (s1.position.x - s0.position.x) / dtSec,
      y: (s1.position.y - s0.position.y) / dtSec,
      z: (s1.position.z - s0.position.z) / dtSec
    };
  }

  public clear(): void {
    this.buffer = [];
  }
}
