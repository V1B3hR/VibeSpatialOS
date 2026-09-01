/**
 * VIBE SpatialOS - Binary Spatial Packet Decoder (v2.0)
 * Unpacks 60Hz high-speed ToF (8x8) and IMU telemetry with CRC16 verification.
 */
export interface DecodedSpatialFrameV2 {
    magicHeader: number;
    nodeId: number;
    hardwareTimestampMicros: number;
    quaternion: {
        w: number;
        x: number;
        y: number;
        z: number;
    };
    depthMatrixMm: number[];
    confidence: number[];
    crcValid: boolean;
}
export declare class PacketDecoder {
    static readonly EXPECTED_MAGIC = 22082;
    static readonly PACKET_SIZE_BYTES: number;
    /**
     * Computes standard CRC-16-CCITT (polynomial 0x1021, init 0xFFFF)
     */
    static computeCRC16(buffer: Uint8Array, length: number): number;
    /**
     * Decodes a binary packet into a structured frame
     */
    static decode(buffer: Uint8Array | Buffer): DecodedSpatialFrameV2 | null;
    /**
     * Encodes a frame into a binary buffer (for synthetic node generator or testbed)
     */
    static encode(frame: Omit<DecodedSpatialFrameV2, 'magicHeader' | 'crcValid'>): Uint8Array;
}
//# sourceMappingURL=PacketDecoder.d.ts.map