import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '@/engine/core/engine';
import { MAX_TIME_SERIES_POINTS, MetricsCollector } from '@/engine/metrics/collector';
import type {
  ArchitectureGraph,
  LogicalRequest,
  ScheduledFault,
  SimulationSnapshot,
} from '@/engine/models/types';
import { SeededRng } from '@/engine/random/prng';
import { validateGraph } from '@/engine/validation/validator';

function assertSnapshotInvariants(snap: SimulationSnapshot): void {
  const { generated, succeeded, failed, timedOut, inFlight } = snap.global;
  expect(generated).toBe(succeeded + failed + timedOut + inFlight);
  expect(inFlight).toBeGreaterThanOrEqual(0);
  expect(generated).toBeGreaterThanOrEqual(0);

  for (const nm of Object.values(snap.nodeMetrics)) {
    expect(nm.activeRequests).toBeGreaterThanOrEqual(0);
    expect(nm.queueDepth).toBeGreaterThanOrEqual(0);
    expect(nm.maxQueueDepthObserved).toBeGreaterThanOrEqual(nm.queueDepth);
    expect(nm.utilization).toBeGreaterThanOrEqual(0);
    expect(nm.utilization).toBeLessThanOrEqual(1);
    expect(Number.isFinite(nm.utilization)).toBe(true);
  }

  for (let i = 1; i < snap.eventLog.length; i += 1) {
    expect(snap.eventLog[i]!.timestampMs).toBeGreaterThanOrEqual(
      snap.eventLog[i - 1]!.timestampMs - 1e-9,
    );
  }
}

function makeFullComplexTopology(): { graph: ArchitectureGraph; faults: ScheduledFault[] } {
  const graph: ArchitectureGraph = {
    nodes: [
      {
        id: 'c',
        label: 'Client',
        config: {
          type: 'client',
          ratePerSecond: 60,
          workloadPattern: 'poisson',
          burstMultiplier: 2.5,
          burstDurationMs: 600,
          burstPeriodMs: 1800,
          readRatio: 0.7,
          timeoutMs: 400,
        },
      },
      {
        id: 'gw',
        label: 'Gateway',
        config: {
          type: 'api_gateway',
          processingLatencyMs: 2,
          rateLimitEnabled: true,
          rateLimitRps: 55,
          burstCapacity: 15,
          routingMode: 'read_write_split',
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
        id: 'cb',
        label: 'CB',
        config: {
          type: 'circuit_breaker',
          failureThreshold: 3,
          openDurationMs: 600,
          halfOpenMaxProbes: 2,
          processingLatencyMs: 1,
        },
      },
      {
        id: 'app',
        label: 'App',
        config: {
          type: 'app_server',
          concurrency: 3,
          queueCapacity: 8,
          serviceTimeMs: 25,
          distribution: 'lognormal',
          cv: 0.5,
          failureProbability: 0.08,
          maxRetries: 2,
          retryDelayMs: 15,
        },
      },
      {
        id: 'cache',
        label: 'Cache',
        config: {
          type: 'cache',
          lookupLatencyMs: 2,
          hitProbability: 0.6,
          writePolicy: 'write_through',
          coldStartWarmupMs: 1500,
        },
      },
      {
        id: 'rr',
        label: 'Read Replica',
        config: {
          type: 'read_replica',
          maxConnections: 4,
          queueCapacity: 12,
          readLatencyMs: 15,
          distribution: 'exponential',
          cv: 0.4,
          failureProbability: 0.02,
        },
      },
      {
        id: 'mq',
        label: 'MQ',
        config: {
          type: 'message_queue',
          queueCapacity: 30,
          enqueueLatencyMs: 3,
          deliveryMode: 'async_ack',
        },
      },
      {
        id: 'w',
        label: 'Worker',
        config: {
          type: 'worker',
          concurrency: 2,
          processingTimeMs: 40,
          distribution: 'fixed',
          cv: 0.4,
          failureProbability: 0.05,
        },
      },
      {
        id: 'db',
        label: 'DB',
        config: {
          type: 'database',
          maxConnections: 3,
          queueCapacity: 12,
          readLatencyMs: 20,
          writeLatencyMs: 30,
          distribution: 'exponential',
          cv: 0.4,
          failureProbability: 0.02,
        },
      },
    ],
    edges: [
      { id: 'e-c-gw', source: 'c', target: 'gw', latencyMs: 2, routeType: 'default' },
      { id: 'e-gw-r', source: 'gw', target: 'lb', latencyMs: 1, routeType: 'read' },
      { id: 'e-gw-w', source: 'gw', target: 'mq', latencyMs: 2, routeType: 'write' },
      { id: 'e-lb-cb', source: 'lb', target: 'cb', latencyMs: 1, routeType: 'default' },
      { id: 'e-cb-app', source: 'cb', target: 'app', latencyMs: 1, routeType: 'default' },
      { id: 'e-app-cache', source: 'app', target: 'cache', latencyMs: 1, routeType: 'default' },
      { id: 'e-cache-rr', source: 'cache', target: 'rr', latencyMs: 2, routeType: 'default' },
      { id: 'e-mq-w', source: 'mq', target: 'w', latencyMs: 2, routeType: 'default' },
      { id: 'e-w-db', source: 'w', target: 'db', latencyMs: 2, routeType: 'default' },
    ],
  };

  const faults: ScheduledFault[] = [
    {
      id: 'f1',
      type: 'node_failure',
      targetId: 'rr',
      startAtMs: 1000,
      durationMs: 1200,
      value: 1,
    },
    {
      id: 'f2',
      type: 'capacity_drop',
      targetId: 'app',
      startAtMs: 1500,
      durationMs: 1500,
      value: 0.5,
    },
    {
      id: 'f3',
      type: 'cache_cold_start',
      targetId: 'cache',
      startAtMs: 2000,
      durationMs: 1500,
      value: 1,
    },
    {
      id: 'f4',
      type: 'traffic_spike',
      targetId: 'c',
      startAtMs: 2500,
      durationMs: 1000,
      value: 2.5,
    },
  ];
  return { graph, faults };
}

describe('Engine Multi-Seed Invariants & Regression Suite', () => {
  it('preserves strict determinism, conservation, and bounds across 10 diverse seeds', () => {
    const seeds = [0, 1, 7, 13, 99, 256, 1337, 9001, 65535, 2147483647];
    const { graph, faults } = makeFullComplexTopology();

    for (const seed of seeds) {
      const headless = new SimulationEngine(
        graph,
        { seed, durationMs: 4500, drainOnEnd: true, maxDrainMs: 5000 },
        faults,
      ).runToCompletion();

      assertSnapshotInvariants(headless);
      expect(headless.global.generated).toBeGreaterThan(100);
      expect(headless.global.inFlight).toBe(0);

      // Sliced execution (simulates UI pacing) must match bit-for-bit
      const slicedEngine = new SimulationEngine(
        graph,
        { seed, durationMs: 4500, drainOnEnd: true, maxDrainMs: 5000 },
        faults,
      );
      for (let t = 40; t <= 12000; t += 40) {
        const res = slicedEngine.runUntil(t, 15);
        if (res.status === 'completed') break;
      }
      const sliced = slicedEngine.getSnapshot(false);
      expect(sliced.global).toEqual(headless.global);
      expect(sliced.nodeMetrics).toEqual(headless.nodeMetrics);
      expect(sliced.timeSeries).toEqual(headless.timeSeries);
    }
  });

  it('prevents stale pre-outage requests from corrupting a later HALF-OPEN circuit breaker cycle', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 10, // arrivals: 0, 100, 200, 300, ...
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 2000,
          },
        },
        {
          id: 'cb',
          label: 'CB',
          config: {
            type: 'circuit_breaker',
            failureThreshold: 2,
            openDurationMs: 250,
            halfOpenMaxProbes: 1,
            processingLatencyMs: 0,
          },
        },
        {
          id: 'db',
          label: 'DB',
          config: {
            type: 'database',
            maxConnections: 10,
            queueCapacity: 20,
            readLatencyMs: 50,
            writeLatencyMs: 50,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'cb', latencyMs: 0, routeType: 'default' },
        { id: 'e2', source: 'cb', target: 'db', latencyMs: 0, routeType: 'default' },
      ],
    };

    // Latency spike on DB makes t=0 request take 500ms (resolves at t=500ms while CB is HALF_OPEN!).
    // Meanwhile requests at t=100, 200 hit failed DB during [90, 220) and trip CB OPEN at t=200ms until t=450ms.
    // At t=450ms CB becomes HALF_OPEN; DB is STILL failed via second outage [400, 900).
    // Stale t=0 success at t=500ms MUST NOT close the circuit!
    const faults: ScheduledFault[] = [
      {
        id: 'slow-first',
        type: 'latency_spike',
        targetId: 'db',
        startAtMs: 0,
        durationMs: 50,
        value: 450,
      },
      {
        id: 'down-trip',
        type: 'node_failure',
        targetId: 'db',
        startAtMs: 90,
        durationMs: 130,
        value: 1,
      },
      {
        id: 'down-probe',
        type: 'node_failure',
        targetId: 'db',
        startAtMs: 440,
        durationMs: 600,
        value: 1,
      },
    ];

    const engine = new SimulationEngine(
      graph,
      { seed: 1, durationMs: 600, drainOnEnd: true },
      faults,
    );
    engine.runUntil(520);
    const snapAt520 = engine.getSnapshot(false);
    // At t=500 stale request from t=0 completed, so CB must NOT have transitioned to CLOSED
    expect(snapAt520.nodeMetrics.cb?.circuitState).not.toBe('closed');
  });

  it('notifies upstream CB1 when downstream CB2 rejects with CIRCUIT_OPEN (chained CB isolation)', () => {
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
          id: 'cb1',
          label: 'CB1',
          config: {
            type: 'circuit_breaker',
            failureThreshold: 1,
            openDurationMs: 300,
            halfOpenMaxProbes: 1,
            processingLatencyMs: 0,
          },
        },
        {
          id: 'cb2',
          label: 'CB2',
          config: {
            type: 'circuit_breaker',
            failureThreshold: 1,
            openDurationMs: 1500,
            halfOpenMaxProbes: 1,
            processingLatencyMs: 0,
          },
        },
        {
          id: 'db',
          label: 'DB',
          config: {
            type: 'database',
            maxConnections: 4,
            queueCapacity: 10,
            readLatencyMs: 10,
            writeLatencyMs: 10,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 1,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'cb1', latencyMs: 0, routeType: 'default' },
        { id: 'e2', source: 'cb1', target: 'cb2', latencyMs: 0, routeType: 'default' },
        { id: 'e3', source: 'cb2', target: 'db', latencyMs: 0, routeType: 'default' },
      ],
    };

    const snap = new SimulationEngine(graph, { seed: 1, durationMs: 1000 }).runToCompletion();
    assertSnapshotInvariants(snap);
    // CB1 must have re-opened when CB2 rejected CB1's half-open probe at t=300+ms
    const cb1OpenEvents = snap.eventLog.filter(
      (e) => e.nodeId === 'cb1' && e.type === 'CIRCUIT_OPENED',
    );
    expect(cb1OpenEvents.length).toBeGreaterThanOrEqual(2);
    expect(snap.nodeMetrics.cb1?.circuitRejections).toBeGreaterThan(0);
  });

  it('aborts in-flight cache hits and message_queue sync_wait requests on node_failure without stale completions', () => {
    const cacheGraph: ArchitectureGraph = {
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
          id: 'cache',
          label: 'Cache',
          config: {
            type: 'cache',
            lookupLatencyMs: 100,
            hitProbability: 1,
            writePolicy: 'bypass',
            coldStartWarmupMs: 0,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'c', target: 'cache', latencyMs: 0, routeType: 'default' }],
    };

    // Request arrives at t=0 (would finish at t=100), cache crashes at t=50 for 200ms
    const cacheSnap = new SimulationEngine(cacheGraph, { seed: 1, durationMs: 500 }, [
      {
        id: 'f-cache',
        type: 'node_failure',
        targetId: 'cache',
        startAtMs: 50,
        durationMs: 200,
        value: 1,
      },
    ]).runToCompletion();
    assertSnapshotInvariants(cacheSnap);
    // Arrivals at 0 (killed in-flight at 50), 100 (rejected), 200 (rejected), 300 (succeeds), 400 (succeeds)
    expect(cacheSnap.global.generated).toBe(5);
    expect(cacheSnap.global.failed).toBe(3);
    expect(cacheSnap.global.succeeded).toBe(2);

    // Message Queue node_failure clears queued sync_wait requests and invalidated stale JOB_ENQUEUED
    const mqGraph: ArchitectureGraph = {
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
          label: 'MQ',
          config: {
            type: 'message_queue',
            queueCapacity: 10,
            enqueueLatencyMs: 50,
            deliveryMode: 'sync_wait',
          },
        },
        {
          id: 'w',
          label: 'Worker',
          config: {
            type: 'worker',
            concurrency: 1,
            processingTimeMs: 300,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'mq', latencyMs: 0, routeType: 'default' },
        { id: 'e2', source: 'mq', target: 'w', latencyMs: 0, routeType: 'default' },
      ],
    };

    const mqSnap = new SimulationEngine(mqGraph, { seed: 1, durationMs: 600 }, [
      {
        id: 'f-mq',
        type: 'node_failure',
        targetId: 'mq',
        startAtMs: 180,
        durationMs: 150,
        value: 1,
      },
    ]).runToCompletion();
    assertSnapshotInvariants(mqSnap);
    expect(mqSnap.global.failed).toBeGreaterThanOrEqual(2);
    expect(mqSnap.global.inFlight).toBe(0);
  });

  it('drains buffered message_queue jobs when edge_failure recovers and reports real worker jobMeanLatencyMs', () => {
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
            readRatio: 0,
            timeoutMs: 1000,
          },
        },
        {
          id: 'mq',
          label: 'MQ',
          config: {
            type: 'message_queue',
            queueCapacity: 20,
            enqueueLatencyMs: 2,
            deliveryMode: 'async_ack',
          },
        },
        {
          id: 'w',
          label: 'Worker',
          config: {
            type: 'worker',
            concurrency: 2,
            processingTimeMs: 30,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e-c-mq', source: 'c', target: 'mq', latencyMs: 1, routeType: 'default' },
        { id: 'e-mq-w', source: 'mq', target: 'w', latencyMs: 5, routeType: 'default' },
      ],
    };

    const snap = new SimulationEngine(graph, { seed: 1, durationMs: 1000, drainOnEnd: true }, [
      {
        id: 'f-link',
        type: 'edge_failure',
        targetId: 'e-mq-w',
        startAtMs: 0,
        durationMs: 500,
        value: 1,
      },
    ]).runToCompletion();

    assertSnapshotInvariants(snap);
    expect(snap.nodeMetrics.mq!.jobsEnqueued).toBe(10);
    expect(snap.nodeMetrics.mq!.jobsCompleted).toBe(10);
    expect(snap.nodeMetrics.w!.jobsCompleted).toBe(10);
    expect(snap.nodeMetrics.w!.jobMeanLatencyMs).not.toBeNull();
    expect(snap.nodeMetrics.w!.jobMeanLatencyMs!).toBeGreaterThan(30);
    expect(snap.nodeMetrics.mq!.queueDepth).toBe(0);
  });

  it('handles overlapping node_failure faults, zero-duration faults, late completions after timeout, and capacity_drop bounds', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 10, // 0, 100, 200, 300, ...
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 80, // First request times out at t=80 while service finishes at t=150!
          },
        },
        {
          id: 'app',
          label: 'App',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 10,
            serviceTimeMs: 150,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'c', target: 'app', latencyMs: 0, routeType: 'default' }],
    };

    // Capacity drops to 50% (1 worker) while 2 workers are busy, plus overlapping node failures
    const faults: ScheduledFault[] = [
      {
        id: 'cap1',
        type: 'capacity_drop',
        targetId: 'app',
        startAtMs: 50,
        durationMs: 200,
        value: 0.5,
      },
      {
        id: 'zero',
        type: 'latency_spike',
        targetId: 'app',
        startAtMs: 250,
        durationMs: 0,
        value: 50,
      },
      {
        id: 'fail1',
        type: 'node_failure',
        targetId: 'app',
        startAtMs: 300,
        durationMs: 400,
        value: 1,
      },
      {
        id: 'fail2',
        type: 'node_failure',
        targetId: 'app',
        startAtMs: 350,
        durationMs: 150,
        value: 1,
      },
    ];

    const snap = new SimulationEngine(
      graph,
      { seed: 42, durationMs: 1000 },
      faults,
    ).runToCompletion();
    assertSnapshotInvariants(snap);
    expect(snap.global.timedOut).toBeGreaterThan(0);

    // At t=500 fail2 expires while fail1 is still active until t=700, so NODE_RECOVERED must only fire once at t=700
    const recoveredEvents = snap.eventLog.filter((e) => e.type === 'NODE_RECOVERED');
    expect(recoveredEvents).toHaveLength(1);
    expect(recoveredEvents[0]!.timestampMs).toBe(700);
  });

  it('discards excess bucketLatencies once MAX_TIME_SERIES_POINTS is reached and warns on multi-edge Client', () => {
    const collector = new MetricsCollector(10_000, new SeededRng(5));
    collector.registerNode('srv', 'Srv', 'app_server', 1);

    for (let i = 0; i < MAX_TIME_SERIES_POINTS + 25; i += 1) {
      collector.recordTimeSeriesBucket(i * 250, [
        {
          nodeId: 'srv',
          label: 'Srv',
          type: 'app_server',
          status: 'healthy',
          activeRequests: 0,
          queueDepth: 0,
          effectiveCapacity: 1,
        },
      ]);
    }
    expect(collector.getTimeSeries()).toHaveLength(MAX_TIME_SERIES_POINTS);

    const req: LogicalRequest = {
      id: 'req-cap',
      method: 'read',
      sourceClientId: 'c',
      createdAtMs: 0,
      deadlineMs: 1000,
      terminalState: 'succeeded',
      completedAtMs: 10,
      errorCategory: null,
      hopCount: 1,
      retriesAttemptedOnNode: {},
      circuitBreakerIds: [],
      isBackgroundJob: false,
      hops: [],
    };
    collector.recordGenerated(false);
    collector.recordTerminal(req, 10);
    // Bucket array must remain empty when timeSeries is full
    collector.recordTimeSeriesBucket(999_999, []);
    expect((collector as unknown as { bucketLatencies: number[] }).bucketLatencies).toHaveLength(0);

    // Multi-edge client warning & failover
    const multiClientGraph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 5,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 's1',
          label: 'S1',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 10,
            serviceTimeMs: 10,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 10,
          },
        },
        {
          id: 's2',
          label: 'S2',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 10,
            serviceTimeMs: 10,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 10,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 's1', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'c', target: 's2', latencyMs: 1, routeType: 'default' },
      ],
    };

    const validation = validateGraph(multiClientGraph);
    expect(validation.valid).toBe(true);
    expect(validation.issues.some((i) => i.code === 'MULTIPLE_OUTGOING_EDGES')).toBe(true);

    const failSnap = new SimulationEngine(multiClientGraph, { seed: 1, durationMs: 1000 }, [
      {
        id: 'f-e1',
        type: 'edge_failure',
        targetId: 'e1',
        startAtMs: 0,
        durationMs: 1000,
        value: 1,
      },
    ]).runToCompletion();
    assertSnapshotInvariants(failSnap);
    expect(failSnap.global.succeeded).toBe(5);
    expect(failSnap.nodeMetrics.s2?.completions).toBe(5);
  });
});
