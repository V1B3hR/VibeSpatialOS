/**
 * VIBE SpatialOS - GCS-v7 BCI & Empathy Bridge Protocol Types
 * Standardized data contracts for neural motor imagery intent decoding,
 * affective state evaluation (focus, stress, cognitive load), and AI Guardian safety.
 */

import { Vector3 } from '@vibe/spatial-core';

export type MotorImageryIntent =
  | 'MOTOR_IMAGERY_PINCH'
  | 'MOTOR_IMAGERY_GRAB'
  | 'MOTOR_IMAGERY_ROTATE_CW'
  | 'MOTOR_IMAGERY_ROTATE_CCW'
  | 'MOTOR_IMAGERY_EXPAND'
  | 'MOTOR_IMAGERY_COLLAPSE'
  | 'MOTOR_IMAGERY_RELEASE'
  | 'RESTING_STATE';

export type AutoLODSuggestion = 'REDUCE_COMPLEXITY' | 'NORMAL_LOD' | 'MAX_PRECISION';

export interface CognitiveAffectiveState {
  focusIndex: number;          // 0.0 (distracted) to 1.0 (deep flow)
  stressLevel: number;         // 0.0 (calm) to 1.0 (acute stress)
  cognitiveLoad: number;       // 0.0 (idle) to 1.0 (overload)
  emotionalValence: number;    // -1.0 (negative) to +1.0 (positive)
  isCognitiveOverload: boolean;
  suggestedLOD: AutoLODSuggestion;
  timestampMs: number;
}

export interface AIGuardianConsent {
  consentGranted: boolean;
  severityLevel: 1 | 2 | 3 | 4 | 5 | 6;
  ethicalMessage: string;
  requiresManualConfirmation: boolean;
}

export interface MotorIntentEvent {
  intent: MotorImageryIntent;
  confidence: number;          // 0.0 to 1.0 (e.g. 0.865 from GAT model)
  latencyLeadTimeMs: number;   // How much time ahead of physical movement (e.g. 80ms)
  targetMuscleGroup?: string;
  timestampMs: number;
}

export type GCSMessageType =
  | 'MOTOR_INTENT'
  | 'AFFECTIVE_STATE'
  | 'GUARDIAN_CONSENT'
  | 'HEARTBEAT'
  | 'HANDSHAKE';

export interface GCSIncomingMessage {
  type: GCSMessageType;
  timestampMs: number;
  confidence: number;
  payload: any;
}

export interface SpatialContextStream {
  targetObjectId?: string;
  handPosition: Vector3;
  handVelocity: Vector3;
  gazeDirection: Vector3;
  currentLOD: string;
  rfPresenceConfidence: number;
  timestampMs: number;
}
