import { performance } from 'node:perf_hooks';
import { SimulationEngine } from '../src/engine/core/engine';
import type { ArchitectureGraph, ScheduledFault, SimulationSnapshot } from '../src/engine/models/types';

interface BenchmarkCaseResult {
  name: string;
  nodes: number;
  edges: number;
  seed: number;
  durationMs: number;
  wallMs: number;
  generated: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  processedEvents: number;
  eventsPerSec: number;
  heapUsedDeltaMb: number;
  conserved: boolean;
}

function makeThreeTierGraph(ratePerSecond: number): ArchitectureGraph {
  return {
    nodes: [
      {
        id: 'client',
        label: 'Client',
        config: {
          type: 'client',
          ratePerSecond,
          workloadPattern: 'poisson',
          burstMultiplier: 2,
          burstDurationMs: 1000,
          burstPeriodMs: 3000,
          readRatio: 0.85,
          timeoutMs: 2500,
        },
      },
      {
        id: 'lb',
        label: 'Load Balancer',
        config: {
          type: 'load_balancer',
          strategy: 'least_in_flight',
          processingLatencyMs: 1,
          healthCheckEnabled: true,
        },
      },
      {
        id: 'app1',
        label: 'App 1',
        config: {
          type: 'app_server',
          concurrency: 20,
          queueCapacity: 500,
          serviceTimeMs: 15,
          distribution: 'exponential',
          cv: 0.5,
          failureProbability: 0.01,
          maxRetries: 0,
          retryDelayMs: 25,
        },
      },
      {
        id: 'app2',
        label: 'App 2',
        config: {
          type: 'app_server',
          concurrency: 20,
          queueCapacity: 500,
          serviceTimeMs: 15,
          distribution: 'exponential',
          cv: 0.5,
          failureProbability: 0.01,
          maxRetries: 0,
          retryDelayMs: 25,
        },
      },
      {
        id: 'cache',
        label: 'Cache',
        config: {
          type: 'cache',
          lookupLatencyMs: 1,
          hitProbability: 0.8,
          writePolicy: 'bypass',
          coldStartWarmupMs: 5000,
        },
      },
      {
        id: 'db',
        label: 'Database',
        config: {
          type: 'database',
          maxConnections: 25,
          queueCapacity: 500,
          readLatencyMs: 12,
          writeLatencyMs: 25,
          distribution: 'lognormal',
          cv: 0.4,
          failureProbability: 0,
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'client', target: 'lb', latencyMs: 2, routeType: 'default' },
      { id: 'e2', source: 'lb', target: 'app1', latencyMs: 1, routeType: 'default' },
      { id: 'e3', source: 'lb', target: 'app2', latencyMs: 1, routeType: 'default' },
      { id: 'e4', source: 'app1', target: 'cache', latencyMs: 1, routeType: 'default' },
      { id: 'e5', source: 'app2', target: 'cache', latencyMs: 1, routeType: 'default' },
      { id: 'e6', source: 'cache', target: 'db', latencyMs: 2, routeType: 'default' },
    ],
  };
}

function makeLarge25NodeGraph(ratePerSecond: number): ArchitectureGraph {
  const nodes: ArchitectureGraph['nodes'] = [
    {
      id: 'client',
      label: 'Client',
      config: {
        type: 'client',
        ratePerSecond,
        workloadPattern: 'poisson',
        burstMultiplier: 2,
        burstDurationMs: 1000,
        burstPeriodMs: 3000,
        readRatio: 0.8,
        timeoutMs: 3000,
      },
    },
    {
      id: 'gw',
      label: 'Gateway',
      config: {
        type: 'api_gateway',
        processingLatencyMs: 2,
        rateLimitEnabled: false,
        rateLimitRps: 5000,
        burstCapacity: 500,
        routingMode: 'default',
      },
    },
    {
      id: 'lb',
      label: 'LB',
      config: {
        type: 'load_balancer',
        strategy: 'round_robin',
        processingLatencyMs: 1,
        healthCheckEnabled: true,
      },
    },
  ];
  const edges: ArchitectureGraph['edges'] = [
    { id: 'e-c-gw', source: 'client', target: 'gw', latencyMs: 2, routeType: 'default' },
    { id: 'e-gw-lb', source: 'gw', target: 'lb', latencyMs: 1, routeType: 'default' },
  ];

  // 20 parallel App Servers + Cache + DB = 25 nodes
  nodes.push(
    {
      id: 'cache',
      label: 'Shared Cache',
      config: {
        type: 'cache',
        lookupLatencyMs: 1,
        hitProbability: 0.75,
        writePolicy: 'bypass',
        coldStartWarmupMs: 2000,
      },
    },
    {
      id: 'db',
      label: 'Shared DB',
      config: {
        type: 'database',
        maxConnections: 30,
        queueCapacity: 400,
        readLatencyMs: 12,
        writeLatencyMs: 20,
        distribution: 'fixed',
        cv: 0.4,
        failureProbability: 0,
      },
    },
  );
  edges.push({ id: 'e-cache-db', source: 'cache', target: 'db', latencyMs: 2, routeType: 'default' });

  for (let i = 1; i <= 20; i += 1) {
    const id = `app-${i}`;
    nodes.push({
      id,
      label: `App ${i}`,
      config: {
        type: 'app_server',
        concurrency: 4,
        queueCapacity: 50,
        serviceTimeMs: 20,
        distribution: 'fixed',
        cv: 0.5,
        failureProbability: 0,
        maxRetries: 0,
        retryDelayMs: 20,
      },
    });
    edges.push(
      { id: `e-lb-${i}`, source: 'lb', target: id, latencyMs: 1, routeType: 'default' },
      { id: `e-${i}-cache`, source: id, target: 'cache', latencyMs: 1, routeType: 'default' },
    );
  }

  return { nodes, edges };
}

function runBenchmarkCase(
  name: string,
  graph: ArchitectureGraph,
  seed: number,
  durationMs: number,
  faults: ScheduledFault[] = [],
  maxEvents = 2_000_000,
): BenchmarkCaseResult {
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const engine = new SimulationEngine(
    graph,
    {
      seed,
      durationMs,
      drainOnEnd: true,
      maxDrainMs: 10_000,
      safetyLimits: {
        maxEvents,
        maxZeroTimeEvents: 25_000,
        maxHops: 64,
        maxInFlight: 200_000,
      },
    },
    faults,
  );
  const snap: SimulationSnapshot = engine.runToCompletion();
  const wallMs = performance.now() - t0;
  const memAfter = process.memoryUsage().heapUsed;

  const { generated, succeeded, failed, timedOut, inFlight, processedEvents } = snap.global;
  const conserved = generated === succeeded + failed + timedOut + inFlight;

  return {
    name,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    seed,
    durationMs,
    wallMs: Number(wallMs.toFixed(2)),
    generated,
    succeeded,
    failed,
    timedOut,
    processedEvents,
    eventsPerSec: Math.round(processedEvents / Math.max(wallMs / 1000, 0.0001)),
    heapUsedDeltaMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
    conserved,
  };
}

function main(): void {
  const results: BenchmarkCaseResult[] = [
    runBenchmarkCase('1k requests · small 2-node', {
      nodes: [
        makeThreeTierGraph(100).nodes[0]!,
        makeThreeTierGraph(100).nodes[2]!,
      ],
      edges: [{ id: 'e1', source: 'client', target: 'app1', latencyMs: 2, routeType: 'default' }],
    }, 42, 10_000),
    runBenchmarkCase('10k requests · 3-tier medium (6 nodes)', makeThreeTierGraph(1000), 42, 10_000),
    runBenchmarkCase('100k requests · 3-tier stretch (6 nodes)', makeThreeTierGraph(2500), 42, 40_000, [], 2_500_000),
    runBenchmarkCase('25-node large topology · 5k requests', makeLarge25NodeGraph(500), 42, 10_000),
    runBenchmarkCase(
      'Failure & recovery · 10k requests',
      makeThreeTierGraph(1000),
      42,
      10_000,
      [{ id: 'f1', type: 'node_failure', targetId: 'app1', startAtMs: 3000, durationMs: 4000, value: 1 }],
    ),
    runBenchmarkCase('Queue saturation overload · 10k requests', (() => {
      const g = makeThreeTierGraph(2000);
      for (const n of g.nodes) {
        if (n.config.type === 'app_server') {
          n.config.concurrency = 4;
          n.config.queueCapacity = 20;
        }
      }
      return g;
    })(), 42, 5_000),
  ];

  console.log(`Environment: Node ${process.version} · ${process.platform}/${process.arch}`);
  console.table(results);

  const failedConservation = results.filter((r) => !r.conserved);
  if (failedConservation.length > 0) {
    console.error('Request conservation failed on benchmark cases:', failedConservation);
    process.exitCode = 1;
  }
}

main();
