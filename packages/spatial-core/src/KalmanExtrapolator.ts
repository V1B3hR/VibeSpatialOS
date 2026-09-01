/**
 * VIBE SpatialOS - Predictive Dead-Reckoning & Kalman Extrapolator
 * Compensates for Motion-to-Photon / Projector latency (~15ms)
 * using a Constant-Acceleration 3D kinematic tracking filter.
 */

import { MathCore, Vector3 } from './MathCore.js';

export interface MotionState3D {
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  timestampMs: number;
}

export class KalmanExtrapolator {
  private state: MotionState3D;
  private isInitialized: boolean = false;
  private lastUpdateTimeMs: number = 0;

  // Tuning factors for process and measurement noise
  private positionSmoothing: number = 0.75;
  private velocitySmoothing: number = 0.65;
  private accelerationSmoothing: number = 0.50;

  constructor(initialPos?: Vector3) {
    this.state = {
      position: initialPos ? { ...initialPos } : { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      timestampMs: 0
    };
    if (initialPos) {
      this.isInitialized = true;
    }
  }

  /**
   * Resets the filter with a new position
   */
  public reset(pos: Vector3, timestampMs: number = performance.now()): void {
    this.state = {
      position: { ...pos },
      velocity: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      timestampMs
    };
    this.lastUpdateTimeMs = timestampMs;
    this.isInitialized = true;
  }

  /**
   * Updates filter state with a new raw measurement
   */
  public update(rawMeasurement: Vector3, timestampMs: number = performance.now()): MotionState3D {
    if (!this.isInitialized) {
      this.reset(rawMeasurement, timestampMs);
      return this.state;
    }

    let dt = (timestampMs - this.lastUpdateTimeMs) / 1000.0; // Seconds
    if (dt <= 0 || dt > 0.5) {
      // Guard against frame skips or clock glitches
      dt = 0.0166;
    }

    // 1. Predict position with current velocity & acceleration
    const predPos = {
      x: this.state.position.x + this.state.velocity.x * dt + 0.5 * this.state.acceleration.x * dt * dt,
      y: this.state.position.y + this.state.velocity.y * dt + 0.5 * this.state.acceleration.y * dt * dt,
      z: this.state.position.z + this.state.velocity.z * dt + 0.5 * this.state.acceleration.z * dt * dt
    };

    // 2. Compute residual & smooth filtered position
    const filteredPos: Vector3 = {
      x: predPos.x + this.positionSmoothing * (rawMeasurement.x - predPos.x),
      y: predPos.y + this.positionSmoothing * (rawMeasurement.y - predPos.y),
      z: predPos.z + this.positionSmoothing * (rawMeasurement.z - predPos.z)
    };

    // 3. Estimate raw velocity
    const rawVel: Vector3 = {
      x: (filteredPos.x - this.state.position.x) / dt,
      y: (filteredPos.y - this.state.position.y) / dt,
      z: (filteredPos.z - this.state.position.z) / dt
    };

    const filteredVel: Vector3 = {
      x: this.state.velocity.x + this.velocitySmoothing * (rawVel.x - this.state.velocity.x),
      y: this.state.velocity.y + this.velocitySmoothing * (rawVel.y - this.state.velocity.y),
      z: this.state.velocity.z + this.velocitySmoothing * (rawVel.z - this.state.velocity.z)
    };

    // 4. Estimate raw acceleration
    const rawAcc: Vector3 = {
      x: (filteredVel.x - this.state.velocity.x) / dt,
      y: (filteredVel.y - this.state.velocity.y) / dt,
      z: (filteredVel.z - this.state.velocity.z) / dt
    };

    const filteredAcc: Vector3 = {
      x: this.state.acceleration.x + this.accelerationSmoothing * (rawAcc.x - this.state.acceleration.x),
      y: this.state.acceleration.y + this.accelerationSmoothing * (rawAcc.y - this.state.acceleration.y),
      z: this.state.acceleration.z + this.accelerationSmoothing * (rawAcc.z - this.state.acceleration.z)
    };

    this.state = {
      position: filteredPos,
      velocity: filteredVel,
      acceleration: filteredAcc,
      timestampMs
    };
    this.lastUpdateTimeMs = timestampMs;

    return this.state;
  }

  /**
   * Extrapolates position forward in time by predictionHorizonMs (typically 15ms)
   */
  public predictForward(predictionHorizonMs: number = 15.0): Vector3 {
    if (!this.isInitialized) {
      return this.state.position;
    }

    const dt = predictionHorizonMs / 1000.0; // Seconds
    return {
      x: this.state.position.x + this.state.velocity.x * dt + 0.5 * this.state.acceleration.x * dt * dt,
      y: this.state.position.y + this.state.velocity.y * dt + 0.5 * this.state.acceleration.y * dt * dt,
      z: this.state.position.z + this.state.velocity.z * dt + 0.5 * this.state.acceleration.z * dt * dt
    };
  }

  public getState(): MotionState3D {
    return { ...this.state };
  }
}
