import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '@/engine/core/engine';
import type { ArchitectureGraph, ScheduledFault } from '@/engine/models/types';

describe('Component Library Behavioral Models', () => {
  it('API Gateway enforces Token Bucket burst + sustained rate limiting and Read/Write split', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'client',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 100,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 0.5,
            timeoutMs: 1000,
          },
        },
        {
          id: 'gw',
          label: 'Gateway',
          config: {
            type: 'api_gateway',
            processingLatencyMs: 2,
            rateLimitEnabled: true,
            rateLimitRps: 40,
            burstCapacity: 10,
            routingMode: 'read_write_split',
          },
        },
        {
          id: 'rr',
          label: 'Read Replica',
          config: {
            type: 'read_replica',
            maxConnections: 10,
            queueCapacity: 20,
            readLatencyMs: 10,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
        {
          id: 'db',
          label: 'Primary DB',
          config: {
            type: 'database',
            maxConnections: 10,
            queueCapacity: 20,
            readLatencyMs: 20,
            writeLatencyMs: 40,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e-gw', source: 'client', target: 'gw', latencyMs: 1, routeType: 'default' },
        { id: 'e-read', source: 'gw', target: 'rr', latencyMs: 2, routeType: 'read', label: 'READ' },
        { id: 'e-write', source: 'gw', target: 'db', latencyMs: 2, routeType: 'write', label: 'WRITE' },
      ],
    };

    const snap = new SimulationEngine(graph, { seed: 7, durationMs: 2000 }).runToCompletion();
    expect(snap.global.generated).toBe(200);
    // 10 initial tokens + ~80 refilled over 2s = ~90 accepted, ~110 rejected
    expect(snap.nodeMetrics.gw!.rateLimitedCount).toBeGreaterThan(95);
    expect(snap.nodeMetrics.gw!.rateLimitedCount).toBeLessThan(120);
    expect(snap.global.succeeded).toBeGreaterThan(80);
    expect(snap.global.succeeded).toBeLessThan(95);
    expect(snap.nodeMetrics.rr!.dbReads).toBeGreaterThan(20);
    expect(snap.nodeMetrics.db!.dbWrites).toBeGreaterThan(20);
    expect(snap.nodeMetrics.rr!.failedRequests).toBe(0);
  });

  it('Read Replica rejects misrouted write requests explicitly', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Write Client',
          config: {
            type: 'client',
            ratePerSecond: 5,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 0, // 100% writes!
            timeoutMs: 1000,
          },
        },
        {
          id: 'rr',
          label: 'Read Replica',
          config: {
            type: 'read_replica',
            maxConnections: 5,
            queueCapacity: 10,
            readLatencyMs: 10,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'c', target: 'rr', latencyMs: 1, routeType: 'default' }],
    };

    const snap = new SimulationEngine(graph, { seed: 1, durationMs: 1000 }).runToCompletion();
    expect(snap.global.generated).toBe(5);
    expect(snap.global.failed).toBe(5);
    expect(snap.global.succeeded).toBe(0);
    expect(snap.recentTraces[0]?.errorCategory).toBe('WRITE_TO_READ_REPLICA');
  });

  it('Load Balancer least_in_flight routes more traffic to faster server than slower server', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 50,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 2000,
          },
        },
        {
          id: 'lb',
          label: 'LB',
          config: {
            type: 'load_balancer',
            strategy: 'least_in_flight',
            processingLatencyMs: 1,
            healthCheckEnabled: true,
          },
        },
        {
          id: 'fast',
          label: 'Fast Server',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 50,
            serviceTimeMs: 15,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'slow',
          label: 'Slow Server',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 50,
            serviceTimeMs: 120,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'lb', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'lb', target: 'fast', latencyMs: 1, routeType: 'default' },
        { id: 'e3', source: 'lb', target: 'slow', latencyMs: 1, routeType: 'default' },
      ],
    };

    const snap = new SimulationEngine(graph, { seed: 3, durationMs: 3000 }).runToCompletion();
    const fastCount = snap.nodeMetrics.lb!.routedCounts.fast ?? 0;
    const slowCount = snap.nodeMetrics.lb!.routedCounts.slow ?? 0;
    expect(fastCount).toBeGreaterThan(slowCount * 2);
  });

  it('Message Queue + Worker distinguishes async_ack request latency from background job completion', () => {
    const buildMqGraph = (deliveryMode: 'async_ack' | 'sync_wait'): ArchitectureGraph => ({
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 10,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 0,
            timeoutMs: 2000,
          },
        },
        {
          id: 'mq',
          label: 'Queue',
          config: {
            type: 'message_queue',
            queueCapacity: 100,
            enqueueLatencyMs: 3,
            deliveryMode,
          },
        },
        {
          id: 'w',
          label: 'Worker',
          config: {
            type: 'worker',
            concurrency: 2,
            processingTimeMs: 90,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
        {
          id: 'db',
          label: 'DB',
          config: {
            type: 'database',
            maxConnections: 5,
            queueCapacity: 20,
            readLatencyMs: 10,
            writeLatencyMs: 20,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'mq', latencyMs: 2, routeType: 'default' },
        { id: 'e2', source: 'mq', target: 'w', latencyMs: 2, routeType: 'default' },
        { id: 'e3', source: 'w', target: 'db', latencyMs: 3, routeType: 'default' },
      ],
    });

    const asyncSnap = new SimulationEngine(buildMqGraph('async_ack'), {
      seed: 11,
      durationMs: 2000,
    }).runToCompletion();
    expect(asyncSnap.global.generated).toBe(20);
    expect(asyncSnap.global.succeeded).toBe(20);
    // Async HTTP latency = edge(2) + enqueue(3) = 5 ms!
    expect(asyncSnap.global.meanLatencyMs).toBe(5);
    expect(asyncSnap.nodeMetrics.mq!.jobsEnqueued).toBe(20);
    expect(asyncSnap.nodeMetrics.mq!.jobsCompleted).toBe(20);
    // DB still saw 20 background writes without inflating HTTP generated/succeeded
    expect(asyncSnap.nodeMetrics.db!.dbWrites).toBe(20);

    const syncSnap = new SimulationEngine(buildMqGraph('sync_wait'), {
      seed: 11,
      durationMs: 2000,
    }).runToCompletion();
    expect(syncSnap.global.generated).toBe(20);
    expect(syncSnap.global.succeeded).toBe(20);
    // Sync wait waits for worker(2+90) + db edge(3) + db(20) = 120ms total!
    expect(syncSnap.global.meanLatencyMs).toBe(120);
  });

  it('Circuit Breaker transitions CLOSED -> OPEN -> HALF-OPEN -> CLOSED on downstream failure & recovery', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 10,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 'cb',
          label: 'Circuit Breaker',
          config: {
            type: 'circuit_breaker',
            failureThreshold: 3,
            openDurationMs: 1200,
            halfOpenMaxProbes: 2,
            processingLatencyMs: 1,
          },
        },
        {
          id: 'db',
          label: 'Database',
          config: {
            type: 'database',
            maxConnections: 5,
            queueCapacity: 10,
            readLatencyMs: 10,
            writeLatencyMs: 20,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'cb', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'cb', target: 'db', latencyMs: 1, routeType: 'default' },
      ],
    };

    const faults: ScheduledFault[] = [
      {
        id: 'db-down',
        type: 'node_failure',
        targetId: 'db',
        startAtMs: 500,
        durationMs: 2000, // down [500, 2500)
        value: 1,
      },
    ];

    const snap = new SimulationEngine(graph, { seed: 1, durationMs: 4500 }, faults).runToCompletion();
    const events = snap.eventLog.map((e) => e.type);

    expect(events).toContain('CIRCUIT_OPENED');
    expect(events).toContain('CIRCUIT_HALF_OPEN');
    expect(events).toContain('CIRCUIT_CLOSED');
    expect(snap.nodeMetrics.cb!.circuitRejections).toBeGreaterThan(0);
    expect(snap.nodeMetrics.cb!.circuitState).toBe('closed');
  });

  it('App Server bounded retries recover transient failures without inflating logical generated count', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 10,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 2000,
          },
        },
        {
          id: 'app',
          label: 'App',
          config: {
            type: 'app_server',
            concurrency: 4,
            queueCapacity: 20,
            serviceTimeMs: 20,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0.4,
            maxRetries: 3,
            retryDelayMs: 15,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'c', target: 'app', latencyMs: 1, routeType: 'default' }],
    };

    const snap = new SimulationEngine(graph, { seed: 42, durationMs: 5000 }).runToCompletion();
    expect(snap.global.generated).toBe(50);
    expect(snap.global.generated).toBe(
      snap.global.succeeded + snap.global.failed + snap.global.timedOut + snap.global.inFlight,
    );
    // With 0.4 per-attempt failure and up to 4 total tries, failure rate drops near 0.4^4 = 2.56%!
    expect(snap.global.succeeded).toBeGreaterThan(45);
  });

  it('supports bursty, ramp, and step client workload patterns', () => {
    const makeClientGraph = (workloadPattern: 'bursty' | 'ramp' | 'step'): ArchitectureGraph => ({
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 10,
            workloadPattern,
            burstMultiplier: 3,
            burstDurationMs: 1000,
            burstPeriodMs: 3000,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 's',
          label: 'Srv',
          config: {
            type: 'app_server',
            concurrency: 10,
            queueCapacity: 20,
            serviceTimeMs: 10,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'c', target: 's', latencyMs: 1, routeType: 'default' }],
    });

    const burstSnap = new SimulationEngine(makeClientGraph('bursty'), { seed: 1, durationMs: 6000 }).runToCompletion();
    // Base 10 RPS * 4s + Burst 30 RPS * 2s = ~100 requests
    expect(burstSnap.global.generated).toBeGreaterThan(85);

    const rampSnap = new SimulationEngine(makeClientGraph('ramp'), { seed: 1, durationMs: 6000 }).runToCompletion();
    // Average ramp rate ~0.625 * 10 = ~38 requests over 6s
    expect(rampSnap.global.generated).toBeGreaterThan(25);
    expect(rampSnap.global.generated).toBeLessThan(55);

    const stepSnap = new SimulationEngine(makeClientGraph('step'), { seed: 1, durationMs: 6000 }).runToCompletion();
    // 10 RPS for 3s (30) + 30 RPS for 3s (90) = ~120
    expect(stepSnap.global.generated).toBeGreaterThan(105);
  });

  it('supports random LB routing, healthCheckEnabled=false, write-through cache, and CB half-open re-tripping', () => {
    // Random LB + healthCheckEnabled=false sends traffic to failed node
    const lbGraph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 20,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 0.5,
            timeoutMs: 1000,
          },
        },
        {
          id: 'lb',
          label: 'LB',
          config: {
            type: 'load_balancer',
            strategy: 'random',
            processingLatencyMs: 1,
            healthCheckEnabled: false,
          },
        },
        {
          id: 'cache',
          label: 'Cache WT',
          config: {
            type: 'cache',
            lookupLatencyMs: 2,
            hitProbability: 0.5,
            writePolicy: 'write_through',
            coldStartWarmupMs: 0,
          },
        },
        {
          id: 'db',
          label: 'DB',
          config: {
            type: 'database',
            maxConnections: 5,
            queueCapacity: 20,
            readLatencyMs: 10,
            writeLatencyMs: 20,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'lb', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'lb', target: 'cache', latencyMs: 1, routeType: 'default' },
        { id: 'e3', source: 'cache', target: 'db', latencyMs: 1, routeType: 'default' },
      ],
    };

    const snap = new SimulationEngine(lbGraph, { seed: 5, durationMs: 2000 }, [
      { id: 'f-db', type: 'node_failure', targetId: 'db', startAtMs: 500, durationMs: 500, value: 1 },
    ]).runToCompletion();
    expect(snap.global.generated).toBe(40);
    expect(snap.nodeMetrics.cache!.cacheHits).toBeGreaterThan(0);
    expect(snap.nodeMetrics.db!.dbWrites).toBeGreaterThan(0);

    // CB half-open re-trips when downstream is still dead
    const cbGraph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 10,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 'cb',
          label: 'CB',
          config: {
            type: 'circuit_breaker',
            failureThreshold: 2,
            openDurationMs: 500,
            halfOpenMaxProbes: 1,
            processingLatencyMs: 1,
          },
        },
        {
          id: 'db',
          label: 'DB',
          config: {
            type: 'database',
            maxConnections: 2,
            queueCapacity: 10,
            readLatencyMs: 10,
            writeLatencyMs: 20,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 1,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'cb', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'cb', target: 'db', latencyMs: 1, routeType: 'default' },
      ],
    };
    const cbSnap = new SimulationEngine(cbGraph, { seed: 2, durationMs: 3000 }).runToCompletion();
    const openedCount = cbSnap.eventLog.filter((e) => e.type === 'CIRCUIT_OPENED').length;
    expect(openedCount).toBeGreaterThanOrEqual(2);

    // Message queue capacity overflow & worker failure + queued request timeout cleanup
    const mqOverflowGraph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 100,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 0,
            timeoutMs: 150,
          },
        },
        {
          id: 'mq',
          label: 'Tiny MQ',
          config: { type: 'message_queue', queueCapacity: 5, enqueueLatencyMs: 2, deliveryMode: 'async_ack' },
        },
        {
          id: 'w',
          label: 'Slow Worker',
          config: {
            type: 'worker',
            concurrency: 1,
            processingTimeMs: 500,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0.2,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'mq', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'mq', target: 'w', latencyMs: 1, routeType: 'default' },
      ],
    };
    const mqOverflowSnap = new SimulationEngine(mqOverflowGraph, { seed: 4, durationMs: 2000 }).runToCompletion();
    expect(mqOverflowSnap.nodeMetrics.mq!.droppedRequests).toBeGreaterThan(50);

    // sync_wait worker crash mid-job fails linked request & stops cleanly when drainOnEnd is false
    const syncCrashGraph: ArchitectureGraph = {
      nodes: [
        mqOverflowGraph.nodes[0]!,
        {
          id: 'mq',
          label: 'Sync MQ',
          config: { type: 'message_queue', queueCapacity: 50, enqueueLatencyMs: 2, deliveryMode: 'sync_wait' },
        },
        {
          id: 'w',
          label: 'Crash Worker',
          config: {
            type: 'worker',
            concurrency: 2,
            processingTimeMs: 400,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: mqOverflowGraph.edges,
    };
    const syncEngine = new SimulationEngine(
      syncCrashGraph,
      { seed: 2, durationMs: 1000, drainOnEnd: false },
      [{ id: 'w-crash', type: 'node_failure', targetId: 'w', startAtMs: 200, durationMs: 400, value: 1 }],
    );
    while (syncEngine.step()) {
      // step event-by-event
    }
    const syncSnap = syncEngine.getSnapshot(false);
    expect(syncSnap.status).toBe('completed');
    expect(syncSnap.global.failed).toBeGreaterThan(0);
    expect(syncSnap.global.generated).toBe(
      syncSnap.global.succeeded +
        syncSnap.global.failed +
        syncSnap.global.timedOut +
        syncSnap.global.inFlight,
    );
  });
});
