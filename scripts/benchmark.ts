import { performance } from 'node:perf_hooks';
import { SimulationEngine } from '../src/engine/core/engine';
import type { ArchitectureGraph, ScheduledFault, SimulationSnapshot } from '../src/engine/models/types';
import { WorkerSessionRunner } from '../src/workers/runner';

interface BenchmarkCaseSummary {
  name: string;
  nodes: number;
  edges: number;
  seed: number;
  runs: number;
  horizonMs: number;
  medianWallMs: number;
  minWallMs: number;
  maxWallMs: number;
  iqrWallMs: number;
  generated: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  simReqPerSec: number;
  processedEvents: number;
  medianEventsPerSec: number;
  allConserved: boolean;
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
  ];
  const edges: ArchitectureGraph['edges'] = [
    { id: 'e-c-gw', source: 'client', target: 'gw', latencyMs: 2, routeType: 'default' },
    { id: 'e-gw-lb', source: 'gw', target: 'lb', latencyMs: 1, routeType: 'default' },
    { id: 'e-cache-db', source: 'cache', target: 'db', latencyMs: 2, routeType: 'default' },
  ];

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

function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

function executeSingleRun(
  graph: ArchitectureGraph,
  seed: number,
  durationMs: number,
  faults: ScheduledFault[],
  maxEvents: number,
): { wallMs: number; snap: SimulationSnapshot } {
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
  const snap = engine.runToCompletion();
  const wallMs = performance.now() - t0;
  return { wallMs, snap };
}

function runBenchmarkCase(
  name: string,
  graph: ArchitectureGraph,
  seed: number,
  durationMs: number,
  runs: number,
  faults: ScheduledFault[] = [],
  maxEvents = 2_500_000,
): BenchmarkCaseSummary {
  // 1 warmup run (discarded for JIT stability)
  executeSingleRun(graph, seed, durationMs, faults, maxEvents);

  const timings: number[] = [];
  let lastSnap: SimulationSnapshot | null = null;
  let allConserved = true;

  for (let i = 0; i < runs; i += 1) {
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
    }
    const { wallMs, snap } = executeSingleRun(graph, seed, durationMs, faults, maxEvents);
    timings.push(wallMs);
    lastSnap = snap;
    const { generated, succeeded, failed, timedOut, inFlight } = snap.global;
    if (generated !== succeeded + failed + timedOut + inFlight) {
      allConserved = false;
    }
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const medianWallMs = quantile(sorted, 0.5);
  const minWallMs = sorted[0] ?? 0;
  const maxWallMs = sorted[sorted.length - 1] ?? 0;
  const iqrWallMs = quantile(sorted, 0.75) - quantile(sorted, 0.25);

  const g = lastSnap!.global;
  const simReqPerSec = Number((g.generated / Math.max(durationMs / 1000, 0.001)).toFixed(1));

  return {
    name,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    seed,
    runs,
    horizonMs: durationMs,
    medianWallMs: Number(medianWallMs.toFixed(2)),
    minWallMs: Number(minWallMs.toFixed(2)),
    maxWallMs: Number(maxWallMs.toFixed(2)),
    iqrWallMs: Number(iqrWallMs.toFixed(2)),
    generated: g.generated,
    succeeded: g.succeeded,
    failed: g.failed,
    timedOut: g.timedOut,
    simReqPerSec,
    processedEvents: g.processedEvents,
    medianEventsPerSec: Math.round(g.processedEvents / Math.max(medianWallMs / 1000, 0.0001)),
    allConserved,
  };
}

async function runRepeatedWorkerCleanupCheck(): Promise<{
  iterations: number;
  totalWallMs: number;
  heapDeltaMb: number;
  allConserved: boolean;
}> {
  const graph = makeThreeTierGraph(500);
  const iterations = 20;
  let allConserved = true;
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    let completedSnap: SimulationSnapshot | null = null;
    const runner = new WorkerSessionRunner((msg) => {
      if (msg.type === 'COMPLETED') {
        completedSnap = msg.snapshot;
      }
    });
    runner.handleCommand({
      type: 'INIT',
      runId: i + 1,
      graph,
      config: {
        seed: 100 + i,
        durationMs: 10_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: {
          maxEvents: 500_000,
          maxZeroTimeEvents: 10_000,
          maxHops: 64,
          maxInFlight: 100_000,
        },
      },
      scheduledFaults: [],
      speed: 100,
      visMode: 'headless',
    });
    runner.handleCommand({ type: 'START', runId: i + 1 });
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (completedSnap !== null) {
          resolve();
        } else {
          setTimeout(check, 5);
        }
      };
      setTimeout(check, 0);
    });
    const g = (completedSnap as SimulationSnapshot | null)?.global;
    if (!g || g.generated !== g.succeeded + g.failed + g.timedOut + g.inFlight) {
      allConserved = false;
    }
    runner.dispose();
  }

  const totalWallMs = Number((performance.now() - t0).toFixed(2));
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }
  const heapDeltaMb = Number(((process.memoryUsage().heapUsed - memBefore) / (1024 * 1024)).toFixed(2));
  return { iterations, totalWallMs, heapDeltaMb, allConserved };
}

async function main(): Promise<void> {
  const runs = Math.max(1, parseInt(process.env.BENCH_RUNS ?? '5', 10) || 5);
  const results: BenchmarkCaseSummary[] = [
    runBenchmarkCase(
      '1k requests · small 2-node',
      {
        nodes: [makeThreeTierGraph(100).nodes[0]!, makeThreeTierGraph(100).nodes[2]!],
        edges: [{ id: 'e1', source: 'client', target: 'app1', latencyMs: 2, routeType: 'default' }],
      },
      42,
      10_000,
      runs,
    ),
    runBenchmarkCase('10k requests · 3-tier medium (6 nodes)', makeThreeTierGraph(1000), 101, 10_000, runs),
    runBenchmarkCase(
      '100k requests · 3-tier stretch (6 nodes)',
      makeThreeTierGraph(2500),
      202,
      40_000,
      runs,
      [],
      2_500_000,
    ),
    runBenchmarkCase('25-node large topology · 5k requests', makeLarge25NodeGraph(500), 303, 10_000, runs),
    runBenchmarkCase(
      'Failure & recovery · 10k requests',
      makeThreeTierGraph(1000),
      404,
      10_000,
      runs,
      [{ id: 'f1', type: 'node_failure', targetId: 'app1', startAtMs: 3000, durationMs: 4000, value: 1 }],
    ),
    runBenchmarkCase(
      'Queue saturation overload · 10k requests',
      (() => {
        const g = makeThreeTierGraph(2000);
        for (const n of g.nodes) {
          if (n.config.type === 'app_server') {
            n.config.concurrency = 4;
            n.config.queueCapacity = 20;
          }
        }
        return g;
      })(),
      505,
      5_000,
      runs,
    ),
  ];

  console.log(
    `Environment: Node ${process.version} · ${process.platform}/${process.arch} · Warmup: 1 · Timed Runs/Case: ${runs}`,
  );
  console.log(
    'Note: medianEventsPerSec measures discrete-event simulation kernel throughput; simReqPerSec is virtual simulated workload rate (NOT production HTTP RPS).',
  );
  console.table(results);

  const workerCheck = await runRepeatedWorkerCleanupCheck();
  console.log('Repeated WorkerSessionRunner cleanup check (20 x 5k requests):', workerCheck);

  const failedConservation = results.filter((r) => !r.allConserved);
  if (failedConservation.length > 0 || !workerCheck.allConserved) {
    console.error('Request conservation failed on benchmark cases:', failedConservation);
    process.exitCode = 1;
  }
}

void main();
