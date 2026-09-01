/**
 * VIBE SpatialOS - Ultrasonic Phased-Array Mid-Air Haptics Engine
 * 40kHz acoustic carrier phase-delay solver with 200Hz Amplitude Modulation (AM)
 * for human tactile mechanoreceptor actuation (Meissner & Pacinian).
 */

import { MathCore, Vector3 } from './MathCore.js';

export interface TransducerElement {
  id: number;
  position: Vector3;  // Position in metric space (meters)
  normal: Vector3;    // Emission direction
  phaseRad: number;   // Calculated phase delay in radians [0, 2π)
  amplitude: number;  // Normalized amplitude [0, 1]
}

export interface AcousticFieldSlice {
  width: number;
  height: number;
  resolution: number; // cells per meter
  pressureData: Float32Array; // Normalized acoustic pressure magnitudes
  peakPressureKPa: number;
  focalPoint: Vector3;
}

export class HapticsAMSolver {
  public static readonly SPEED_OF_SOUND_MPS = 343.0; // Air @ 20°C
  public static readonly CARRIER_FREQ_HZ = 40000.0;  // 40 kHz ultrasound
  public static readonly WAVELENGTH_M = HapticsAMSolver.SPEED_OF_SOUND_MPS / HapticsAMSolver.CARRIER_FREQ_HZ; // ~8.575 mm
  public static readonly DEFAULT_MODULATION_FREQ_HZ = 200.0; // Optimal human skin tactile peak

  private transducers: TransducerElement[] = [];
  private currentFocalPoint: Vector3 | null = null;
  private modulationFreqHz: number = HapticsAMSolver.DEFAULT_MODULATION_FREQ_HZ;
  private isEmissionActive: boolean = false;

  constructor(gridCols: number = 4, gridRows: number = 4, spacingMeters: number = 0.012) {
    this.initializeArray(gridCols, gridRows, spacingMeters);
  }

  /**
   * Initializes a planar phased array of transducers centered at origin (z = 0)
   */
  public initializeArray(cols: number, rows: number, spacing: number): void {
    this.transducers = [];
    const offsetX = ((cols - 1) * spacing) / 2;
    const offsetY = ((rows - 1) * spacing) / 2;

    let id = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.transducers.push({
          id: id++,
          position: {
            x: c * spacing - offsetX,
            y: r * spacing - offsetY,
            z: 0
          },
          normal: { x: 0, y: 0, z: 1 },
          phaseRad: 0,
          amplitude: 1.0
        });
      }
    }
  }

  public getTransducers(): TransducerElement[] {
    return this.transducers;
  }

  public setModulationFrequency(freqHz: number): void {
    this.modulationFreqHz = Math.max(10, Math.min(1000, freqHz));
  }

  public setEmissionActive(active: boolean): void {
    this.isEmissionActive = active;
  }

  public getEmissionActive(): boolean {
    return this.isEmissionActive;
  }

  /**
   * Solves phase delays for all transducers to form a constructive interference focus at r_focal
   */
  public solveFocalPoint(focalPos: Vector3): void {
    this.currentFocalPoint = { ...focalPos };
    const k = (2 * Math.PI) / HapticsAMSolver.WAVELENGTH_M; // Wavenumber

    for (const elem of this.transducers) {
      const dist = MathCore.v3Distance(focalPos, elem.position);
      // Phase delay for constructive interference: phi = 2pi - ((k * dist) mod 2pi)
      const phase = (2 * Math.PI - ((k * dist) % (2 * Math.PI))) % (2 * Math.PI);
      elem.phaseRad = phase;
      elem.amplitude = 1.0;
    }
    this.isEmissionActive = true;
  }

  /**
   * Computes instantaneous acoustic pressure at point p at time t (seconds), incorporating 200Hz AM envelope
   */
  public computePressureAt(p: Vector3, timeSec: number): { real: number; imag: number; magnitude: number; amModulated: number } {
    if (!this.isEmissionActive || this.transducers.length === 0) {
      return { real: 0, imag: 0, magnitude: 0, amModulated: 0 };
    }

    const k = (2 * Math.PI) / HapticsAMSolver.WAVELENGTH_M;
    let sumReal = 0;
    let sumImag = 0;

    for (const elem of this.transducers) {
      const dist = MathCore.v3Distance(p, elem.position);
      if (dist < 1e-4) continue;

      // Directivity factor (approximate piston model)
      const toP = MathCore.v3Sub(p, elem.position);
      const cosTheta = Math.max(0, MathCore.v3Dot(MathCore.v3Normalize(toP), elem.normal));

      // 1/r spherical wave attenuation + directivity
      const amplitudeFactor = (elem.amplitude * cosTheta) / dist;
      const totalPhase = elem.phaseRad - k * dist;

      sumReal += amplitudeFactor * Math.cos(totalPhase);
      sumImag += amplitudeFactor * Math.sin(totalPhase);
    }

    const magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);

    // 200Hz AM Modulation envelope: 0.5 * (1 + sin(2 * pi * f_mod * t))
    const amEnvelope = 0.5 * (1.0 + Math.sin(2 * Math.PI * this.modulationFreqHz * timeSec));
    const amModulated = magnitude * amEnvelope;

    return {
      real: sumReal,
      imag: sumImag,
      magnitude,
      amModulated
    };
  }

  /**
   * Computes a 2D cross-section slice of the acoustic field centered around the focal point for visualization.
   */
  public computeFieldSlice(
    center: Vector3,
    sizeMeters: number = 0.12,
    resolution: number = 40,
    plane: 'XY' | 'XZ' = 'XY'
  ): AcousticFieldSlice {
    const half = sizeMeters / 2;
    const step = sizeMeters / resolution;
    const data = new Float32Array(resolution * resolution);
    let maxPressure = 0;

    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const offsetU = -half + i * step;
        const offsetV = -half + j * step;

        const evalPoint: Vector3 = plane === 'XY'
          ? { x: center.x + offsetU, y: center.y + offsetV, z: center.z }
          : { x: center.x + offsetU, y: center.y, z: center.z + offsetV };

        const { magnitude } = this.computePressureAt(evalPoint, 0);
        data[j * resolution + i] = magnitude;
        if (magnitude > maxPressure) maxPressure = magnitude;
      }
    }

    // Normalize pressure slice
    if (maxPressure > 1e-6) {
      for (let k = 0; k < data.length; k++) {
        data[k] /= maxPressure;
      }
    }

    return {
      width: resolution,
      height: resolution,
      resolution: 1 / step,
      pressureData: data,
      peakPressureKPa: maxPressure * 0.05, // Estimated physical kPa
      focalPoint: this.currentFocalPoint || center
    };
  }

  /**
   * Generates a 16-channel discrete phase bitstream map for hardware DMA shift registers (RP2040/STM32)
   */
  public generateHardwarePhaseMap(): { phasesDegrees: number[]; quantizedSteps: number[] } {
    const phasesDegrees: number[] = [];
    const quantizedSteps: number[] = []; // Quantized to 16 steps (22.5 deg resolution for hardware timer)

    for (const elem of this.transducers) {
      const deg = (elem.phaseRad * 180) / Math.PI;
      const step = Math.round((deg / 360) * 16) % 16;
      phasesDegrees.push(deg);
      quantizedSteps.push(step);
    }

    return { phasesDegrees, quantizedSteps };
  }
}
