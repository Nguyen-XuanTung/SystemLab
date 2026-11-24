/**
 * Monotonic virtual simulation clock measured in milliseconds.
 * Never depends on wall-clock time.
 */
export class VirtualClock {
  private currentMs = 0;

  get nowMs(): number {
    return this.currentMs;
  }

  advanceTo(timestampMs: number): number {
    if (!Number.isFinite(timestampMs) || timestampMs < 0) {
      throw new Error(`Invalid virtual timestamp: ${timestampMs}`);
    }
    if (timestampMs + 1e-9 < this.currentMs) {
      throw new Error(
        `Non-monotonic virtual clock transition: ${timestampMs} < ${this.currentMs}`,
      );
    }
    if (timestampMs > this.currentMs) {
      this.currentMs = timestampMs;
    }
    return this.currentMs;
  }

  reset(): void {
    this.currentMs = 0;
  }
}
