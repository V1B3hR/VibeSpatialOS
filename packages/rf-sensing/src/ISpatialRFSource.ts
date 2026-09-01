/**
 * VIBE SpatialOS - Unified RF Sensing Hardware Abstraction Layer (HAL)
 * Defines interfaces for Wi-Fi CSI sources, 17-keypoint human skeleton poses,
 * vital biometrics, and RF presence awareness.
 */

import { Vector3, OBBVolume } from '@vibe/spatial-core';

export type RFKeypointName =
  | 'nose'
  | 'left_eye'
  | 'right_eye'
  | 'left_ear'
  | 'right_ear'
  | 'left_shoulder'
  | 'right_shoulder'
  | 'left_elbow'
  | 'right_elbow'
  | 'left_wrist'
  | 'right_wrist'
  | 'left_hip'
  | 'right_hip'
  | 'left_knee'
  | 'right_knee'
  | 'left_ankle'
  | 'right_ankle';

export interface RFKeypoint3D {
  name: RFKeypointName;
  position: Vector3;
  confidence: number; // 0.0 to 1.0
}

export interface RFSkeleton17 {
  personId: string;
  keypoints: Record<RFKeypointName, RFKeypoint3D>;
  rootCenter: Vector3;
  boundingBox: OBBVolume;
  overallConfidence: number;
}

export interface RFVitals {
  breathingRateBpm: number;
  heartRateBpm: number;
  chestDisplacementMm: number;
  confidence: number;
}

export interface RFSubcarrierCSI {
  subcarrierIndex: number;
  amplitude: number;
  phaseRad: number;
  snrDb: number;
}

export interface RFFrame {
  frameId: number;
  timestampMs: number;
  sourceNodeId: string;
  subcarriers: RFSubcarrierCSI[];
  skeleton?: RFSkeleton17;
  vitals?: RFVitals;
  presenceConfidence: number; // 0.0 to 1.0
  isMotionDetected: boolean;
  rfDopplerShiftHz?: number;
}

export type RFSourceType =
  | 'RVCSI_RUVIEW'
  | 'ESP32_CSI'
  | 'WIFI_3D_FUSION'
  | 'NEXMON'
  | 'SIMULATED';

export interface RFSourceStatus {
  connected: boolean;
  sourceId: string;
  sourceType: RFSourceType;
  sampleRateHz: number;
  packetsReceived: number;
  lastPacketTimestampMs: number;
  errorCount: number;
}

export interface ISpatialRFSource {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  onFrame(callback: (frame: RFFrame) => void): void;
  removeFrameListener(callback: (frame: RFFrame) => void): void;
  getStatus(): RFSourceStatus;
}
