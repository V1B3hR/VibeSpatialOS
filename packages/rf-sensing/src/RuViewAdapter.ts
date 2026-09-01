/**
 * VIBE SpatialOS - π RuView / rvCSI Hardware Adapter
 * Ingests 802.11n/ac Wi-Fi Channel State Information (CSI) from rvCSI runtime
 * or ESP32-S3 sensor mesh via WebSocket/TCP stream.
 */

import {
  ISpatialRFSource,
  RFFrame,
  RFSourceStatus,
  RFSubcarrierCSI
} from './ISpatialRFSource.js';
import { RFPoseEstimator } from './RFPoseEstimator.js';
import { SensorCircuitBreaker } from './SensorCircuitBreaker.js';

export interface RuViewAdapterConfig {
  sourceId: string;
  targetEndpointUrl?: string;
  expectedSampleRateHz?: number;
}

export class RuViewAdapter implements ISpatialRFSource {
  private isConnected: boolean = false;
  private listeners: ((frame: RFFrame) => void)[] = [];
  private packetsReceived: number = 0;
  private lastPacketTimestampMs: number = 0;
  private errorCount: number = 0;
  private poseEstimator = new RFPoseEstimator();
  public readonly circuitBreaker: SensorCircuitBreaker;

  constructor(private config: RuViewAdapterConfig = { sourceId: 'ruview_node_01' }) {
    this.circuitBreaker = new SensorCircuitBreaker(config.sourceId, {
      failureThreshold: 4,
      resetTimeoutMs: 2000,
      timeoutMs: 300
    });
  }

  public async connect(): Promise<boolean> {
    this.isConnected = true;
    this.circuitBreaker.recordSuccess();
    return true;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.listeners = [];
  }

  public onFrame(callback: (frame: RFFrame) => void): void {
    this.listeners.push(callback);
  }

  public removeFrameListener(callback: (frame: RFFrame) => void): void {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  /**
   * Ingests a raw CSI packet stream from ESP32-S3 or rvCSI WebSocket
   */
  public ingestRawCSIPacket(
    subcarrierAmplitudes: number[],
    subcarrierPhases: number[],
    timestampMs: number = Date.now(),
    sourceNodeId: string = this.config.sourceId
  ): void {
    if (!this.isConnected) return;

    try {
      const subcarriers: RFSubcarrierCSI[] = subcarrierAmplitudes.map((amp, idx) => ({
        subcarrierIndex: idx,
        amplitude: amp,
        phaseRad: subcarrierPhases[idx] || 0,
        snrDb: Math.max(10, Math.min(45, amp * 0.8))
      }));

      const skeleton = this.poseEstimator.estimateSkeleton(subcarriers);
      const vitals = this.poseEstimator.estimateVitals(subcarriers, timestampMs / 1000.0);

      const frame: RFFrame = {
        frameId: ++this.packetsReceived,
        timestampMs,
        sourceNodeId,
        subcarriers,
        skeleton,
        vitals,
        presenceConfidence: skeleton.overallConfidence,
        isMotionDetected: true
      };

      this.lastPacketTimestampMs = timestampMs;
      this.circuitBreaker.recordSuccess();
      this.notifyListeners(frame);
    } catch (err) {
      this.errorCount++;
      this.circuitBreaker.recordFailure();
    }
  }

  public getStatus(): RFSourceStatus {
    return {
      connected: this.isConnected && this.circuitBreaker.getState() !== 'OPEN',
      sourceId: this.config.sourceId,
      sourceType: 'RVCSI_RUVIEW',
      sampleRateHz: this.config.expectedSampleRateHz || 20,
      packetsReceived: this.packetsReceived,
      lastPacketTimestampMs: this.lastPacketTimestampMs,
      errorCount: this.errorCount
    };
  }

  private notifyListeners(frame: RFFrame): void {
    this.listeners.forEach(cb => cb(frame));
  }
}
