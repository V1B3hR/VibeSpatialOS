/**
 * VIBE SpatialOS - Deterministic Spatial Black-Box Flight Recorder
 * Records every sensory frame, object transform, gesture event, and calibration metric
 * with microsecond timestamps for deterministic replay and Spatial Undo/Redo.
 */

import { Vector3, Quaternion } from './MathCore.js';

export interface RecordedSpatialObjectState {
  id: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

export interface RecordedSpatialFrame {
  frameIndex: number;
  timestampMicros: number;
  headPosition: Vector3;
  gazeRay: { origin: Vector3; direction: Vector3 };
  leftHand: {
    palm: Vector3;
    pinchDistMm: number;
    isPinching: boolean;
    predictedPos: Vector3;
  };
  rightHand: {
    palm: Vector3;
    pinchDistMm: number;
    isPinching: boolean;
    predictedPos: Vector3;
  };
  objects: RecordedSpatialObjectState[];
  calibrationErrorMm: number;
  hapticFocalPoint?: Vector3;
  activeAction?: string;
}

export class FlightRecorder {
  private frames: RecordedSpatialFrame[] = [];
  private isRecording: boolean = false;
  private isReplaying: boolean = false;
  private replayCursor: number = 0;
  private maxFrames: number;

  constructor(maxFrames: number = 36000) { // ~10 minutes @ 60fps
    this.maxFrames = maxFrames;
  }

  public startRecording(): void {
    this.frames = [];
    this.isRecording = true;
    this.isReplaying = false;
    this.replayCursor = 0;
  }

  public stopRecording(): number {
    this.isRecording = false;
    return this.frames.length;
  }

  public recordFrame(frameData: Omit<RecordedSpatialFrame, 'frameIndex'>): void {
    if (!this.isRecording) return;

    if (this.frames.length >= this.maxFrames) {
      this.frames.shift(); // Evict oldest frame in circular buffer
    }

    this.frames.push({
      frameIndex: this.frames.length,
      ...frameData
    });
  }

  public startReplay(): void {
    if (this.frames.length === 0) return;
    this.isRecording = false;
    this.isReplaying = true;
    this.replayCursor = 0;
  }

  public stopReplay(): void {
    this.isReplaying = false;
  }

  public getNextReplayFrame(): RecordedSpatialFrame | null {
    if (!this.isReplaying || this.frames.length === 0) return null;

    if (this.replayCursor >= this.frames.length) {
      this.replayCursor = 0; // Loop replay
    }

    const frame = this.frames[this.replayCursor++];
    return frame;
  }

  public seek(frameIndex: number): RecordedSpatialFrame | null {
    if (frameIndex < 0 || frameIndex >= this.frames.length) return null;
    this.replayCursor = frameIndex;
    return this.frames[frameIndex];
  }

  public getFrameCount(): number {
    return this.frames.length;
  }

  public getReplayCursor(): number {
    return this.replayCursor;
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public getIsReplaying(): boolean {
    return this.isReplaying;
  }

  public exportJSON(): string {
    return JSON.stringify(this.frames, null, 2);
  }

  public importJSON(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        this.frames = parsed;
        this.replayCursor = 0;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
