import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '@/engine/core/engine';
import type { ArchitectureGraph, ScheduledFault, SimulationSnapshot } from '@/engine/models/types';

function assertConservation(snap: SimulationSnapshot): void {
  const { generated, succeeded, failed, timedOut, inFlight } = snap.global;
  expect(generated).toBe(succeeded + failed + timedOut + inFlight);
  expect(inFlight).toBeGreaterThanOrEqual(0);
}

describe('Analytical Simulation Verification (Tests A–H)', () => {
  it('Test A — Single Server: fixed 100ms service, 200ms constant arrivals, zero queue wait', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'client',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 5, // 200ms apart: 0, 200, 400, 600, 800
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 'srv',
          label: 'App Server',
          config: {
            type: 'app_server',
            concurrency: 1,
            queueCapacity: 10,
            serviceTimeMs: 100,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'client', target: 'srv', latencyMs: 0, routeType: 'default' }],
    };

    const engine = new SimulationEngine(graph, {
      seed: 1,
      durationMs: 1000,
      drainOnEnd: true,
    });
    const snap = engine.runToCompletion();

    assertConservation(snap);
    expect(snap.global.generated).toBe(5);
    expect(snap.global.succeeded).toBe(5);
    expect(snap.global.failed).toBe(0);
    expect(snap.global.timedOut).toBe(0);
    expect(snap.global.meanLatencyMs).toBe(100);
    expect(snap.global.p50LatencyMs).toBe(100);
    expect(snap.global.p95LatencyMs).toBe(100);
    expect(snap.global.p99LatencyMs).toBe(100);
    expect(snap.global.throughputRps).toBeCloseTo(5.0, 5);
    expect(snap.nodeMetrics.srv?.meanWaitingTimeMs).toBe(0);
    expect(snap.nodeMetrics.srv?.maxQueueDepthObserved).toBe(0);
    expect(snap.nodeMetrics.srv?.utilization).toBeCloseTo(0.5, 5);
  });

  it('Test B — Queue Formation: two simultaneous arrivals at t=0 into capacity-1 100ms server', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c1',
          label: 'Client 1',
          config: {
            type: 'client',
            ratePerSecond: 1, // next at 1000ms (> 500ms duration), so exactly 1 request at t=0
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 'c2',
          label: 'Client 2',
          config: {
            type: 'client',
            ratePerSecond: 1,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 'srv',
          label: 'Single Worker Server',
          config: {
            type: 'app_server',
            concurrency: 1,
            queueCapacity: 10,
            serviceTimeMs: 100,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c1', target: 'srv', latencyMs: 0, routeType: 'default' },
        { id: 'e2', source: 'c2', target: 'srv', latencyMs: 0, routeType: 'default' },
      ],
    };

    const engine = new SimulationEngine(graph, {
      seed: 1,
      durationMs: 500,
      drainOnEnd: true,
    });
    const snap = engine.runToCompletion();

    assertConservation(snap);
    expect(snap.global.generated).toBe(2);
    expect(snap.global.succeeded).toBe(2);
    expect(snap.nodeMetrics.srv?.maxQueueDepthObserved).toBe(1);
    expect(snap.nodeMetrics.srv?.meanWaitingTimeMs).toBe(50);
    expect(snap.global.meanLatencyMs).toBe(150);

    const latencies = snap.recentTraces.map((t) => t.totalLatencyMs).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(latencies).toEqual([100, 200]);
  });

  it('Test C — Round-Robin Load Balancer: 6 requests split evenly 3 and 3 across 2 targets', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'client',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 6, // 166.67ms apart over 1000ms -> 6 requests
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 'lb',
          label: 'Load Balancer',
          config: {
            type: 'load_balancer',
            strategy: 'round_robin',
            processingLatencyMs: 0,
            healthCheckEnabled: true,
          },
        },
        {
          id: 's1',
          label: 'Server 1',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 10,
            serviceTimeMs: 20,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 's2',
          label: 'Server 2',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 10,
            serviceTimeMs: 20,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [
        { id: 'e-lb', source: 'client', target: 'lb', latencyMs: 0, routeType: 'default' },
        { id: 'e-s1', source: 'lb', target: 's1', latencyMs: 0, routeType: 'default' },
        { id: 'e-s2', source: 'lb', target: 's2', latencyMs: 0, routeType: 'default' },
      ],
    };

    const engine = new SimulationEngine(graph, { seed: 10, durationMs: 1000, drainOnEnd: true });
    const snap = engine.runToCompletion();

    assertConservation(snap);
    expect(snap.global.generated).toBe(6);
    expect(snap.global.succeeded).toBe(6);
    expect(snap.nodeMetrics.lb?.routedCounts).toEqual({ s1: 3, s2: 3 });
    expect(snap.nodeMetrics.s1?.completions).toBe(3);
    expect(snap.nodeMetrics.s2?.completions).toBe(3);
  });

  it('Test D — Cache Extremes: hitProbability=0 sends 100% to DB; hitProbability=1 sends 0% to DB', () => {
    const buildGraph = (hitProbability: number): ArchitectureGraph => ({
      nodes: [
        {
          id: 'client',
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
            lookupLatencyMs: 2,
            hitProbability,
            writePolicy: 'bypass',
            coldStartWarmupMs: 0,
          },
        },
        {
          id: 'db',
          label: 'Database',
          config: {
            type: 'database',
            maxConnections: 10,
            queueCapacity: 50,
            readLatencyMs: 30,
            writeLatencyMs: 60,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'client', target: 'cache', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'cache', target: 'db', latencyMs: 4, routeType: 'default' },
      ],
    });

    const missSnap = new SimulationEngine(buildGraph(0), { seed: 5, durationMs: 1000 }).runToCompletion();
    assertConservation(missSnap);
    expect(missSnap.global.succeeded).toBe(10);
    expect(missSnap.nodeMetrics.cache?.cacheHits).toBe(0);
    expect(missSnap.nodeMetrics.cache?.cacheMisses).toBe(10);
    expect(missSnap.nodeMetrics.db?.dbReads).toBe(10);
    expect(missSnap.global.meanLatencyMs).toBe(1 + 2 + 4 + 30);

    const hitSnap = new SimulationEngine(buildGraph(1), { seed: 5, durationMs: 1000 }).runToCompletion();
    assertConservation(hitSnap);
    expect(hitSnap.global.succeeded).toBe(10);
    expect(hitSnap.nodeMetrics.cache?.cacheHits).toBe(10);
    expect(hitSnap.nodeMetrics.cache?.cacheMisses).toBe(0);
    expect(hitSnap.nodeMetrics.db?.dbReads).toBe(0);
    expect(hitSnap.global.meanLatencyMs).toBe(1 + 2);
  });

  it('Test E — Scheduled Node Failure & Recovery: requests in outage window fail, before/after succeed', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'client',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 1, // arrivals at t = 0, 1000, 2000, 3000, 4000, 5000
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 'srv',
          label: 'App Server',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 10,
            serviceTimeMs: 50,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'client', target: 'srv', latencyMs: 0, routeType: 'default' }],
    };

    const faults: ScheduledFault[] = [
      {
        id: 'f1',
        type: 'node_failure',
        targetId: 'srv',
        startAtMs: 1500,
        durationMs: 3000, // failed during [1500, 4500) -> kills arrivals at 2000, 3000, 4000
        value: 1,
      },
    ];

    const snap = new SimulationEngine(graph, { seed: 1, durationMs: 6000 }, faults).runToCompletion();

    assertConservation(snap);
    expect(snap.global.generated).toBe(6);
    // t=0, 1000, 5000 succeed (3); t=2000, 3000, 4000 fail (3)
    expect(snap.global.succeeded).toBe(3);
    expect(snap.global.failed).toBe(3);
    expect(snap.nodeMetrics.srv?.status).toBe('healthy');
    expect(snap.activeFaults).toHaveLength(0);
  });

  it('Test F — Request Conservation Invariant across timeouts, retries, overflow, CB, and async MQ', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'client',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 80,
            workloadPattern: 'poisson',
            burstMultiplier: 2,
            burstDurationMs: 500,
            burstPeriodMs: 1000,
            readRatio: 0.7,
            timeoutMs: 180,
          },
        },
        {
          id: 'gw',
          label: 'API Gateway',
          config: {
            type: 'api_gateway',
            processingLatencyMs: 2,
            rateLimitEnabled: true,
            rateLimitRps: 65,
            burstCapacity: 15,
            routingMode: 'default',
          },
        },
        {
          id: 'cb',
          label: 'Circuit Breaker',
          config: {
            type: 'circuit_breaker',
            failureThreshold: 3,
            openDurationMs: 500,
            halfOpenMaxProbes: 1,
            processingLatencyMs: 1,
          },
        },
        {
          id: 'app',
          label: 'App Server',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 4,
            serviceTimeMs: 45,
            distribution: 'lognormal',
            cv: 0.7,
            failureProbability: 0.15,
            maxRetries: 2,
            retryDelayMs: 20,
          },
        },
        {
          id: 'mq',
          label: 'MQ',
          config: {
            type: 'message_queue',
            queueCapacity: 25,
            enqueueLatencyMs: 3,
            deliveryMode: 'async_ack',
          },
        },
        {
          id: 'worker',
          label: 'Worker',
          config: {
            type: 'worker',
            concurrency: 1,
            processingTimeMs: 60,
            distribution: 'exponential',
            cv: 0.4,
            failureProbability: 0.05,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'client', target: 'gw', latencyMs: 2, routeType: 'default' },
        { id: 'e2', source: 'gw', target: 'cb', latencyMs: 2, routeType: 'default' },
        { id: 'e3', source: 'cb', target: 'app', latencyMs: 2, routeType: 'default' },
        { id: 'e4', source: 'app', target: 'mq', latencyMs: 2, routeType: 'default' },
        { id: 'e5', source: 'mq', target: 'worker', latencyMs: 2, routeType: 'default' },
      ],
    };

    // Check mid-run AND after completion with drain disabled AND enabled
    const midEngine = new SimulationEngine(graph, { seed: 42, durationMs: 4000, drainOnEnd: false });
    midEngine.runUntil(2000);
    assertConservation(midEngine.getSnapshot(false));
    const endNoDrain = midEngine.runToCompletion();
    assertConservation(endNoDrain);
    expect(endNoDrain.global.generated).toBeGreaterThan(200);
    expect(endNoDrain.global.succeeded).toBeGreaterThan(0);
    expect(endNoDrain.global.failed).toBeGreaterThan(0);

    const drainEngine = new SimulationEngine(graph, { seed: 42, durationMs: 4000, drainOnEnd: true });
    const endWithDrain = drainEngine.runToCompletion();
    assertConservation(endWithDrain);
    expect(endWithDrain.global.inFlight).toBe(0);
  });

  it('Test G — Deterministic Reproducibility: identical seed & batching speed-invariance', () => {
    const graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 40,
            workloadPattern: 'poisson',
            burstMultiplier: 2,
            burstDurationMs: 500,
            burstPeriodMs: 1500,
            readRatio: 0.8,
            timeoutMs: 800,
          },
        },
        {
          id: 'lb',
          label: 'LB',
          config: {
            type: 'load_balancer',
            strategy: 'least_in_flight',
            processingLatencyMs: 2,
            healthCheckEnabled: true,
          },
        },
        {
          id: 's1',
          label: 'Srv 1',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 15,
            serviceTimeMs: 35,
            distribution: 'exponential',
            cv: 0.5,
            failureProbability: 0.05,
            maxRetries: 1,
            retryDelayMs: 25,
          },
        },
        {
          id: 's2',
          label: 'Srv 2',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 15,
            serviceTimeMs: 45,
            distribution: 'lognormal',
            cv: 0.6,
            failureProbability: 0.02,
            maxRetries: 1,
            retryDelayMs: 25,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'lb', latencyMs: 3, routeType: 'default' },
        { id: 'e2', source: 'lb', target: 's1', latencyMs: 2, routeType: 'default' },
        { id: 'e3', source: 'lb', target: 's2', latencyMs: 2, routeType: 'default' },
      ],
    };

    const runHeadless = new SimulationEngine(graph, { seed: 9001, durationMs: 5000 }).runToCompletion();

    // Run 2: step 50ms slices (simulates slow 1x playback)
    const sliceEngine = new SimulationEngine(graph, { seed: 9001, durationMs: 5000 });
    for (let t = 50; t <= 25000; t += 50) {
      const res = sliceEngine.runUntil(t, 20);
      if (res.status === 'completed') break;
    }
    const runSliced = sliceEngine.getSnapshot(false);

    expect(runSliced.global).toEqual(runHeadless.global);
    expect(runSliced.nodeMetrics).toEqual(runHeadless.nodeMetrics);
    expect(runSliced.timeSeries).toEqual(runHeadless.timeSeries);

    // Different seed must diverge
    const runDifferentSeed = new SimulationEngine(graph, { seed: 9002, durationMs: 5000 }).runToCompletion();
    expect(runDifferentSeed.global.meanLatencyMs).not.toBe(runHeadless.global.meanLatencyMs);
  });

  it('Test H — Queue Saturation & M/M/1 Theoretical Alignment', () => {
    // Part 1: M/M/1 steady state (lambda = 6 RPS, mu = 10 RPS => rho = 0.6, E[W] = 1/(10-6) = 250ms)
    const mm1Graph: ArchitectureGraph = {
      nodes: [
        {
          id: 'client',
          label: 'Poisson Client',
          config: {
            type: 'client',
            ratePerSecond: 6,
            workloadPattern: 'poisson',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 30_000,
          },
        },
        {
          id: 'srv',
          label: 'M/M/1 Server',
          config: {
            type: 'app_server',
            concurrency: 1,
            queueCapacity: 2000,
            serviceTimeMs: 100,
            distribution: 'exponential',
            cv: 1,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'client', target: 'srv', latencyMs: 0, routeType: 'default' }],
    };

    const steadySnap = new SimulationEngine(mm1Graph, {
      seed: 12345,
      durationMs: 180_000,
      drainOnEnd: true,
      maxDrainMs: 20_000,
    }).runToCompletion();

    assertConservation(steadySnap);
    expect(steadySnap.global.failed).toBe(0);
    expect(steadySnap.global.timedOut).toBe(0);
    expect(steadySnap.nodeMetrics.srv!.utilization).toBeGreaterThan(0.52);
    expect(steadySnap.nodeMetrics.srv!.utilization).toBeLessThan(0.68);
    expect(steadySnap.global.meanLatencyMs!).toBeGreaterThan(190);
    expect(steadySnap.global.meanLatencyMs!).toBeLessThan(330);

    // Part 2: Overload (lambda = 25 > mu = 10, finite queueCapacity = 10)
    const overloadGraph: ArchitectureGraph = {
      nodes: [
        {
          ...mm1Graph.nodes[0]!,
          config: {
            ...mm1Graph.nodes[0]!.config,
            type: 'client',
            ratePerSecond: 25,
            workloadPattern: 'constant',
            burstMultiplier: 1,
            burstDurationMs: 100,
            burstPeriodMs: 200,
            readRatio: 1,
            timeoutMs: 5000,
          },
        },
        {
          ...mm1Graph.nodes[1]!,
          config: {
            ...mm1Graph.nodes[1]!.config,
            type: 'app_server',
            concurrency: 1,
            queueCapacity: 10,
            serviceTimeMs: 100,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: mm1Graph.edges,
    };

    const satSnap = new SimulationEngine(overloadGraph, {
      seed: 1,
      durationMs: 5000,
      drainOnEnd: true,
    }).runToCompletion();

    assertConservation(satSnap);
    expect(satSnap.nodeMetrics.srv!.utilization).toBeGreaterThan(0.95);
    expect(satSnap.nodeMetrics.srv!.maxQueueDepthObserved).toBe(10);
    expect(satSnap.nodeMetrics.srv!.droppedRequests).toBeGreaterThan(50);
  });
});
