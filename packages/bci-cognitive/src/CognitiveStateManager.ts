/**
 * VIBE SpatialOS - Cognitive State Manager & Auto-LOD Engine
 * Evaluates real-time focus, stress, and cognitive load from GCS-v7
 * to dynamically optimize CAD rendering complexity and spatial UI presentation.
 */

import { CognitiveAffectiveState, AutoLODSuggestion } from './GCSBridgeTypes.js';

export class CognitiveStateManager {
  private smoothedFocus: number = 0.70;
  private smoothedStress: number = 0.20;
  private smoothedLoad: number = 0.35;
  private emotionalValence: number = 0.50;
  private lastUpdateTimestampMs: number = Date.now();
  private readonly emaAlpha: number = 0.25; // Exponential Moving Average smoothing factor

  constructor() {}

  /**
   * Ingests a new affective state frame from GCS-v7
   */
  public updateState(state: Partial<CognitiveAffectiveState>, immediate: boolean = false): CognitiveAffectiveState {
    const alpha = immediate ? 1.0 : this.emaAlpha;
    if (state.focusIndex !== undefined) {
      this.smoothedFocus = this.smoothedFocus * (1 - alpha) + state.focusIndex * alpha;
    }
    if (state.stressLevel !== undefined) {
      this.smoothedStress = this.smoothedStress * (1 - alpha) + state.stressLevel * alpha;
    }
    if (state.cognitiveLoad !== undefined) {
      this.smoothedLoad = this.smoothedLoad * (1 - alpha) + state.cognitiveLoad * alpha;
    }
    if (state.emotionalValence !== undefined) {
      this.emotionalValence = state.emotionalValence;
    }

    this.lastUpdateTimestampMs = Date.now();

    const isOverloaded = this.smoothedLoad > 0.78 || this.smoothedStress > 0.75;
    let suggestedLOD: AutoLODSuggestion = 'NORMAL_LOD';

    if (isOverloaded) {
      suggestedLOD = 'REDUCE_COMPLEXITY';
    } else if (this.smoothedFocus > 0.82 && this.smoothedStress < 0.45) {
      suggestedLOD = 'MAX_PRECISION';
    }

    return {
      focusIndex: this.smoothedFocus,
      stressLevel: this.smoothedStress,
      cognitiveLoad: this.smoothedLoad,
      emotionalValence: this.emotionalValence,
      isCognitiveOverload: isOverloaded,
      suggestedLOD,
      timestampMs: this.lastUpdateTimestampMs
    };
  }

  public getCurrentState(): CognitiveAffectiveState {
    const isOverloaded = this.smoothedLoad > 0.78 || this.smoothedStress > 0.75;
    let suggestedLOD: AutoLODSuggestion = 'NORMAL_LOD';

    if (isOverloaded) {
      suggestedLOD = 'REDUCE_COMPLEXITY';
    } else if (this.smoothedFocus > 0.82 && this.smoothedStress < 0.45) {
      suggestedLOD = 'MAX_PRECISION';
    }

    return {
      focusIndex: this.smoothedFocus,
      stressLevel: this.smoothedStress,
      cognitiveLoad: this.smoothedLoad,
      emotionalValence: this.emotionalValence,
      isCognitiveOverload: isOverloaded,
      suggestedLOD,
      timestampMs: this.lastUpdateTimestampMs
    };
  }

  public getFocusQuality(): 'DISTRACTED' | 'NORMAL' | 'DEEP_FLOW' {
    if (this.smoothedFocus > 0.82) return 'DEEP_FLOW';
    if (this.smoothedFocus < 0.40) return 'DISTRACTED';
    return 'NORMAL';
  }
}
