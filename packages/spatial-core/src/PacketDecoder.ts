/**
 * VIBE SpatialOS - Binary Spatial Packet Decoder (v2.0)
 * Unpacks 60Hz high-speed ToF (8x8) and IMU telemetry with CRC16 verification.
 */

export interface DecodedSpatialFrameV2 {
  magicHeader: number;
  nodeId: number;
  hardwareTimestampMicros: number;
  quaternion: { w: number; x: number; y: number; z: number };
  depthMatrixMm: number[]; // 64 values (8x8 grid)
  confidence: number[];    // 64 values (8x8 grid)
  crcValid: boolean;
}

export class PacketDecoder {
  public static readonly EXPECTED_MAGIC = 0x5642; // "VB"
  public static readonly PACKET_SIZE_BYTES = 2 + 1 + 4 + 16 + 128 + 64 + 2; // 217 bytes

  /**
   * Computes standard CRC-16-CCITT (polynomial 0x1021, init 0xFFFF)
   */
  public static computeCRC16(buffer: Uint8Array, length: number): number {
    let crc = 0xffff;
    for (let i = 0; i < length; i++) {
      crc ^= buffer[i] << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc;
  }

  /**
   * Decodes a binary packet into a structured frame
   */
  public static decode(buffer: Uint8Array | { buffer: ArrayBuffer; byteOffset: number; byteLength: number }): DecodedSpatialFrameV2 | null {
    if (buffer.byteLength < this.PACKET_SIZE_BYTES) {
      return null;
    }

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let offset = 0;

    // 1. Magic Header (2 bytes, Big-Endian)
    const magic = view.getUint16(offset, false);
    offset += 2;
    if (magic !== this.EXPECTED_MAGIC) {
      return null;
    }

    // 2. Node ID (1 byte)
    const nodeId = view.getUint8(offset);
    offset += 1;

    // 3. Hardware Timestamp (4 bytes, Little-Endian)
    const hardwareTimestampMicros = view.getUint32(offset, true);
    offset += 4;

    // 4. IMU Quaternion (4x Float32, Little-Endian: [w, x, y, z])
    const qw = view.getFloat32(offset, true); offset += 4;
    const qx = view.getFloat32(offset, true); offset += 4;
    const qy = view.getFloat32(offset, true); offset += 4;
    const qz = view.getFloat32(offset, true); offset += 4;

    // 5. 8x8 ToF Depth Matrix (64x Uint16, Little-Endian)
    const depthMatrixMm: number[] = [];
    for (let i = 0; i < 64; i++) {
      depthMatrixMm.push(view.getUint16(offset, true));
      offset += 2;
    }

    // 6. 8x8 Confidence Matrix (64x Uint8)
    const confidence: number[] = [];
    for (let i = 0; i < 64; i++) {
      confidence.push(view.getUint8(offset));
      offset += 1;
    }

    // 7. CRC16 (2 bytes, Little-Endian)
    const receivedCrc = view.getUint16(offset, true);
    const calculatedCrc = this.computeCRC16(
      new Uint8Array(buffer.buffer, buffer.byteOffset, offset),
      offset
    );

    const crcValid = receivedCrc === calculatedCrc;

    return {
      magicHeader: magic,
      nodeId,
      hardwareTimestampMicros,
      quaternion: { w: qw, x: qx, y: qy, z: qz },
      depthMatrixMm,
      confidence,
      crcValid
    };
  }

  /**
   * Encodes a frame into a binary buffer (for synthetic node generator or testbed)
   */
  public static encode(frame: Omit<DecodedSpatialFrameV2, 'magicHeader' | 'crcValid'>): Uint8Array {
    const buffer = new Uint8Array(this.PACKET_SIZE_BYTES);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    // Magic (Big-Endian)
    view.setUint16(offset, this.EXPECTED_MAGIC, false);
    offset += 2;

    // Node ID
    view.setUint8(offset, frame.nodeId);
    offset += 1;

    // Timestamp (Little-Endian)
    view.setUint32(offset, frame.hardwareTimestampMicros, true);
    offset += 4;

    // Quaternion
    view.setFloat32(offset, frame.quaternion.w, true); offset += 4;
    view.setFloat32(offset, frame.quaternion.x, true); offset += 4;
    view.setFloat32(offset, frame.quaternion.y, true); offset += 4;
    view.setFloat32(offset, frame.quaternion.z, true); offset += 4;

    // Depth Matrix
    for (let i = 0; i < 64; i++) {
      view.setUint16(offset, frame.depthMatrixMm[i] || 500, true);
      offset += 2;
    }

    // Confidence
    for (let i = 0; i < 64; i++) {
      view.setUint8(offset, frame.confidence[i] || 255);
      offset += 1;
    }

    // Calculate CRC
    const crc = this.computeCRC16(buffer, offset);
    view.setUint16(offset, crc, true);

    return buffer;
  }
}
