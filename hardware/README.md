# VIBE SpatialOS - Hardware Abstraction Layer (HAL) & Electronics Guide

This directory contains the firmware source code, pinouts, and electronic circuit models for the physical and simulated sensor nodes and ultrasonic mid-air haptic drivers.

---

## 1. Spatial Sensor Node (Wokwi Simulation / RP2040)

The **Spatial Sensor Node** is a high-speed peripheral deployed in the corners of the workspace (3x3m room or desktop testbed). It captures an 8x8 Time-of-Flight depth matrix and streams telemetry over UDP Multicast at 60 Hz with CRC16 verification.

### Hardware Specifications:
- **Microcontroller:** Raspberry Pi Pico (RP2040 Dual-Core ARM Cortex-M0+ @ 133MHz).
- **Depth Sensor:** STMicroelectronics VL53L5CX (8x8 multizone Time-of-Flight array).
- **IMU:** TDK InvenSense ICM-42688-P (Ultra-low noise 6-DoF accelerometer + gyroscope).
- **Network Module:** WIZnet W5500 (SPI Ethernet with hardware TCP/IP & Multicast IGMP).

### Pin Connections (RP2040):
| Peripheral | Pin (RP2040) | Function | Notes |
|---|---|---|---|
| **VL53L5CX** | `GP16` (MISO), `GP18` (SCK), `GP19` (MOSI) | SPI0 Bus | High-Speed DMA @ 10MHz |
| **VL53L5CX** | `GP17` | CS (Chip Select) | Active Low |
| **VL53L5CX** | `GP22` | INT (Data Ready) | Falling Edge Interrupt |
| **W5500** | `GP8` (MISO), `GP10` (SCK), `GP11` (MOSI) | SPI1 Bus | Multicast streaming |
| **W5500** | `GP9` | CS | Ethernet Chip Select |
| **Sync LED** | `GP20` | Output | Pulses on frame capture |
| **Net LED** | `GP21` | Output | Pulses on packet transmission |

### Running in Wokwi:
1. Open [https://wokwi.com](https://wokwi.com) and create a **Raspberry Pi Pico (Arduino)** project.
2. Replace `diagram.json` with [diagram.json](file:///c:/Projekty/Vibe%20SpatialOS/hardware/wokwi/diagram.json).
3. Replace `sketch.ino` with [sketch.ino](file:///c:/Projekty/Vibe%20SpatialOS/hardware/wokwi/sketch.ino).
4. Click **Start Simulation**.

---

## 2. Phased-Array Mid-Air Haptics Driver (Falstad Simulation)

The **Haptics Driver** generates a constructive acoustic pressure point in mid-air at 40 kHz. To allow human mechanoreceptors (Meissner and Pacinian corpuscles) to feel tactile clicks and textures, the 40 kHz ultrasound carrier is gated with a **200 Hz Amplitude Modulation (AM)** square/sine envelope.

### Circuit Architecture:
- **Phase Shift Generator:** RP2040 PIO (Programmable I/O) State Machine generating 16-channel phase-delayed bitstreams.
- **AM Gate:** 200 Hz Schmitt trigger analog modulator.
- **Power Driver:** TC4428 / MIC4427 Dual Inverting/Non-inverting High-Speed MOSFET drivers (±12V push-pull).
- **Transducers:** 16x 10mm 40kHz Piezoelectric Transducers (TCT40-16R / Murata MA40S4S).

### Simulating in Falstad:
1. Open [https://www.falstad.com/circuit/](https://www.falstad.com/circuit/).
2. Go to **File -> Import From Text...**.
3. Paste the contents of [phased_array_driver.txt](file:///c:/Projekty/Vibe%20SpatialOS/hardware/falstad/phased_array_driver.txt).
4. Observe the 40kHz burst waveforms modulated at 200Hz driving the 2.2nF piezoelectric load.
