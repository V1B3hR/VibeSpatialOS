/**
 * VIBE SpatialOS - Sensor Circuit Breaker & Fault Tolerance
 * Prevents hardware disconnection or packet loss from stalling the real-time spatial engine.
 * Provides automatic failover to cached/extrapolated spatial predictions.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;  // Consecutive errors before tripping OPEN (default: 5)
  resetTimeoutMs: number;     // Time before attempting recovery probe in HALF_OPEN (default: 1500ms)
  timeoutMs: number;          // Max operation duration before timing out (default: 250ms)
}

export class SensorCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTimeMs: number = 0;
  private lastSuccessTimeMs: number = Date.now();

  constructor(
    public readonly sensorName: string,
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeoutMs: 1500,
      timeoutMs: 250
    }
  ) {}

  public getState(): CircuitState {
    const now = Date.now();
    if (this.state === 'OPEN' && now - this.lastFailureTimeMs > this.config.resetTimeoutMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  public recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastSuccessTimeMs = Date.now();
  }

  public recordFailure(): void {
    this.failureCount++;
    this.lastFailureTimeMs = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Executes a sensor operation with timeout and automatic fallback
   */
  public async execute<T>(
    operation: () => Promise<T>,
    fallback: () => T
  ): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      return fallback();
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Sensor [${this.sensorName}] operation timed out`)), this.config.timeoutMs);
      });

      const result = await Promise.race([operation(), timeoutPromise]);
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      return fallback();
    }
  }

  public getStats(): {
    sensorName: string;
    state: CircuitState;
    failureCount: number;
    lastSuccessAgeMs: number;
  } {
    return {
      sensorName: this.sensorName,
      state: this.getState(),
      failureCount: this.failureCount,
      lastSuccessAgeMs: Date.now() - this.lastSuccessTimeMs
    };
  }
}
