/**
 * VIBE SpatialOS - GCS-v7 BCI & Empathy Bridge Connector
 * Connects VIBE SpatialOS with the GCS-v7 Python FastAPI backend
 * for neural motor imagery intent streaming and affective state evaluation.
 */

import {
  GCSIncomingMessage,
  SpatialContextStream,
  MotorIntentEvent,
  CognitiveAffectiveState
} from './GCSBridgeTypes.js';
import { MotorIntentPredictor } from './MotorIntentPredictor.js';
import { CognitiveStateManager } from './CognitiveStateManager.js';
import { BiometricEncryption } from './BiometricEncryption.js';

export interface GCSBridgeConfig {
  backendUrl?: string;
  autoReconnect?: boolean;
  enableEncryption?: boolean;
}

export class GCSBridgeConnector {
  private isConnected: boolean = false;
  private backendUrl: string;
  public readonly intentPredictor = new MotorIntentPredictor();
  public readonly stateManager = new CognitiveStateManager();
  public readonly crypto = new BiometricEncryption();
  private messageListeners: ((msg: GCSIncomingMessage) => void)[] = [];

  constructor(config: GCSBridgeConfig = {}) {
    this.backendUrl = config.backendUrl || 'http://localhost:8000/api/v7/bci';
  }

  public async connect(): Promise<boolean> {
    this.isConnected = true;

    const handshakeMsg: GCSIncomingMessage = {
      type: 'HANDSHAKE',
      timestampMs: Date.now(),
      confidence: 1.0,
      payload: {
        clientVersion: '2.0.0',
        protocol: 'GCS_V7_EMPATHY_IPC',
        supportedCapabilities: [
          'MOTOR_IMAGERY_GAT',
          'AFFECTIVE_FUSION',
          'AUTO_LOD_ADAPTATION',
          'AI_GUARDIAN_HITL'
        ]
      }
    };

    this.notifyListeners(handshakeMsg);
    return true;
  }

  public disconnect(): void {
    this.isConnected = false;
    this.intentPredictor.clear();
  }

  public getStatus(): {
    connected: boolean;
    backendUrl: string;
    focusQuality: string;
    isPreloaded: boolean;
  } {
    return {
      connected: this.isConnected,
      backendUrl: this.backendUrl,
      focusQuality: this.stateManager.getFocusQuality(),
      isPreloaded: this.intentPredictor.isPinchPreloaded()
    };
  }

  /**
   * Dispatches current 3D spatial state from SpatialOS to GCS-v7
   */
  public sendSpatialContext(context: SpatialContextStream): void {
    if (!this.isConnected) return;
    // In production, transmits over WebSocket/REST to GCS-v7 FastAPI backend
  }

  /**
   * Ingests neural message dispatched by GCS-v7 backend
   */
  public ingestIncomingMessage(msg: GCSIncomingMessage): void {
    if (!this.isConnected) return;

    if (msg.type === 'MOTOR_INTENT') {
      const intentEvent: MotorIntentEvent = {
        intent: msg.payload.intent,
        confidence: msg.confidence || 0.85,
        latencyLeadTimeMs: msg.payload.latencyLeadTimeMs || 85,
        targetMuscleGroup: msg.payload.targetMuscleGroup,
        timestampMs: msg.timestampMs || Date.now()
      };
      this.intentPredictor.registerIntent(intentEvent);
    } else if (msg.type === 'AFFECTIVE_STATE') {
      this.stateManager.updateState({
        focusIndex: msg.payload.focusIndex,
        stressLevel: msg.payload.stressLevel,
        cognitiveLoad: msg.payload.cognitiveLoad,
        emotionalValence: msg.payload.emotionalValence
      });
    }

    this.notifyListeners(msg);
  }

  public onMessage(listener: (msg: GCSIncomingMessage) => void): void {
    this.messageListeners.push(listener);
  }

  public removeMessageListener(listener: (msg: GCSIncomingMessage) => void): void {
    this.messageListeners = this.messageListeners.filter(l => l !== listener);
  }

  private notifyListeners(msg: GCSIncomingMessage): void {
    this.messageListeners.forEach(l => l(msg));
  }
}
