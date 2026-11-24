import type { ActiveFault, ScheduledFault } from '../models/types';

export class FaultManager {
  private readonly activeFaults = new Map<string, ActiveFault>();
  private readonly faultTimeline: ScheduledFault[] = [];
  private readonly timelineIndexById = new Map<string, number>();

  constructor(scheduledFaults: readonly ScheduledFault[]) {
    for (const fault of scheduledFaults) {
      const copy: ScheduledFault = { ...fault };
      this.timelineIndexById.set(copy.id, this.faultTimeline.length);
      this.faultTimeline.push(copy);
    }
  }

  activateFault(fault: ActiveFault): void {
    this.activeFaults.set(fault.id, { ...fault });
    if (!this.timelineIndexById.has(fault.id)) {
      const durationMs =
        fault.expiresAtMs !== null ? Math.max(0, fault.expiresAtMs - fault.activatedAtMs) : null;
      const entry: ScheduledFault = {
        id: fault.id,
        type: fault.type,
        targetId: fault.targetId,
        startAtMs: fault.activatedAtMs,
        durationMs,
        value: fault.value,
        label: fault.label,
      };
      this.timelineIndexById.set(entry.id, this.faultTimeline.length);
      this.faultTimeline.push(entry);
    }
  }

  expireFault(faultId: string, nowMs: number): ActiveFault | undefined {
    const existing = this.activeFaults.get(faultId);
    if (!existing) return undefined;
    this.activeFaults.delete(faultId);

    const timelineIdx = this.timelineIndexById.get(faultId);
    if (timelineIdx !== undefined) {
      const entry = this.faultTimeline[timelineIdx];
      if (entry && entry.durationMs === null) {
        entry.durationMs = Math.max(0, nowMs - entry.startAtMs);
      }
    }
    return existing;
  }

  hasFault(faultId: string): boolean {
    return this.activeFaults.has(faultId);
  }

  isNodeFailed(nodeId: string): boolean {
    for (const f of this.activeFaults.values()) {
      if (f.type === 'node_failure' && f.targetId === nodeId) {
        return true;
      }
    }
    return false;
  }

  isEdgeFailed(edgeId: string): boolean {
    for (const f of this.activeFaults.values()) {
      if (f.type === 'edge_failure' && f.targetId === edgeId) {
        return true;
      }
    }
    return false;
  }

  getNodeLatencyDeltaMs(nodeId: string): number {
    let delta = 0;
    for (const f of this.activeFaults.values()) {
      if (f.type === 'latency_spike' && f.targetId === nodeId) {
        delta += Math.max(0, f.value);
      }
    }
    return delta;
  }

  getEdgeLatencyDeltaMs(edgeId: string): number {
    let delta = 0;
    for (const f of this.activeFaults.values()) {
      if (f.type === 'edge_latency_spike' && f.targetId === edgeId) {
        delta += Math.max(0, f.value);
      }
    }
    return delta;
  }

  getCapacityMultiplier(nodeId: string): number {
    if (this.isNodeFailed(nodeId)) return 0;
    let multiplier = 1;
    for (const f of this.activeFaults.values()) {
      if (f.type === 'capacity_drop' && f.targetId === nodeId) {
        multiplier *= Math.max(0, Math.min(1, f.value));
      }
    }
    return multiplier;
  }

  getTrafficMultiplier(clientNodeId: string): number {
    let multiplier = 1;
    for (const f of this.activeFaults.values()) {
      if (f.type === 'traffic_spike' && (f.targetId === clientNodeId || f.targetId === '*')) {
        multiplier *= Math.max(0.1, Math.min(50, f.value));
      }
    }
    return multiplier;
  }

  getExtraDropProbability(nodeId: string): number {
    let survivalProb = 1;
    for (const f of this.activeFaults.values()) {
      if (f.type === 'packet_drop' && f.targetId === nodeId) {
        const p = Math.max(0, Math.min(1, f.value));
        survivalProb *= 1 - p;
      }
    }
    return 1 - survivalProb;
  }

  /**
   * Probabilistic cache cold start curve:
   * Immediately drops hit probability to 0% upon fault activation and recovers
   * linearly over warmupMs (or stays at 0% if warmupMs === 0 while fault is active).
   */
  getEffectiveCacheHitRatio(
    nodeId: string,
    baseHitProbability: number,
    warmupMs: number,
    nowMs: number,
  ): number {
    let ratio = Math.max(0, Math.min(1, baseHitProbability));
    for (const f of this.activeFaults.values()) {
      if (f.type === 'cache_cold_start' && f.targetId === nodeId) {
        if (warmupMs <= 0) {
          return 0;
        }
        const elapsed = Math.max(0, nowMs - f.activatedAtMs);
        const factor = Math.min(1, elapsed / warmupMs);
        ratio = Math.min(ratio, baseHitProbability * factor);
      }
    }
    return ratio;
  }

  getActiveFaults(): ActiveFault[] {
    return Array.from(this.activeFaults.values()).map((f) => ({ ...f }));
  }

  getFaultTimeline(): ScheduledFault[] {
    return this.faultTimeline.map((f) => ({ ...f }));
  }
}
