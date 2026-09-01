/**
 * VIBE SpatialOS - Universal CAD/BIM Bridge Connector (v2.0)
 * Connects external engineering suites (SolidWorks, Rhino 8, Autodesk Revit, Blender, CATIA)
 * with VIBE SpatialOS for bidirectional 60-120Hz live scene synchronization,
 * deictic spatial picking injection, and parametric feature dimension editing.
 */

import { MathCore, Vector3, Quaternion } from './MathCore.js';

export type CADHostSoftware =
  | 'SOLIDWORKS'
  | 'RHINO_8'
  | 'AUTODESK_REVIT'
  | 'AUTOCAD'
  | 'BLENDER'
  | 'CATIA'
  | 'FREECAD';

export type CADSyncMessageType =
  | 'HANDSHAKE'
  | 'SYNC_ASSEMBLY_TREE'
  | 'STREAM_BREP_MESH'
  | 'DEICTIC_PICK_EVENT'
  | 'HAPTIC_FEEDBACK_ENVELOPE'
  | 'PARAMETRIC_UPDATE';

export interface CADPartNode {
  partId: string;
  partName: string;
  parentPartId?: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  halfExtents: Vector3;
  vertexCount: number;
  faceCount: number;
  material: {
    colorHex: number;
    metalness: number;
    roughness: number;
    opacity: number;
  };
  parametricFeatures?: Record<string, number | string>;
}

export interface CADSyncMessage {
  type: CADSyncMessageType;
  host: CADHostSoftware;
  sessionToken: string;
  timestampMs: number;
  payload: any;
}

export class CADBridgeConnector {
  private isConnected: boolean = false;
  private currentHost: CADHostSoftware | null = null;
  private sessionToken: string = '';
  private parts: Map<string, CADPartNode> = new Map();
  private listeners: ((msg: CADSyncMessage) => void)[] = [];

  constructor() {}

  public connect(host: CADHostSoftware, sessionToken?: string): boolean {
    this.isConnected = true;
    this.currentHost = host;
    this.sessionToken = sessionToken || `VIBE_CAD_SESSION_${Date.now()}`;

    const handshakeMsg: CADSyncMessage = {
      type: 'HANDSHAKE',
      host,
      sessionToken: this.sessionToken,
      timestampMs: Date.now(),
      payload: {
        protocolVersion: '2.0.0',
        supportedFeatures: [
          'LIVE_BREP_STREAM',
          'DEICTIC_PICK_INJECTION',
          'PARAMETRIC_MODIFICATION',
          'HAPTIC_EDGE_FEEDBACK'
        ]
      }
    };

    this.notifyListeners(handshakeMsg);
    return true;
  }

  public disconnect(): void {
    this.isConnected = false;
    this.currentHost = null;
    this.sessionToken = '';
    this.parts.clear();
  }

  public getStatus(): {
    connected: boolean;
    host: CADHostSoftware | null;
    sessionToken: string;
    partCount: number;
  } {
    return {
      connected: this.isConnected,
      host: this.currentHost,
      sessionToken: this.sessionToken,
      partCount: this.parts.size
    };
  }

  /**
   * Ingests hierarchical assembly tree sent by the CAD host plugin
   */
  public ingestAssemblyTree(partNodes: CADPartNode[]): void {
    partNodes.forEach(part => {
      this.parts.set(part.partId, part);
    });

    const syncMsg: CADSyncMessage = {
      type: 'SYNC_ASSEMBLY_TREE',
      host: this.currentHost || 'SOLIDWORKS',
      sessionToken: this.sessionToken,
      timestampMs: Date.now(),
      payload: { partCount: partNodes.length, parts: partNodes }
    };

    this.notifyListeners(syncMsg);
  }

  public getParts(): CADPartNode[] {
    return Array.from(this.parts.values());
  }

  public getPart(partId: string): CADPartNode | undefined {
    return this.parts.get(partId);
  }

  /**
   * Modifies a parametric CAD dimension (e.g. radius, extrusionLength) and broadcasts to CAD host
   */
  public updateParametricFeature(
    partId: string,
    featureName: string,
    newValue: number | string
  ): boolean {
    const part = this.parts.get(partId);
    if (!part) return false;

    if (!part.parametricFeatures) {
      part.parametricFeatures = {};
    }
    part.parametricFeatures[featureName] = newValue;

    const updateMsg: CADSyncMessage = {
      type: 'PARAMETRIC_UPDATE',
      host: this.currentHost || 'SOLIDWORKS',
      sessionToken: this.sessionToken,
      timestampMs: Date.now(),
      payload: {
        partId,
        featureName,
        newValue
      }
    };

    this.notifyListeners(updateMsg);
    return true;
  }

  /**
   * Injects 3D spatial deictic pick ray from VIBE SpatialOS back into host CAD viewport
   */
  public dispatchDeicticPick(
    partId: string,
    pickPosition: Vector3,
    rayDirection: Vector3
  ): CADSyncMessage {
    const pickMsg: CADSyncMessage = {
      type: 'DEICTIC_PICK_EVENT',
      host: this.currentHost || 'SOLIDWORKS',
      sessionToken: this.sessionToken,
      timestampMs: Date.now(),
      payload: {
        selectedPartId: partId,
        pickPosition,
        rayDirection
      }
    };

    this.notifyListeners(pickMsg);
    return pickMsg;
  }

  public onMessage(listener: (msg: CADSyncMessage) => void): void {
    this.listeners.push(listener);
  }

  public removeMessageListener(listener: (msg: CADSyncMessage) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(msg: CADSyncMessage): void {
    this.listeners.forEach(l => l(msg));
  }
}
