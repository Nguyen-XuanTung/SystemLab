import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '@/engine/core/engine';
import type { ArchitectureGraph } from '@/engine/models/types';

function makeThreeTierGraph(): ArchitectureGraph {
  return {
    nodes: [
      {
        id: 'c',
        label: 'Client',
        config: {
          type: 'client',
          ratePerSecond: 20,
          workloadPattern: 'constant',
          burstMultiplier: 1,
          burstDurationMs: 500,
          burstPeriodMs: 1000,
          readRatio: 1,
          timeoutMs: 1500,
        },
      },
      {
        id: 'cache',
        label: 'Cache',
        config: {
          type: 'cache',
          lookupLatencyMs: 2,
          hitProbability: 0.8,
          writePolicy: 'bypass',
          coldStartWarmupMs: 2000,
        },
      },
      {
        id: 'db',
        label: 'Database',
        config: {
          type: 'database',
          maxConnections: 4,
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
      { id: 'e1', source: 'c', target: 'cache', latencyMs: 1, routeType: 'default' },
      { id: 'e2', source: 'cache', target: 'db', latencyMs: 3, routeType: 'default' },
    ],
  };
}

describe('Chaos Lab Fault Injection & Recovery', () => {
  it('supports manual live fault injection, recovery, and records exact timeline', () => {
    const engine = new SimulationEngine(makeThreeTierGraph(), { seed: 9, durationMs: 6000 });
    engine.runUntil(2000);

    const injected = engine.injectFault('node_failure', 'db', 1, null, 'Manual DB crash');
    expect(engine.getSnapshot(false).activeFaults).toHaveLength(1);
    expect(engine.getSnapshot(false).nodeMetrics.db!.status).toBe('failed');

    engine.runUntil(4000);
    const recovered = engine.recoverFault(injected.id);
    expect(recovered).toBe(true);
    expect(engine.getSnapshot(false).activeFaults).toHaveLength(0);

    const finalSnap = engine.runToCompletion();
    expect(finalSnap.global.generated).toBe(
      finalSnap.global.succeeded +
        finalSnap.global.failed +
        finalSnap.global.timedOut +
        finalSnap.global.inFlight,
    );
    expect(finalSnap.faultTimeline).toHaveLength(1);
    expect(finalSnap.faultTimeline[0]!.startAtMs).toBe(2000);
    expect(finalSnap.faultTimeline[0]!.durationMs).toBe(2000);
  });

  it('handles latency_spike, capacity_drop, traffic_spike, packet_drop, cache_cold_start, and edge faults', () => {
    const graph = makeThreeTierGraph();
    const baseline = new SimulationEngine(graph, { seed: 42, durationMs: 4000 }).runToCompletion();

    const latencyFaulted = new SimulationEngine(graph, { seed: 42, durationMs: 4000 }, [
      {
        id: 'f-lat',
        type: 'latency_spike',
        targetId: 'db',
        startAtMs: 0,
        durationMs: 4000,
        value: 300,
      },
    ]).runToCompletion();
    expect(latencyFaulted.global.meanLatencyMs!).toBeGreaterThan(
      baseline.global.meanLatencyMs! + 40,
    );

    const coldStartSnap = new SimulationEngine(graph, { seed: 42, durationMs: 4000 }, [
      {
        id: 'f-cold',
        type: 'cache_cold_start',
        targetId: 'cache',
        startAtMs: 0,
        durationMs: 2000,
        value: 1,
      },
    ]).runToCompletion();
    expect(coldStartSnap.nodeMetrics.cache!.cacheMisses).toBeGreaterThan(
      baseline.nodeMetrics.cache!.cacheMisses,
    );

    const spikeSnap = new SimulationEngine(graph, { seed: 42, durationMs: 4000 }, [
      {
        id: 'f-spike',
        type: 'traffic_spike',
        targetId: 'c',
        startAtMs: 1000,
        durationMs: 2000,
        value: 4,
      },
    ]).runToCompletion();
    expect(spikeSnap.global.generated).toBeGreaterThan(baseline.global.generated * 2);

    const dropSnap = new SimulationEngine(graph, { seed: 42, durationMs: 4000 }, [
      {
        id: 'f-drop',
        type: 'packet_drop',
        targetId: 'cache',
        startAtMs: 0,
        durationMs: 4000,
        value: 0.5,
      },
    ]).runToCompletion();
    expect(dropSnap.global.failed).toBeGreaterThan(20);

    const edgeFailSnap = new SimulationEngine(graph, { seed: 42, durationMs: 4000 }, [
      {
        id: 'f-edge',
        type: 'edge_failure',
        targetId: 'e1',
        startAtMs: 1000,
        durationMs: 1000,
        value: 1,
      },
      {
        id: 'f-elat',
        type: 'edge_latency_spike',
        targetId: 'e1',
        startAtMs: 2500,
        durationMs: 1500,
        value: 100,
      },
    ]).runToCompletion();
    expect(edgeFailSnap.global.failed).toBeGreaterThanOrEqual(19);
    expect(edgeFailSnap.global.meanLatencyMs!).toBeGreaterThan(baseline.global.meanLatencyMs! + 20);

    // Capacity drop on app server + worker failure recovery
    const capGraph: ArchitectureGraph = {
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
            readRatio: 0,
            timeoutMs: 2000,
          },
        },
        {
          id: 'app',
          label: 'App',
          config: {
            type: 'app_server',
            concurrency: 4,
            queueCapacity: 10,
            serviceTimeMs: 100,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'mq',
          label: 'MQ',
          config: {
            type: 'message_queue',
            queueCapacity: 50,
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
            processingTimeMs: 80,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'app', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'app', target: 'mq', latencyMs: 1, routeType: 'default' },
        { id: 'e3', source: 'mq', target: 'w', latencyMs: 1, routeType: 'default' },
      ],
    };

    const capSnap = new SimulationEngine(capGraph, { seed: 1, durationMs: 4000 }, [
      {
        id: 'f-cap',
        type: 'capacity_drop',
        targetId: 'app',
        startAtMs: 500,
        durationMs: 1500,
        value: 0.25,
      },
      {
        id: 'f-wdown',
        type: 'node_failure',
        targetId: 'w',
        startAtMs: 1000,
        durationMs: 1000,
        value: 1,
      },
    ]).runToCompletion();
    expect(capSnap.nodeMetrics.app!.maxQueueDepthObserved).toBeGreaterThan(0);
    expect(capSnap.nodeMetrics.w!.jobsFailed).toBeGreaterThan(0);
    expect(capSnap.nodeMetrics.w!.jobsCompleted).toBeGreaterThan(0);

    // Recovering non-existent fault returns false; client node_failure & cache warmupMs=0 work
    const zeroWarmupGraph = makeThreeTierGraph();
    if (zeroWarmupGraph.nodes[1]!.config.type === 'cache') {
      zeroWarmupGraph.nodes[1]!.config.coldStartWarmupMs = 0;
    }
    const coldZeroSnap = new SimulationEngine(zeroWarmupGraph, { seed: 3, durationMs: 2000 }, [
      {
        id: 'f-cold-0',
        type: 'cache_cold_start',
        targetId: 'cache',
        startAtMs: 0,
        durationMs: 2000,
        value: 1,
      },
    ]).runToCompletion();
    expect(coldZeroSnap.nodeMetrics.cache!.cacheHits).toBe(0);

    const eng = new SimulationEngine(makeThreeTierGraph(), { seed: 3, durationMs: 3000 });
    expect(eng.recoverFault('does-not-exist')).toBe(false);
    eng.injectFault('node_failure', 'c', 1, 1000);
    eng.runUntil(1500);
    const afterClientRecover = eng.runToCompletion();
    expect(afterClientRecover.global.failed).toBeGreaterThan(0);
    expect(afterClientRecover.global.succeeded).toBeGreaterThan(0);
  });
});
