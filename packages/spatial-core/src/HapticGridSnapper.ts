/**
 * VIBE SpatialOS - Haptic Grid Snapper & Mid-Air Virtual Ruler Engine (v2.0)
 * Generates crisp 40kHz / 200Hz ultrasonic acoustic pulses (haptic detents)
 * on hand mechanoreceptors as coordinates cross metric grid lines (1mm to 100mm)
 * or snap to CAD geometry faces and edges in empty air.
 */

import { MathCore, Vector3, OBBVolume } from './MathCore.js';

export type GridSnapResolution = '1MM' | '5MM' | '10MM' | '50MM' | '100MM';

export interface SnapResult {
  snappedPosition: Vector3;
  originalPosition: Vector3;
  isSnapped: boolean;
  snappedAxis: 'X' | 'Y' | 'Z' | 'ALL' | 'EDGE' | 'VERTEX' | 'NONE';
  detentTriggered: boolean;
  detentPressureKPa: number;
  resolution: GridSnapResolution;
}

export class HapticGridSnapper {
  private enabled: boolean = true;
  private currentResolution: GridSnapResolution = '10MM';
  private snapStepM: number = 0.01;         // 10mm step in meters
  private snapToleranceM: number = 0.004;    // 4mm magnetic snap radius

  // Previous grid index for detent boundary crossing detection
  private lastIndexX: number = 0;
  private lastIndexY: number = 0;
  private lastIndexZ: number = 0;
  private isInitialized: boolean = false;

  constructor(initialResolution: GridSnapResolution = '10MM') {
    this.setResolution(initialResolution);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getResolution(): GridSnapResolution {
    return this.currentResolution;
  }

  public getStepSizeM(): number {
    return this.snapStepM;
  }

  public setResolution(res: GridSnapResolution): void {
    this.currentResolution = res;
    switch (res) {
      case '1MM':
        this.snapStepM = 0.001;
        this.snapToleranceM = 0.00045;
        break;
      case '5MM':
        this.snapStepM = 0.005;
        this.snapToleranceM = 0.0022;
        break;
      case '10MM':
        this.snapStepM = 0.01;
        this.snapToleranceM = 0.0045;
        break;
      case '50MM':
        this.snapStepM = 0.05;
        this.snapToleranceM = 0.022;
        break;
      case '100MM':
        this.snapStepM = 0.10;
        this.snapToleranceM = 0.045;
        break;
    }
  }

  /**
   * Snaps a 3D coordinate to metric grid and generates acoustic detent impulses on crossing
   */
  public snap(position: Vector3, handVelocityMps: number = 0.1): SnapResult {
    if (!this.enabled) {
      return {
        snappedPosition: { ...position },
        originalPosition: { ...position },
        isSnapped: false,
        snappedAxis: 'NONE',
        detentTriggered: false,
        detentPressureKPa: 0.0,
        resolution: this.currentResolution
      };
    }

    const step = this.snapStepM;
    const idxX = Math.round(position.x / step);
    const idxY = Math.round(position.y / step);
    const idxZ = Math.round(position.z / step);

    const targetX = idxX * step;
    const targetY = idxY * step;
    const targetZ = idxZ * step;

    const diffX = Math.abs(position.x - targetX);
    const diffY = Math.abs(position.y - targetY);
    const diffZ = Math.abs(position.z - targetZ);

    const snapX = diffX <= this.snapToleranceM;
    const snapY = diffY <= this.snapToleranceM;
    const snapZ = diffZ <= this.snapToleranceM;

    const snappedPos: Vector3 = {
      x: snapX ? targetX : position.x,
      y: snapY ? targetY : position.y,
      z: snapZ ? targetZ : position.z
    };

    // Detect grid line boundary crossing for haptic detent clicks
    let detentTriggered = false;
    if (this.isInitialized) {
      if (idxX !== this.lastIndexX || idxY !== this.lastIndexY || idxZ !== this.lastIndexZ) {
        detentTriggered = true;
      }
    } else {
      this.isInitialized = true;
    }

    this.lastIndexX = idxX;
    this.lastIndexY = idxY;
    this.lastIndexZ = idxZ;

    // Velocity-adaptive acoustic pressure (sharper clicks for faster movements)
    const basePressure = 1.35;
    const velFactor = Math.min(1.2, handVelocityMps * 2.0);
    const detentPressureKPa = detentTriggered ? basePressure + velFactor : 0.0;

    let snappedAxis: SnapResult['snappedAxis'] = 'NONE';
    if (snapX && snapY && snapZ) snappedAxis = 'ALL';
    else if (snapX) snappedAxis = 'X';
    else if (snapY) snappedAxis = 'Y';
    else if (snapZ) snappedAxis = 'Z';

    return {
      snappedPosition: snappedPos,
      originalPosition: { ...position },
      isSnapped: snapX || snapY || snapZ,
      snappedAxis,
      detentTriggered,
      detentPressureKPa,
      resolution: this.currentResolution
    };
  }

  /**
   * Snaps position to nearest surface or edge of an Oriented Bounding Box (OBB)
   */
  public snapToOBB(
    position: Vector3,
    obb: OBBVolume,
    magneticRadiusM: number = 0.025
  ): SnapResult {
    if (!this.enabled) {
      return this.snap(position);
    }

    // Transform position into OBB local frame
    const obbPos = obb.position;
    const delta = MathCore.v3Sub(position, obbPos);
    const invRot = MathCore.quatConjugate(obb.rotation);
    const localPos = MathCore.rotateVectorByQuat(delta, invRot);

    const hx = obb.halfExtents.x;
    const hy = obb.halfExtents.y;
    const hz = obb.halfExtents.z;

    // Clamp to OBB surface
    const clampedX = Math.max(-hx, Math.min(hx, localPos.x));
    const clampedY = Math.max(-hy, Math.min(hy, localPos.y));
    const clampedZ = Math.max(-hz, Math.min(hz, localPos.z));

    const localDist = MathCore.v3Distance(localPos, { x: clampedX, y: clampedY, z: clampedZ });

    if (localDist <= magneticRadiusM) {
      // Transform back to world frame
      const worldClampedDelta = MathCore.rotateVectorByQuat(
        { x: clampedX, y: clampedY, z: clampedZ },
        obb.rotation
      );
      const snappedWorldPos = MathCore.v3Add(obbPos, worldClampedDelta);

      return {
        snappedPosition: snappedWorldPos,
        originalPosition: { ...position },
        isSnapped: true,
        snappedAxis: 'EDGE',
        detentTriggered: true,
        detentPressureKPa: 1.85,
        resolution: this.currentResolution
      };
    }

    return this.snap(position);
  }
}
