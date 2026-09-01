/**
 * VIBE SpatialOS - Production-Grade Spatial World Engine (v2.0)
 * Central coordinator for unified metric 3D space, OBB physics hierarchy,
 * low-latency predictive Kalman extrapolators, and deictic resolution.
 */

import { MathCore, Vector3, Quaternion, OBBVolume } from './MathCore.js';
import { HysteresisGestureFilter, GestureEvent } from './HysteresisGestureFilter.js';
import { KalmanExtrapolator } from './KalmanExtrapolator.js';
import { FlightRecorder, RecordedSpatialFrame } from './FlightRecorder.js';
import { SpatialNodeGraph } from './SpatialNodeGraph.js';
import { WearableDeviceManager } from './WearableDeviceManager.js';
import { HapticGridSnapper } from './HapticGridSnapper.js';
import { CADBridgeConnector } from './CADBridgeConnector.js';

export interface SpatialObjectV2 {
  id: string;
  name: string;
  type: 'molecule' | 'cad_part' | 'volumetric_mesh' | 'ui_panel';
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  halfExtents: Vector3; // Half-size for OBB in local coordinates
  metadata: Record<string, any>;
  isGrabbed?: boolean;
  grabOffset?: Vector3;
}

export interface HandJointStateV2 {
  palmPosition: Vector3;
  indexTipPosition: Vector3;
  thumbTipPosition: Vector3;
  pinchDistanceMm: number;
  isPinching: boolean;
  rawVelocity: Vector3;
  predictedPosition: Vector3; // 15ms Kalman extrapolation
}

export interface UserSpatialStateV2 {
  headPosition: Vector3;
  gazeRay: {
    origin: Vector3;
    direction: Vector3;
  };
  leftHand: HandJointStateV2;
  rightHand: HandJointStateV2;
}

export interface GestureResolutionResult {
  action: 'PRECISION_GRAB' | 'TWO_HAND_PINCH_SCALE' | 'OBJECT_RELEASE' | 'NONE';
  targetId?: string;
  handPos?: Vector3;
  scaleFactor?: number;
  spanDistanceMm?: number;
}

export class SpatialWorldEngineV2 {
  private objects: Map<string, SpatialObjectV2> = new Map();
  private userState: UserSpatialStateV2;

  // Gesture filters with Schmitt triggers
  private rightPinchFilter = new HysteresisGestureFilter(20.0, 35.0);
  private leftPinchFilter = new HysteresisGestureFilter(20.0, 35.0);

  // Kalman predictors for 15ms latency compensation
  private rightHandKalman = new KalmanExtrapolator();
  private leftHandKalman = new KalmanExtrapolator();

  // Spatial Black-Box flight recorder
  public flightRecorder = new FlightRecorder();

  // Hierarchical Spatial Node Graph & Wayfinding
  public nodeGraph = new SpatialNodeGraph();

  // Wearable Hardware Bus & VIBE Pulse Controller
  public wearableManager = new WearableDeviceManager();

  // Mid-Air Haptic Grid Snapping & Virtual Rulers
  public gridSnapper = new HapticGridSnapper();

  // Universal CAD/BIM Bridge Connector
  public cadBridge = new CADBridgeConnector();

  // Unified 4x4 World-to-Display Transformation Matrix (column-major)
  public worldToDisplayTransform: Float32Array = MathCore.mat4Identity();

  private activeGrabbedObjectId: string | null = null;
  private initialTwoHandSpanMm: number | null = null;
  private initialObjectScale: Vector3 = { x: 1, y: 1, z: 1 };

  constructor() {
    this.userState = {
      headPosition: { x: 0, y: 1.7, z: 0 },
      gazeRay: {
        origin: { x: 0, y: 1.7, z: 0 },
        direction: { x: 0, y: -0.2, z: -1 }
      },
      leftHand: {
        palmPosition: { x: -0.3, y: 1.2, z: -0.5 },
        indexTipPosition: { x: -0.3, y: 1.25, z: -0.55 },
        thumbTipPosition: { x: -0.28, y: 1.25, z: -0.52 },
        pinchDistanceMm: 40.0,
        isPinching: false,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: { x: -0.3, y: 1.2, z: -0.5 }
      },
      rightHand: {
        palmPosition: { x: 0.3, y: 1.2, z: -0.5 },
        indexTipPosition: { x: 0.3, y: 1.25, z: -0.55 },
        thumbTipPosition: { x: 0.28, y: 1.25, z: -0.52 },
        pinchDistanceMm: 40.0,
        isPinching: false,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: { x: 0.3, y: 1.2, z: -0.5 }
      }
    };
  }

  public registerObject(obj: SpatialObjectV2): void {
    this.objects.set(obj.id, obj);
  }

  public unregisterObject(id: string): boolean {
    return this.objects.delete(id);
  }

  public getObject(id: string): SpatialObjectV2 | undefined {
    return this.objects.get(id);
  }

  public getAllObjects(): SpatialObjectV2[] {
    return Array.from(this.objects.values());
  }

  public getUserState(): UserSpatialStateV2 {
    return this.userState;
  }

  /**
   * Updates raw user state with Kalman filtering and predictive dead-reckoning
   */
  public updateUserState(
    newState: Partial<UserSpatialStateV2>,
    timestampMs: number = performance.now()
  ): void {
    if (newState.headPosition) this.userState.headPosition = { ...newState.headPosition };
    if (newState.gazeRay) this.userState.gazeRay = { ...newState.gazeRay };

    if (newState.rightHand) {
      this.userState.rightHand = { ...this.userState.rightHand, ...newState.rightHand };
      const kmState = this.rightHandKalman.update(this.userState.rightHand.palmPosition, timestampMs);
      this.userState.rightHand.rawVelocity = kmState.velocity;
      this.userState.rightHand.predictedPosition = this.rightHandKalman.predictForward(15.0);
    }

    if (newState.leftHand) {
      this.userState.leftHand = { ...this.userState.leftHand, ...newState.leftHand };
      const kmState = this.leftHandKalman.update(this.userState.leftHand.palmPosition, timestampMs);
      this.userState.leftHand.rawVelocity = kmState.velocity;
      this.userState.leftHand.predictedPosition = this.leftHandKalman.predictForward(15.0);
    }
  }

  /**
   * Resolves target object via Cone-Casting and OBB ray intersection
   */
  public resolveTargetCone(
    coneOrigin: Vector3,
    coneDirection: Vector3,
    maxAngleRad: number = 0.2618 // ~15 degrees
  ): SpatialObjectV2 | null {
    let bestTarget: SpatialObjectV2 | null = null;
    let highestScore = 0;

    for (const obj of this.objects.values()) {
      // 1. Direct OBB ray intersection check
      const hitDist = MathCore.intersectRayOBB(coneOrigin, coneDirection, {
        position: obj.position,
        rotation: obj.rotation,
        halfExtents: obj.halfExtents,
        scale: obj.scale
      });

      if (hitDist !== null) {
        const directScore = 2.0 / (1.0 + hitDist);
        if (directScore > highestScore) {
          highestScore = directScore;
          bestTarget = obj;
        }
      } else {
        // 2. Gaussian cone evaluation
        const coneScore = MathCore.evaluateConeConfidence(
          coneOrigin,
          coneDirection,
          obj.position,
          maxAngleRad
        );

        if (coneScore > highestScore && coneScore > 0.15) {
          highestScore = coneScore;
          bestTarget = obj;
        }
      }
    }

    return bestTarget;
  }

  /**
   * Evaluates gesture state machine for both hands with hysteresis and dual-hand scale
   */
  public processGestures(): GestureResolutionResult {
    const rightPinchEvt = this.rightPinchFilter.updatePinch(this.userState.rightHand.pinchDistanceMm);
    const leftPinchEvt = this.leftPinchFilter.updatePinch(this.userState.leftHand.pinchDistanceMm);

    this.userState.rightHand.isPinching = rightPinchEvt.active;
    this.userState.leftHand.isPinching = leftPinchEvt.active;

    // 1. Check for Two-Hand Pinch & Scale
    if (this.userState.leftHand.isPinching && this.userState.rightHand.isPinching) {
      const spanMm = MathCore.v3Distance(
        this.userState.leftHand.predictedPosition,
        this.userState.rightHand.predictedPosition
      ) * 1000.0;

      if (this.initialTwoHandSpanMm === null) {
        this.initialTwoHandSpanMm = spanMm;
        if (this.activeGrabbedObjectId) {
          const grabbed = this.objects.get(this.activeGrabbedObjectId);
          if (grabbed) this.initialObjectScale = { ...grabbed.scale };
        }
      } else if (this.activeGrabbedObjectId && this.initialTwoHandSpanMm > 10.0) {
        const scaleFactor = Math.max(0.1, Math.min(10.0, spanMm / this.initialTwoHandSpanMm));
        const target = this.objects.get(this.activeGrabbedObjectId);
        if (target) {
          target.scale = {
            x: this.initialObjectScale.x * scaleFactor,
            y: this.initialObjectScale.y * scaleFactor,
            z: this.initialObjectScale.z * scaleFactor
          };
        }
        return {
          action: 'TWO_HAND_PINCH_SCALE',
          targetId: this.activeGrabbedObjectId,
          scaleFactor,
          spanDistanceMm: spanMm
        };
      }
    } else {
      this.initialTwoHandSpanMm = null;
    }

    // 2. Single-Hand Precision Grab (Right hand primary)
    if (this.userState.rightHand.isPinching) {
      if (!this.activeGrabbedObjectId) {
        const target = this.resolveTargetCone(
          this.userState.rightHand.predictedPosition,
          this.userState.gazeRay.direction
        );

        if (target) {
          this.activeGrabbedObjectId = target.id;
          target.isGrabbed = true;
          target.grabOffset = MathCore.v3Sub(target.position, this.userState.rightHand.predictedPosition);

          return {
            action: 'PRECISION_GRAB',
            targetId: target.id,
            handPos: this.userState.rightHand.predictedPosition
          };
        }
      } else {
        // Drag grabbed object with 15ms predicted hand position
        const grabbed = this.objects.get(this.activeGrabbedObjectId);
        if (grabbed && grabbed.grabOffset) {
          grabbed.position = MathCore.v3Add(
            this.userState.rightHand.predictedPosition,
            grabbed.grabOffset
          );
        }
        return {
          action: 'PRECISION_GRAB',
          targetId: this.activeGrabbedObjectId,
          handPos: this.userState.rightHand.predictedPosition
        };
      }
    } else if (this.activeGrabbedObjectId) {
      // Release object
      const grabbed = this.objects.get(this.activeGrabbedObjectId);
      if (grabbed) {
        grabbed.isGrabbed = false;
        grabbed.grabOffset = undefined;
      }
      const releasedId = this.activeGrabbedObjectId;
      this.activeGrabbedObjectId = null;

      return {
        action: 'OBJECT_RELEASE',
        targetId: releasedId
      };
    }

    return { action: 'NONE' };
  }

  /**
   * Applies rigid transform correction to worldToDisplayTransform matrix
   */
  public applyCalibrationMatrix(deltaMatrix: Float32Array): void {
    this.worldToDisplayTransform = MathCore.mat4Multiply(deltaMatrix, this.worldToDisplayTransform);
  }

  /**
   * Records current system state snapshot into flight recorder
   */
  public snapshotFlightRecord(errorMm: number = 0, hapticFocus?: Vector3, action?: string): void {
    if (!this.flightRecorder.getIsRecording()) return;

    const objectsState = Array.from(this.objects.values()).map(o => ({
      id: o.id,
      position: { ...o.position },
      rotation: { ...o.rotation },
      scale: { ...o.scale }
    }));

    this.flightRecorder.recordFrame({
      timestampMicros: Math.round(performance.now() * 1000),
      headPosition: { ...this.userState.headPosition },
      gazeRay: {
        origin: { ...this.userState.gazeRay.origin },
        direction: { ...this.userState.gazeRay.direction }
      },
      leftHand: {
        palm: { ...this.userState.leftHand.palmPosition },
        pinchDistMm: this.userState.leftHand.pinchDistanceMm,
        isPinching: this.userState.leftHand.isPinching,
        predictedPos: { ...this.userState.leftHand.predictedPosition }
      },
      rightHand: {
        palm: { ...this.userState.rightHand.palmPosition },
        pinchDistMm: this.userState.rightHand.pinchDistanceMm,
        isPinching: this.userState.rightHand.isPinching,
        predictedPos: { ...this.userState.rightHand.predictedPosition }
      },
      objects: objectsState,
      calibrationErrorMm: errorMm,
      hapticFocalPoint: hapticFocus,
      activeAction: action
    });
  }
}
