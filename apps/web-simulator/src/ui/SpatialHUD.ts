/**
 * VIBE SpatialOS - Spatial HUD Telemetry & State Monitor
 * Updates real-time HUD metrics, gesture Schmitt triggers, and sensor matrices.
 */

import { DecodedSpatialFrameV2 } from '@vibe/spatial-core';

export class SpatialHUD {
  private wsStatusEl: HTMLElement | null;
  private rmsErrorEl: HTMLElement | null;
  private latencyEl: HTMLElement | null;
  private handVelEl: HTMLElement | null;
  private pinchDistEl: HTMLElement | null;
  private pinchFillEl: HTMLElement | null;
  private pinchStateTagEl: HTMLElement | null;
  private entityListContainer: HTMLElement | null;

  // Wearable VIBE Pulse Elements
  private planeLockEl: HTMLElement | null;
  private emgGripEl: HTMLElement | null;
  private wristGestureEl: HTMLElement | null;

  // 8x8 mini grid preview elements for nodes 1..4
  private matrixGrids: Map<number, HTMLElement[]> = new Map();

  constructor() {
    this.wsStatusEl = document.getElementById('val-ws-status');
    this.rmsErrorEl = document.getElementById('val-rms-error');
    this.latencyEl = document.getElementById('stat-latency');
    this.handVelEl = document.getElementById('stat-hand-vel');
    this.pinchDistEl = document.getElementById('txt-pinch-dist');
    this.pinchFillEl = document.getElementById('bar-pinch-fill');
    this.pinchStateTagEl = document.getElementById('tag-pinch-state');
    this.entityListContainer = document.getElementById('entity-list-container');

    this.planeLockEl = document.getElementById('stat-plane-lock');
    this.emgGripEl = document.getElementById('stat-emg-grip');
    this.wristGestureEl = document.getElementById('stat-wrist-gesture');

    this.initializeMatrixPreviews();
  }

  private initializeMatrixPreviews(): void {
    for (let nodeId = 1; nodeId <= 4; nodeId++) {
      const container = document.getElementById(`matrix-n${nodeId}`);
      if (container) {
        container.innerHTML = '';
        const cells: HTMLElement[] = [];
        for (let i = 0; i < 64; i++) {
          const cell = document.createElement('div');
          cell.className = 'matrix-cell';
          container.appendChild(cell);
          cells.push(cell);
        }
        this.matrixGrids.set(nodeId, cells);
      }
    }
  }

  public setGatewayStatus(status: 'CONNECTED (60Hz)' | 'DISCONNECTED' | 'INITIALIZING'): void {
    if (this.wsStatusEl) {
      this.wsStatusEl.innerText = status;
      this.wsStatusEl.style.color = status.startsWith('CONNECTED') ? 'var(--accent-green)' : 'var(--accent-red)';
    }
  }

  public setRMSError(errorMm: number): void {
    if (this.rmsErrorEl) {
      this.rmsErrorEl.innerText = `${errorMm.toFixed(2)} mm RMS`;
      this.rmsErrorEl.style.color = errorMm < 2.5 ? 'var(--accent-green)' : 'var(--accent-orange)';
    }
  }

  public updateLatency(latencyMs: number): void {
    if (this.latencyEl) {
      this.latencyEl.innerText = `${latencyMs.toFixed(1)} ms`;
    }
  }

  public updateHandKinematics(velocityMps: number): void {
    if (this.handVelEl) {
      this.handVelEl.innerText = `${velocityMps.toFixed(2)} m/s`;
    }
  }

  public updateGestureState(pinchDistanceMm: number, isPinching: boolean): void {
    if (this.pinchDistEl) {
      this.pinchDistEl.innerText = `${pinchDistanceMm.toFixed(1)} mm`;
    }

    if (this.pinchFillEl) {
      // Map 0..50mm to 0..100%
      const pct = Math.max(0, Math.min(100, (pinchDistanceMm / 50.0) * 100));
      this.pinchFillEl.style.width = `${pct}%`;
      this.pinchFillEl.style.background = isPinching
        ? 'var(--accent-orange)'
        : 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))';
    }

    if (this.pinchStateTagEl) {
      this.pinchStateTagEl.innerText = isPinching
        ? 'STATE: PINCHING [ACTIVE GRAB]'
        : 'STATE: IDLE [OPEN HAND]';
      this.pinchStateTagEl.style.color = isPinching ? 'var(--accent-orange)' : 'var(--accent-cyan)';
    }
  }

  public updateNodeMatrix(frame: DecodedSpatialFrameV2): void {
    const cells = this.matrixGrids.get(frame.nodeId);
    if (!cells) return;

    for (let i = 0; i < 64; i++) {
      const depth = frame.depthMatrixMm[i] || 500;
      // Map 200..1000mm to cyan/blue intensity
      const normalized = Math.max(0, Math.min(1, (depth - 200) / 800));
      const green = Math.round((1 - normalized) * 200);
      const blue = Math.round(50 + (1 - normalized) * 200);
      if (cells[i]) {
        cells[i].style.backgroundColor = `rgb(0, ${green}, ${blue})`;
      }
    }
  }

  public updateEntitiesList(
    entities: Array<{ id: string; name: string; type: string; isTargeted?: boolean }>
  ): void {
    const container = this.entityListContainer;
    if (!container) return;

    container.innerHTML = '';
    entities.forEach(ent => {
      const item = document.createElement('div');
      item.className = `entity-item ${ent.isTargeted ? 'targeted' : ''}`;
      item.innerHTML = `
        <span class="ent-name">${ent.name}</span>
        <span class="hud-badge">${ent.type}</span>
      `;
      container.appendChild(item);
    });
  }

  public updateWearableHUD(
    planeLock: string,
    emgIntensity: number,
    isSqueezing: boolean,
    lastGesture: string | null
  ): void {
    if (this.planeLockEl) {
      this.planeLockEl.innerText = planeLock.replace('PLANE_', '').replace('_', ' ');
      this.planeLockEl.style.color = planeLock.includes('FREE') ? 'var(--text-muted)' : 'var(--accent-cyan)';
    }

    if (this.emgGripEl) {
      const label = isSqueezing ? 'GRIP ACTIVE (SQUEEZE)' : 'RELAXED';
      this.emgGripEl.innerText = `${label} (${emgIntensity.toFixed(2)})`;
      this.emgGripEl.style.color = isSqueezing ? 'var(--accent-orange)' : 'var(--accent-green)';
    }

    if (this.wristGestureEl && lastGesture) {
      this.wristGestureEl.innerText = lastGesture;
      this.wristGestureEl.style.color = 'var(--accent-orange)';
    }
  }
}

