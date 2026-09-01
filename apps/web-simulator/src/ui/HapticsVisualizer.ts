/**
 * VIBE SpatialOS - Ultrasonic Phased Array Haptics Visualizer
 * Renders real-time 2D acoustic field intensity heatmaps onto HTML5 Canvas.
 */

import { HapticsAMSolver, AcousticFieldSlice } from '@vibe/spatial-core';

export class HapticsVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private peakPressureEl: HTMLElement | null;

  constructor(canvasId: string, peakPressureId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.peakPressureEl = document.getElementById(peakPressureId);
  }

  /**
   * Renders acoustic field intensity slice with color map (Dark Blue -> Cyan -> Yellow -> Intense Red)
   */
  public renderSlice(slice: AcousticFieldSlice, timeSec: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const res = slice.width;

    const imgData = this.ctx.createImageData(w, h);
    const data = imgData.data;

    // 200Hz AM Modulation envelope factor for visualization
    const amFactor = 0.7 + 0.3 * Math.sin(2 * Math.PI * 200 * timeSec);

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        // Map canvas coordinate to slice grid
        const gx = Math.floor((px / w) * res);
        const gy = Math.floor((py / h) * res);
        const idx = gy * res + gx;
        const normalizedPressure = (slice.pressureData[idx] || 0) * amFactor;

        // RGBA index
        const pIdx = (py * w + px) * 4;

        // Color gradient lookup
        const { r, g, b } = this.pressureToColor(normalizedPressure);
        data[pIdx + 0] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
      }
    }

    this.ctx.putImageData(imgData, 0, 0);

    // Draw Transducer array dots (4x4 grid)
    this.ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = 35 + col * 50;
        const cy = 35 + row * 50;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Update telemetry text
    if (this.peakPressureEl) {
      this.peakPressureEl.innerText = `${(slice.peakPressureKPa * amFactor).toFixed(2)} kPa`;
    }
  }

  private pressureToColor(p: number): { r: number; g: number; b: number } {
    const val = Math.max(0, Math.min(1, p));
    if (val < 0.25) {
      // Dark Blue -> Cyan
      const t = val / 0.25;
      return { r: 5, g: Math.round(20 + t * 180), b: Math.round(40 + t * 215) };
    } else if (val < 0.6) {
      // Cyan -> Bright Green/Yellow
      const t = (val - 0.25) / 0.35;
      return { r: Math.round(t * 240), g: 220, b: Math.round((1 - t) * 255) };
    } else if (val < 0.85) {
      // Yellow -> Orange
      const t = (val - 0.6) / 0.25;
      return { r: 255, g: Math.round(220 - t * 120), b: 0 };
    } else {
      // Orange -> Peak Red/White
      const t = (val - 0.85) / 0.15;
      return { r: 255, g: Math.round(100 + t * 155), b: Math.round(t * 255) };
    }
  }
}
