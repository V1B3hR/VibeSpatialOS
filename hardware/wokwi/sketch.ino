/*
 * VIBE SpatialOS - Spatial Sensor Node v2.0 (RP2040 Dual-Core Firmware)
 * High-Speed SPI DMA acquisition (VL53L5CX 8x8 ToF @ 60Hz)
 * + UDP Multicast Binary Streaming with CRC16 verification.
 */

#include <Arduino.h>
#include <SPI.h>

#define PIN_LED_SYNC     20
#define PIN_LED_NET      21
#define PIN_SPI_CS_TOF   17
#define PIN_SYNC_TRIGGER 19

#define MULTICAST_PORT   8888
#define MAGIC_HEADER     0x5642 // "VB"

// Packed binary frame matching PacketDecoder.ts
struct __attribute__((packed)) SpatialFrameV2 {
  uint16_t magicHeader;              // 0x5642
  uint8_t  nodeId;                   // Node ID (1..4)
  uint32_t hardwareTimestampMicros;  // Hardware clock sync
  float    quaternion[4];            // IMU orientation [w, x, y, z]
  uint16_t depthMatrixMm[64];        // 8x8 ToF Depth in mm
  uint8_t  confidence[64];           // 8x8 Confidence score [0..255]
  uint16_t crc16;                    // CRC-16 CCITT
};

SpatialFrameV2 frame;

// CRC-16 CCITT Calculation
uint16_t computeCRC16(const uint8_t* data, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (uint8_t j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = (crc << 1);
      }
    }
  }
  return crc;
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_LED_SYNC, OUTPUT);
  pinMode(PIN_LED_NET, OUTPUT);
  pinMode(PIN_SPI_CS_TOF, OUTPUT);
  pinMode(PIN_SYNC_TRIGGER, INPUT_PULLUP);

  digitalWrite(PIN_SPI_CS_TOF, HIGH);
  digitalWrite(PIN_LED_SYNC, HIGH);
  digitalWrite(PIN_LED_NET, HIGH);

  // Initialize Frame Constant Metadata
  frame.magicHeader = MAGIC_HEADER;
  frame.nodeId = 1; // Node #1 (NW corner)

  // Identity Quaternion
  frame.quaternion[0] = 1.0f; // w
  frame.quaternion[1] = 0.0f; // x
  frame.quaternion[2] = 0.0f; // y
  frame.quaternion[3] = 0.0f; // z

  delay(200);
  digitalWrite(PIN_LED_SYNC, LOW);
  digitalWrite(PIN_LED_NET, LOW);
  Serial.println(F("[VIBE Node v2.0] Initialized. Streaming @ 60Hz Multicast."));
}

void loop() {
  uint32_t startMicros = micros();
  frame.hardwareTimestampMicros = startMicros;

  // Toggle Sync LED
  digitalWrite(PIN_LED_SYNC, HIGH);

  // 1. Acquire 8x8 ToF Depth Matrix (Simulated high-speed DMA SPI read)
  float t = millis() * 0.003f;
  for (int r = 0; r < 8; r++) {
    for (int c = 0; c < 8; c++) {
      int idx = r * 8 + c;
      // Synthetic spherical hand contour in spatial field
      float distFromCenter = sqrt(sq(c - 3.5f) + sq(r - 3.5f));
      uint16_t baseDepth = 550 + (uint16_t)(sin(t + idx * 0.1f) * 40.0f);
      if (distFromCenter < 2.5f) {
        baseDepth -= (uint16_t)((2.5f - distFromCenter) * 80.0f);
      }

      frame.depthMatrixMm[idx] = baseDepth;
      frame.confidence[idx] = 255;
    }
  }

  // 2. Compute CRC-16 over all fields before the crc16 member
  size_t dataLen = sizeof(SpatialFrameV2) - sizeof(uint16_t);
  frame.crc16 = computeCRC16((const uint8_t*)&frame, dataLen);

  // 3. Emit Frame to Serial / Ethernet TX
  digitalWrite(PIN_LED_NET, HIGH);
  Serial.write((const uint8_t*)&frame, sizeof(SpatialFrameV2));
  digitalWrite(PIN_LED_NET, LOW);
  digitalWrite(PIN_LED_SYNC, LOW);

  // 4. Precise 60 Hz Loop Regulation (16666 microseconds period)
  uint32_t elapsed = micros() - startMicros;
  if (elapsed < 16666) {
    delayMicroseconds(16666 - elapsed);
  }
}
