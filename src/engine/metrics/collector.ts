import type { SimulationEventType } from '../events/types';
import type {
  CircuitState,
  ComponentType,
  EdgeTrafficDelta,
  EventLogEntry,
  EventSeverity,
  GlobalMetrics,
  LogicalRequest,
  NodeMetrics,
  NodeRuntimeStatus,
  RequestTrace,
  TimeSeriesPoint,
} from '../models/types';
import type { SeededRng } from '../random/prng';

export const MAX_EVENT_LOG = 500;
export const MAX_TRACE_HISTORY = 200;
export const MAX_TIME_SERIES_POINTS = 600;
export const MAX_LATENCY_RESERVOIR = 50_000;

export interface NodeMetricInput {
  nodeId: string;
  label: string;
  type: ComponentType;
  status: NodeRuntimeStatus;
  activeRequests: number;
  queueDepth: number;
  effectiveCapacity: number;
  queueCapacity?: number;
  circuitState?: CircuitState;
}

interface NodeAggregate {
  nodeId: string;
  label: string;
  type: ComponentType;
  arrivals: number;
  completions: number;
  maxQueueDepthObserved: number;
  droppedRequests: number;
  failedRequests: number;
  totalServiceTimeMs: number;
  serviceSamples: number;
  totalWaitingTimeMs: number;
  waitingSamples: number;
  // Time-weighted utilization integral
  lastUtilUpdateMs: number;
  lastActiveCount: number;
  lastEffectiveCapacity: number;
  busyWorkerMs: number;
  availableWorkerMs: number;
  // Component-specific
  cacheHits: number;
  cacheMisses: number;
  rateLimitedCount: number;
  dbReads: number;
  dbWrites: number;
  jobsEnqueued: number;
  jobsCompleted: number;
  jobsFailed: number;
  totalJobLatencyMs: number;
  circuitRejections: number;
  routedCounts: Record<string, number>;
}

/**
 * Computes quantile p in [0, 1] using R-7 linear interpolation on a sorted array.
 * Returns null when the sample array is empty so callers never fabricate 0 ms.
 */
export function computeR7Percentile(sorted: readonly number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n === 1) return sorted[0] ?? null;
  const clampedP = Math.max(0, Math.min(1, p));
  const index = clampedP * (n - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? loVal;
  const weight = index - lo;
  return loVal * (1 - weight) + hiVal * weight;
}

export class MetricsCollector {
  private readonly reservoirRng: SeededRng;
  private readonly latencyReservoir: number[] = [];
  private totalLatencySumMs = 0;
  private totalLatencyCount = 0;

  private generated = 0;
  private succeeded = 0;
  private failed = 0;
  private timedOut = 0;
  private processedEvents = 0;

  private readonly nodeAggregates = new Map<string, NodeAggregate>();
  private readonly eventLog: EventLogEntry[] = [];
  private eventSeq = 0;

  private readonly recentTraces: RequestTrace[] = [];
  private readonly edgeDeltas = new Map<
    string,
    { count: number; errorCount: number; cacheHitCount: number }
  >();

  // Time series bucket tracking
  readonly bucketMs: number;
  private readonly timeSeries: TimeSeriesPoint[] = [];
  private prevBucketTimeMs = 0;
  private prevBucketSucceeded = 0;
  private prevBucketFailed = 0;
  private prevBucketTimedOut = 0;
  private bucketLatencies: number[] = [];

  constructor(durationMs: number, rng: SeededRng) {
    this.reservoirRng = rng.fork('metrics-reservoir');
    this.bucketMs = Math.max(250, Math.ceil(Math.max(durationMs, 1000) / 240));
  }

  registerNode(nodeId: string, label: string, type: ComponentType, initialCapacity: number): void {
    this.nodeAggregates.set(nodeId, {
      nodeId,
      label,
      type,
      arrivals: 0,
      completions: 0,
      maxQueueDepthObserved: 0,
      droppedRequests: 0,
      failedRequests: 0,
      totalServiceTimeMs: 0,
      serviceSamples: 0,
      totalWaitingTimeMs: 0,
      waitingSamples: 0,
      lastUtilUpdateMs: 0,
      lastActiveCount: 0,
      lastEffectiveCapacity: Math.max(0, initialCapacity),
      busyWorkerMs: 0,
      availableWorkerMs: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rateLimitedCount: 0,
      dbReads: 0,
      dbWrites: 0,
      jobsEnqueued: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      totalJobLatencyMs: 0,
      circuitRejections: 0,
      routedCounts: {},
    });
  }

  incrementProcessedEvents(): void {
    this.processedEvents += 1;
  }

  getProcessedEventCount(): number {
    return this.processedEvents;
  }

  getInFlightCount(): number {
    return Math.max(0, this.generated - this.succeeded - this.failed - this.timedOut);
  }

  recordGenerated(isBackgroundJob: boolean): void {
    if (!isBackgroundJob) {
      this.generated += 1;
    }
  }

  recordTerminal(request: LogicalRequest, nowMs: number): void {
    if (request.isBackgroundJob) {
      this.archiveTrace(request);
      return;
    }

    if (request.terminalState === 'succeeded') {
      this.succeeded += 1;
      const totalLatency = Math.max(0, nowMs - request.createdAtMs);
      this.totalLatencySumMs += totalLatency;
      this.totalLatencyCount += 1;
      if (this.timeSeries.length < MAX_TIME_SERIES_POINTS) {
        this.bucketLatencies.push(totalLatency);
      }

      if (this.latencyReservoir.length < MAX_LATENCY_RESERVOIR) {
        this.latencyReservoir.push(totalLatency);
      } else {
        // Seeded Algorithm R uniform reservoir sampling on forked RNG
        const replaceIdx = this.reservoirRng.nextInt(0, this.totalLatencyCount - 1);
        if (replaceIdx < MAX_LATENCY_RESERVOIR) {
          this.latencyReservoir[replaceIdx] = totalLatency;
        }
      }
    } else if (request.terminalState === 'failed') {
      this.failed += 1;
    } else if (request.terminalState === 'timed_out') {
      this.timedOut += 1;
    }

    this.archiveTrace(request);
  }

  private archiveTrace(request: LogicalRequest): void {
    const trace: RequestTrace = {
      id: request.id,
      method: request.method,
      createdAtMs: request.createdAtMs,
      completedAtMs: request.completedAtMs,
      totalLatencyMs:
        request.completedAtMs !== null
          ? Math.max(0, request.completedAtMs - request.createdAtMs)
          : null,
      terminalState: request.terminalState ?? 'in_flight',
      errorCategory: request.errorCategory,
      hops: request.hops.map((h) => ({ ...h })),
    };

    if (this.recentTraces.length >= MAX_TRACE_HISTORY) {
      this.recentTraces.shift();
    }
    this.recentTraces.push(trace);
  }

  flushNodeUtilization(
    nodeId: string,
    nowMs: number,
    newActiveCount: number,
    newEffectiveCapacity: number,
  ): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    const dt = Math.max(0, nowMs - agg.lastUtilUpdateMs);
    if (dt > 0) {
      agg.busyWorkerMs += Math.min(agg.lastActiveCount, agg.lastEffectiveCapacity) * dt;
      agg.availableWorkerMs += agg.lastEffectiveCapacity * dt;
      agg.lastUtilUpdateMs = nowMs;
    }
    agg.lastActiveCount = Math.max(0, newActiveCount);
    agg.lastEffectiveCapacity = Math.max(0, newEffectiveCapacity);
  }

  recordArrival(nodeId: string, queueDepth: number): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.arrivals += 1;
    if (queueDepth > agg.maxQueueDepthObserved) {
      agg.maxQueueDepthObserved = queueDepth;
    }
  }

  recordQueueDepth(nodeId: string, queueDepth: number): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    if (queueDepth > agg.maxQueueDepthObserved) {
      agg.maxQueueDepthObserved = queueDepth;
    }
  }

  recordServiceCompletion(nodeId: string, waitingMs: number, serviceMs: number): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.completions += 1;
    agg.totalWaitingTimeMs += Math.max(0, waitingMs);
    agg.waitingSamples += 1;
    agg.totalServiceTimeMs += Math.max(0, serviceMs);
    agg.serviceSamples += 1;
  }

  recordDrop(nodeId: string): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.droppedRequests += 1;
    agg.failedRequests += 1;
  }

  recordNodeFailure(nodeId: string): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.failedRequests += 1;
  }

  recordRateLimited(nodeId: string): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.rateLimitedCount += 1;
    agg.droppedRequests += 1;
    agg.failedRequests += 1;
  }

  recordCacheHit(nodeId: string): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.cacheHits += 1;
  }

  recordCacheMiss(nodeId: string): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.cacheMisses += 1;
  }

  recordDbOp(nodeId: string, method: 'read' | 'write'): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    if (method === 'read') {
      agg.dbReads += 1;
    } else {
      agg.dbWrites += 1;
    }
  }

  recordJobEnqueued(nodeId: string): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.jobsEnqueued += 1;
  }

  recordJobCompleted(mqNodeId: string, workerNodeId: string, jobLatencyMs: number): void {
    const safeLatency = Math.max(0, jobLatencyMs);
    const mqAgg = this.nodeAggregates.get(mqNodeId);
    if (mqAgg) {
      mqAgg.jobsCompleted += 1;
      mqAgg.totalJobLatencyMs += safeLatency;
    }
    const workerAgg = this.nodeAggregates.get(workerNodeId);
    if (workerAgg) {
      workerAgg.jobsCompleted += 1;
      workerAgg.totalJobLatencyMs += safeLatency;
    }
  }

  recordJobFailed(mqNodeId: string, workerNodeId: string): void {
    const mqAgg = this.nodeAggregates.get(mqNodeId);
    if (mqAgg) {
      mqAgg.jobsFailed += 1;
    }
    const workerAgg = this.nodeAggregates.get(workerNodeId);
    if (workerAgg) {
      workerAgg.jobsFailed += 1;
      workerAgg.failedRequests += 1;
    }
  }

  recordCircuitRejection(nodeId: string): void {
    const agg = this.nodeAggregates.get(nodeId);
    if (!agg) return;
    agg.circuitRejections += 1;
    agg.droppedRequests += 1;
    agg.failedRequests += 1;
  }

  recordRoutedTarget(lbNodeId: string, targetNodeId: string): void {
    const agg = this.nodeAggregates.get(lbNodeId);
    if (!agg) return;
    agg.routedCounts[targetNodeId] = (agg.routedCounts[targetNodeId] ?? 0) + 1;
  }

  recordEdgeTraffic(edgeId: string, isError = false, isCacheHit = false): void {
    let entry = this.edgeDeltas.get(edgeId);
    if (!entry) {
      entry = { count: 0, errorCount: 0, cacheHitCount: 0 };
      this.edgeDeltas.set(edgeId, entry);
    }
    entry.count += 1;
    if (isError) entry.errorCount += 1;
    if (isCacheHit) entry.cacheHitCount += 1;
  }

  recordEdgeCacheHit(edgeId: string): void {
    let entry = this.edgeDeltas.get(edgeId);
    if (!entry) {
      entry = { count: 0, errorCount: 0, cacheHitCount: 0 };
      this.edgeDeltas.set(edgeId, entry);
    }
    entry.cacheHitCount += 1;
  }

  logEvent(
    timestampMs: number,
    severity: EventSeverity,
    type: SimulationEventType,
    nodeId: string,
    message: string,
    requestId?: string,
  ): void {
    this.eventSeq += 1;
    const entry: EventLogEntry = {
      id: `evt-${this.eventSeq}`,
      timestampMs,
      severity,
      type,
      nodeId,
      requestId,
      message,
    };
    if (this.eventLog.length >= MAX_EVENT_LOG) {
      this.eventLog.shift();
    }
    this.eventLog.push(entry);
  }

  recordTimeSeriesBucket(nowMs: number, runtimeInputs: readonly NodeMetricInput[]): void {
    if (this.timeSeries.length >= MAX_TIME_SERIES_POINTS) {
      this.bucketLatencies = [];
      return;
    }
    const elapsedMs = Math.max(1, nowMs - this.prevBucketTimeMs);
    const deltaSucceeded = this.succeeded - this.prevBucketSucceeded;
    const deltaFailed = this.failed - this.prevBucketFailed;
    const deltaTimedOut = this.timedOut - this.prevBucketTimedOut;
    const deltaTerminated = deltaSucceeded + deltaFailed + deltaTimedOut;

    const throughputRps = deltaSucceeded / (elapsedMs / 1000);
    const errorRate =
      deltaTerminated > 0 ? ((deltaFailed + deltaTimedOut) / deltaTerminated) * 100 : null;

    let meanLatencyMs: number | null = null;
    let p95LatencyMs: number | null = null;
    if (this.bucketLatencies.length > 0) {
      let sum = 0;
      for (const v of this.bucketLatencies) sum += v;
      meanLatencyMs = sum / this.bucketLatencies.length;
      const sorted = [...this.bucketLatencies].sort((a, b) => a - b);
      p95LatencyMs = computeR7Percentile(sorted, 0.95);
    }

    let totalQueueDepth = 0;
    for (const n of runtimeInputs) {
      totalQueueDepth += n.queueDepth;
    }

    const inFlight = Math.max(0, this.generated - this.succeeded - this.failed - this.timedOut);

    this.timeSeries.push({
      timeMs: nowMs,
      timeSec: Number((nowMs / 1000).toFixed(2)),
      throughputRps: Number(throughputRps.toFixed(2)),
      meanLatencyMs: meanLatencyMs !== null ? Number(meanLatencyMs.toFixed(2)) : null,
      p95LatencyMs: p95LatencyMs !== null ? Number(p95LatencyMs.toFixed(2)) : null,
      errorRate: errorRate !== null ? Number(errorRate.toFixed(2)) : null,
      inFlight,
      totalQueueDepth,
    });

    this.prevBucketTimeMs = nowMs;
    this.prevBucketSucceeded = this.succeeded;
    this.prevBucketFailed = this.failed;
    this.prevBucketTimedOut = this.timedOut;
    this.bucketLatencies = [];
  }

  getGlobalMetrics(nowMs: number): GlobalMetrics {
    const inFlight = Math.max(0, this.generated - this.succeeded - this.failed - this.timedOut);
    const terminated = this.succeeded + this.failed + this.timedOut;
    const elapsedSec = nowMs > 0 ? nowMs / 1000 : 0;
    const throughputRps = elapsedSec > 0 ? this.succeeded / elapsedSec : 0;
    const errorRate = terminated > 0 ? ((this.failed + this.timedOut) / terminated) * 100 : null;

    let meanLatencyMs: number | null = null;
    let p50LatencyMs: number | null = null;
    let p95LatencyMs: number | null = null;
    let p99LatencyMs: number | null = null;

    if (this.totalLatencyCount > 0 && this.latencyReservoir.length > 0) {
      meanLatencyMs = this.totalLatencySumMs / this.totalLatencyCount;
      const sorted = [...this.latencyReservoir].sort((a, b) => a - b);
      p50LatencyMs = computeR7Percentile(sorted, 0.5);
      p95LatencyMs = computeR7Percentile(sorted, 0.95);
      p99LatencyMs = computeR7Percentile(sorted, 0.99);
    }

    return {
      virtualTimeMs: nowMs,
      generated: this.generated,
      succeeded: this.succeeded,
      failed: this.failed,
      timedOut: this.timedOut,
      inFlight,
      throughputRps,
      errorRate,
      meanLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      processedEvents: this.processedEvents,
      sampleCount: this.totalLatencyCount,
    };
  }

  buildNodeMetrics(
    nowMs: number,
    runtimeInputs: readonly NodeMetricInput[],
  ): Record<string, NodeMetrics> {
    const out: Record<string, NodeMetrics> = {};
    for (const rt of runtimeInputs) {
      this.flushNodeUtilization(rt.nodeId, nowMs, rt.activeRequests, rt.effectiveCapacity);
      const agg = this.nodeAggregates.get(rt.nodeId);
      if (!agg) continue;

      let utilization = 0;
      if (agg.type === 'message_queue' && rt.queueCapacity && rt.queueCapacity > 0) {
        utilization = Math.min(1, rt.queueDepth / rt.queueCapacity);
      } else if (agg.availableWorkerMs > 0) {
        utilization = Math.min(1, agg.busyWorkerMs / agg.availableWorkerMs);
      }

      const cacheTotal = agg.cacheHits + agg.cacheMisses;
      const cacheHitRatio = cacheTotal > 0 ? agg.cacheHits / cacheTotal : null;

      out[rt.nodeId] = {
        nodeId: agg.nodeId,
        label: agg.label,
        type: agg.type,
        status: rt.status,
        arrivals: agg.arrivals,
        completions: agg.completions,
        activeRequests: rt.activeRequests,
        queueDepth: rt.queueDepth,
        maxQueueDepthObserved: agg.maxQueueDepthObserved,
        droppedRequests: agg.droppedRequests,
        failedRequests: agg.failedRequests,
        meanServiceTimeMs:
          agg.serviceSamples > 0 ? agg.totalServiceTimeMs / agg.serviceSamples : null,
        meanWaitingTimeMs:
          agg.waitingSamples > 0 ? agg.totalWaitingTimeMs / agg.waitingSamples : null,
        utilization,
        cacheHits: agg.cacheHits,
        cacheMisses: agg.cacheMisses,
        cacheHitRatio,
        rateLimitedCount: agg.rateLimitedCount,
        dbReads: agg.dbReads,
        dbWrites: agg.dbWrites,
        jobsEnqueued: agg.jobsEnqueued,
        jobsCompleted: agg.jobsCompleted,
        jobsFailed: agg.jobsFailed,
        jobMeanLatencyMs: agg.jobsCompleted > 0 ? agg.totalJobLatencyMs / agg.jobsCompleted : null,
        circuitState: rt.circuitState,
        circuitRejections: agg.circuitRejections,
        routedCounts: { ...agg.routedCounts },
      };
    }
    return out;
  }

  getTimeSeries(): TimeSeriesPoint[] {
    return this.timeSeries.map((pt) => ({ ...pt }));
  }

  getEventLog(): EventLogEntry[] {
    return this.eventLog.map((entry) => ({ ...entry }));
  }

  getRecentTraces(): RequestTrace[] {
    return this.recentTraces.map((trace) => ({
      ...trace,
      hops: trace.hops.map((h) => ({ ...h })),
    }));
  }

  drainEdgeDeltas(reset: boolean): EdgeTrafficDelta[] {
    const result: EdgeTrafficDelta[] = [];
    for (const [edgeId, counts] of this.edgeDeltas.entries()) {
      if (counts.count > 0) {
        result.push({ edgeId, ...counts });
      }
    }
    if (reset) {
      this.edgeDeltas.clear();
    }
    return result;
  }
}
