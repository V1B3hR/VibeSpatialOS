/**
 * VIBE SpatialOS - Spatial Gateway Server
 * Handles UDP Multicast packet streaming from hardware sensor nodes (RP2040/ESP32)
 * and relays spatial frames to Web clients via low-latency WebSocket.
 */

import { WebSocketServer, WebSocket } from 'ws';
import dgram from 'node:dgram';
import { PacketDecoder, DecodedSpatialFrameV2 } from '@vibe/spatial-core';

export interface GatewayConfig {
  wsPort: number;
  multicastIp: string;
  multicastPort: number;
  enableSyntheticFallback: boolean;
}

export class SpatialGateway {
  private wsServer: WebSocketServer | null = null;
  private udpSocket: dgram.Socket | null = null;
  private clients: Set<WebSocket> = new Set();
  private syntheticInterval: NodeJS.Timeout | null = null;
  private lastHardwareFrameTime: number = 0;

  constructor(private config: GatewayConfig) {}

  public start(): void {
    // 1. Initialize WebSocket Server
    this.wsServer = new WebSocketServer({ port: this.config.wsPort });
    console.log(`[SpatialGateway] WebSocket server listening on ws://localhost:${this.config.wsPort}`);

    this.wsServer.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      console.log(`[SpatialGateway] Web client connected. Total active clients: ${this.clients.size}`);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[SpatialGateway] Client disconnected. Total active clients: ${this.clients.size}`);
      });

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          }
        } catch {
          // ignore non-JSON control messages
        }
      });
    });

    // 2. Initialize UDP Multicast Receiver
    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.udpSocket.on('error', (err) => {
        console.warn(`[SpatialGateway] UDP socket error: ${err.message}. Running in synthetic sensor mode.`);
      });

      this.udpSocket.on('message', (msg: Buffer, rinfo) => {
        const decoded = PacketDecoder.decode(msg);
        if (decoded && decoded.crcValid) {
          this.lastHardwareFrameTime = Date.now();
          this.broadcastFrame(decoded);
        }
      });

      this.udpSocket.bind(this.config.multicastPort, () => {
        try {
          this.udpSocket?.addMembership(this.config.multicastIp);
          console.log(`[SpatialGateway] UDP Multicast listening on ${this.config.multicastIp}:${this.config.multicastPort}`);
        } catch (mErr: any) {
          console.warn(`[SpatialGateway] Multicast membership notice: ${mErr.message}`);
        }
      });
    } catch (e: any) {
      console.warn(`[SpatialGateway] UDP initialization note: ${e.message}`);
    }

    // 3. Synthetic Multi-Node Sensor Generator (if hardware isn't currently transmitting)
    if (this.config.enableSyntheticFallback) {
      let t = 0;
      this.syntheticInterval = setInterval(() => {
        const now = Date.now();
        // If no real hardware packet in last 500ms, stream synthetic spatial nodes
        if (now - this.lastHardwareFrameTime > 500 && this.clients.size > 0) {
          t += 0.0166;
          for (let nodeId = 1; nodeId <= 4; nodeId++) {
            const frame = this.generateSyntheticFrame(nodeId, t);
            this.broadcastFrame(frame);
          }
        }
      }, 16); // ~60 Hz
    }
  }

  private generateSyntheticFrame(nodeId: number, t: number): DecodedSpatialFrameV2 {
    const depthMatrixMm: number[] = [];
    const confidence: number[] = [];

    // Synthesize 8x8 depth grid with interactive moving obstacle
    const handX = Math.sin(t * 1.5) * 2.0;
    const handY = Math.cos(t * 1.2) * 2.0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const gridX = (c - 3.5) / 1.5;
        const gridY = (r - 3.5) / 1.5;
        const distToHand = Math.hypot(gridX - handX, gridY - handY);

        let depth = 650 + Math.sin(t * 2 + nodeId + (r * 8 + c) * 0.1) * 30;
        if (distToHand < 1.8) {
          // Hand proximity depression
          depth -= (1.8 - distToHand) * 200;
        }

        depthMatrixMm.push(Math.round(Math.max(150, Math.min(1200, depth))));
        confidence.push(255);
      }
    }

    return {
      magicHeader: PacketDecoder.EXPECTED_MAGIC,
      nodeId,
      hardwareTimestampMicros: Math.round(performance.now() * 1000),
      quaternion: { w: 1, x: 0, y: 0, z: 0 },
      depthMatrixMm,
      confidence,
      crcValid: true
    };
  }

  private broadcastFrame(frame: DecodedSpatialFrameV2): void {
    const payload = JSON.stringify({
      type: 'SPATIAL_FRAME',
      data: frame
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  public stop(): void {
    if (this.syntheticInterval) clearInterval(this.syntheticInterval);
    if (this.udpSocket) this.udpSocket.close();
    if (this.wsServer) this.wsServer.close();
  }
}
