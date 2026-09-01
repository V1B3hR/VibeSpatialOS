/**
 * VIBE SpatialOS - Simulated RF Wi-Fi CSI Generator
 * Generates synthetic 64-subcarrier CSI packets, multipath wave reflections,
 * human breathing micro-Doppler, and skeletal motion for offline development.
 */

import {
  ISpatialRFSource,
  RFFrame,
  RFSourceStatus,
  RFSubcarrierCSI
} from './ISpatialRFSource.js';
import { RFPoseEstimator } from './RFPoseEstimator.js';

export class SimulatedRFSource implements ISpatialRFSource {
  private isConnected: boolean = false;
  private listeners: ((frame: RFFrame) => void)[] = [];
  private packetsReceived: number = 0;
  private lastPacketTimestampMs: number = 0;
  private timerId: any = null;
  private poseEstimator = new RFPoseEstimator();

  constructor(
    private sampleRateHz: number = 20,
    private sourceId: string = 'simulated_rf_mesh_01'
  ) {}

  public async connect(): Promise<boolean> {
    this.isConnected = true;
    this.startStreaming();
    return true;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.listeners = [];
  }

  public onFrame(callback: (frame: RFFrame) => void): void {
    this.listeners.push(callback);
  }

  public removeFrameListener(callback: (frame: RFFrame) => void): void {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  public getStatus(): RFSourceStatus {
    return {
      connected: this.isConnected,
      sourceId: this.sourceId,
      sourceType: 'SIMULATED',
      sampleRateHz: this.sampleRateHz,
      packetsReceived: this.packetsReceived,
      lastPacketTimestampMs: this.lastPacketTimestampMs,
      errorCount: 0
    };
  }

  /**
   * Generates a single deterministic simulated RF frame at a given timestamp
   */
  public generateFrame(timestampMs: number = Date.now()): RFFrame {
    const timeSec = timestampMs / 1000.0;
    const subcarriers: RFSubcarrierCSI[] = [];

    // Synthesize 64 Wi-Fi OFDM subcarriers with multipath fading
    for (let i = 0; i < 64; i++) {
      const baseAmp = 20.0 + Math.sin(i * 0.2 + timeSec * 1.5) * 5.0;
      const breathingMod = Math.sin(timeSec * 2 * Math.PI * 0.25) * 1.2;
      const noise = (Math.random() - 0.5) * 0.5;

      const amp = Math.max(1.0, baseAmp + breathingMod + noise);
      const phase = ((i * 0.15 + timeSec * 0.8) % (2 * Math.PI));

      subcarriers.push({
        subcarrierIndex: i,
        amplitude: amp,
        phaseRad: phase,
        snrDb: Math.max(12, Math.min(42, amp * 1.1))
      });
    }

    // Dynamic arm sway
    const armLeftSway = {
      x: Math.sin(timeSec * 1.2) * 0.05,
      y: Math.cos(timeSec * 1.2) * 0.04,
      z: Math.sin(timeSec * 0.8) * 0.06
    };
    const armRightSway = {
      x: Math.cos(timeSec * 1.2) * 0.05,
      y: Math.sin(timeSec * 1.2) * 0.04,
      z: Math.cos(timeSec * 0.8) * 0.06
    };

    const skeleton = this.poseEstimator.estimateSkeleton(
      subcarriers,
      { x: 0, y: 0, z: -0.4 }, // Human standing in front of sensor mesh
      { left: armLeftSway, right: armRightSway }
    );

    const vitals = this.poseEstimator.estimateVitals(subcarriers, timeSec);

    this.packetsReceived++;
    this.lastPacketTimestampMs = timestampMs;

    return {
      frameId: this.packetsReceived,
      timestampMs,
      sourceNodeId: this.sourceId,
      subcarriers,
      skeleton,
      vitals,
      presenceConfidence: skeleton.overallConfidence,
      isMotionDetected: true,
      rfDopplerShiftHz: 1.45 + Math.sin(timeSec * 2.0) * 0.8
    };
  }

  private startStreaming(): void {
    const intervalMs = Math.max(10, Math.round(1000 / this.sampleRateHz));
    if (this.timerId) clearInterval(this.timerId);

    this.timerId = setInterval(() => {
      if (!this.isConnected) return;
      const frame = this.generateFrame();
      this.listeners.forEach(cb => cb(frame));
    }, intervalMs);
  }
}
