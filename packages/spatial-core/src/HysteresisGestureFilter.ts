/**
 * VIBE SpatialOS - Dual-Threshold Schmitt Trigger Gesture Hysteresis Filter
 * Completely eliminates contact flutter/chatter at pinch/grab boundaries
 * using separate enter (20mm) and exit (35mm) thresholds.
 */

export type GestureState = 'IDLE' | 'PINCHING' | 'GRABBING';

export interface GestureEvent {
  type: 'PINCH_START' | 'PINCH_HOLD' | 'PINCH_RELEASE' | 'GRAB_START' | 'GRAB_HOLD' | 'GRAB_RELEASE' | 'NONE';
  active: boolean;
  distanceMm: number;
  confidence: number;
}

export class HysteresisGestureFilter {
  private isPinching: boolean = false;
  private isGrabbing: boolean = false;

  // Thresholds in millimeters
  private readonly pinchEnterMm: number;
  private readonly pinchExitMm: number;
  private readonly grabEnterMm: number;
  private readonly grabExitMm: number;

  constructor(
    pinchEnterMm: number = 20.0,
    pinchExitMm: number = 35.0,
    grabEnterMm: number = 25.0,
    grabExitMm: number = 45.0
  ) {
    this.pinchEnterMm = pinchEnterMm;
    this.pinchExitMm = pinchExitMm;
    this.grabEnterMm = grabEnterMm;
    this.grabExitMm = grabExitMm;
  }

  /**
   * Updates pinch filter state based on index-to-thumb tip distance in millimeters
   */
  public updatePinch(distanceMm: number): GestureEvent {
    let eventType: GestureEvent['type'] = 'NONE';

    if (!this.isPinching && distanceMm <= this.pinchEnterMm) {
      this.isPinching = true;
      eventType = 'PINCH_START';
    } else if (this.isPinching && distanceMm >= this.pinchExitMm) {
      this.isPinching = false;
      eventType = 'PINCH_RELEASE';
    } else if (this.isPinching) {
      eventType = 'PINCH_HOLD';
    }

    // Confidence is 1.0 when fully closed (0mm) and drops towards exit threshold
    const confidence = this.isPinching
      ? Math.max(0, Math.min(1, 1.0 - distanceMm / this.pinchExitMm))
      : 0.0;

    return {
      type: eventType,
      active: this.isPinching,
      distanceMm,
      confidence
    };
  }

  /**
   * Updates palm/fist grab state
   */
  public updateGrab(avgFingerDistanceMm: number): GestureEvent {
    let eventType: GestureEvent['type'] = 'NONE';

    if (!this.isGrabbing && avgFingerDistanceMm <= this.grabEnterMm) {
      this.isGrabbing = true;
      eventType = 'GRAB_START';
    } else if (this.isGrabbing && avgFingerDistanceMm >= this.grabExitMm) {
      this.isGrabbing = false;
      eventType = 'GRAB_RELEASE';
    } else if (this.isGrabbing) {
      eventType = 'GRAB_HOLD';
    }

    const confidence = this.isGrabbing
      ? Math.max(0, Math.min(1, 1.0 - avgFingerDistanceMm / this.grabExitMm))
      : 0.0;

    return {
      type: eventType,
      active: this.isGrabbing,
      distanceMm: avgFingerDistanceMm,
      confidence
    };
  }

  public getIsPinching(): boolean {
    return this.isPinching;
  }

  public getIsGrabbing(): boolean {
    return this.isGrabbing;
  }

  public reset(): void {
    this.isPinching = false;
    this.isGrabbing = false;
  }
}
