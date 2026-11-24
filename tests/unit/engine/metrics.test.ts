import { describe, expect, it } from 'vitest';
import { computeR7Percentile, MetricsCollector } from '@/engine/metrics/collector';
import { SeededRng } from '@/engine/random/prng';
import type { LogicalRequest } from '@/engine/models/types';

describe('MetricsCollector & R-7 Percentile Calculations', () => {
  it('returns null percentiles when sample size is 0 so UI displays — instead of fake 0 ms', () => {
    expect(computeR7Percentile([], 0.5)).toBeNull();
    expect(computeR7Percentile([42], 0.99)).toBe(42);
    expect(computeR7Percentile([10, 20], 0.5)).toBe(15);
    expect(computeR7Percentile([10, 20, 30, 40, 50], 0.95)).toBeCloseTo(48, 5);

    const collector = new MetricsCollector(10_000, new SeededRng(1));
    const g = collector.getGlobalMetrics(0);
    expect(g.meanLatencyMs).toBeNull();
    expect(g.p50LatencyMs).toBeNull();
    expect(g.p95LatencyMs).toBeNull();
    expect(g.p99LatencyMs).toBeNull();
    expect(g.errorRate).toBeNull();
  });

  it('computes accurate time-weighted utilization across capacity changes', () => {
    const collector = new MetricsCollector(10_000, new SeededRng(1));
    collector.registerNode('srv', 'Server', 'app_server', 2);

    // 0..1000ms: 1/2 busy (0.5)
    collector.flushNodeUtilization('srv', 0, 1, 2);
    // 1000..2000ms: 2/2 busy (1.0)
    collector.flushNodeUtilization('srv', 1000, 2, 2);
    collector.flushNodeUtilization('srv', 2000, 0, 2);

    const out = collector.buildNodeMetrics(2000, [
      {
        nodeId: 'srv',
        label: 'Server',
        type: 'app_server',
        status: 'healthy',
        activeRequests: 0,
        queueDepth: 0,
        effectiveCapacity: 2,
      },
    ]);

    // busyWorkerMs = 1*1000 + 2*1000 = 3000; availableWorkerMs = 2*2000 = 4000 => 0.75
    expect(out.srv!.utilization).toBeCloseTo(0.75, 5);
  });

  it('maintains bounded ring buffers for event log and trace history', () => {
    const collector = new MetricsCollector(10_000, new SeededRng(42));
    for (let i = 0; i < 650; i += 1) {
      collector.logEvent(i, 'info', 'REQUEST_CREATED', 'c', `msg-${i}`);
      const req: LogicalRequest = {
        id: `req-${i}`,
        method: 'read',
        sourceClientId: 'c',
        createdAtMs: i,
        deadlineMs: i + 1000,
        terminalState: 'succeeded',
        completedAtMs: i + 10,
        errorCategory: null,
        hopCount: 1,
        retriesAttemptedOnNode: {},
        circuitBreakerIds: [],
        isBackgroundJob: false,
        hops: [],
      };
      collector.recordGenerated(false);
      collector.recordTerminal(req, i + 10);
    }

    expect(collector.getEventLog()).toHaveLength(500);
    expect(collector.getRecentTraces()).toHaveLength(200);
    expect(collector.getGlobalMetrics(1000).meanLatencyMs).toBe(10);

    // Edge delta drain reset & time-series bucket with errors
    collector.registerNode('mq', 'MQ', 'message_queue', 20);
    collector.recordEdgeTraffic('e1', true, true);
    expect(collector.drainEdgeDeltas(false)).toHaveLength(1);
    expect(collector.drainEdgeDeltas(true)).toHaveLength(1);
    expect(collector.drainEdgeDeltas(false)).toHaveLength(0);

    collector.recordTimeSeriesBucket(500, [
      {
        nodeId: 'mq',
        label: 'MQ',
        type: 'message_queue',
        status: 'healthy',
        activeRequests: 0,
        queueDepth: 10,
        effectiveCapacity: 20,
        queueCapacity: 20,
      },
    ]);
    expect(collector.getTimeSeries()).toHaveLength(1);
    expect(collector.buildNodeMetrics(500, [
      {
        nodeId: 'mq',
        label: 'MQ',
        type: 'message_queue',
        status: 'healthy',
        activeRequests: 0,
        queueDepth: 10,
        effectiveCapacity: 20,
        queueCapacity: 20,
      },
    ]).mq!.utilization).toBeCloseTo(0.5, 5);

    // Reservoir replacement beyond 50,000 succeeded samples + failed & timed_out terminal stats
    const largeCollector = new MetricsCollector(10_000, new SeededRng(9));
    for (let i = 0; i < 60_000; i += 1) {
      largeCollector.recordGenerated(false);
      largeCollector.recordTerminal(
        {
          id: `r-${i}`,
          method: 'read',
          sourceClientId: 'c',
          createdAtMs: 0,
          deadlineMs: 1000,
          terminalState: i % 50 === 0 ? 'failed' : i % 75 === 0 ? 'timed_out' : 'succeeded',
          completedAtMs: 25,
          errorCategory: null,
          hopCount: 1,
          retriesAttemptedOnNode: {},
          circuitBreakerIds: [],
          isBackgroundJob: false,
          hops: [],
        },
        25,
      );
    }
    const largeMetrics = largeCollector.getGlobalMetrics(10_000);
    expect(largeMetrics.sampleCount).toBeGreaterThan(55_000);
    expect(largeMetrics.errorRate).toBeGreaterThan(0);
    expect(largeMetrics.p95LatencyMs).toBe(25);
  });
});
