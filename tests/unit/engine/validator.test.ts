import { describe, expect, it } from 'vitest';
import { MAX_NODES, validateGraph } from '@/engine/validation/validator';
import type { ArchitectureGraph } from '@/engine/models/types';

function makeValidBase(): ArchitectureGraph {
  return {
    nodes: [
      {
        id: 'c',
        label: 'Client',
        config: {
          type: 'client',
          ratePerSecond: 10,
          workloadPattern: 'constant',
          burstMultiplier: 2,
          burstDurationMs: 500,
          burstPeriodMs: 1000,
          readRatio: 0.8,
          timeoutMs: 1000,
        },
      },
      {
        id: 'app',
        label: 'App',
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
    edges: [{ id: 'e1', source: 'c', target: 'app', latencyMs: 2, routeType: 'default' }],
  };
}

describe('Graph & Configuration Validator', () => {
  it('accepts a valid minimal graph', () => {
    const res = validateGraph(makeValidBase(), {
      seed: 1,
      durationMs: 5000,
      drainOnEnd: true,
      maxDrainMs: 5000,
      safetyLimits: { maxEvents: 1000, maxZeroTimeEvents: 100, maxHops: 16, maxInFlight: 1000 },
    });
    expect(res.valid).toBe(true);
    expect(res.issues).toHaveLength(0);
  });

  it('rejects empty graph, missing client, duplicate IDs, dangling edges, and self loops', () => {
    expect(validateGraph({ nodes: [], edges: [] }).valid).toBe(false);

    const noClient = makeValidBase();
    noClient.nodes = [noClient.nodes[1]!];
    noClient.edges = [];
    const noClientRes = validateGraph(noClient);
    expect(noClientRes.valid).toBe(false);
    expect(noClientRes.issues.some((i) => i.code === 'MISSING_TRAFFIC_SOURCE')).toBe(true);

    const dupGraph = makeValidBase();
    dupGraph.nodes.push({ ...dupGraph.nodes[1]! });
    dupGraph.edges.push({ ...dupGraph.edges[0]! });
    const dupRes = validateGraph(dupGraph);
    expect(dupRes.issues.some((i) => i.code === 'DUPLICATE_NODE_ID')).toBe(true);
    expect(dupRes.issues.some((i) => i.code === 'DUPLICATE_EDGE_ID')).toBe(true);

    const badEdge = makeValidBase();
    badEdge.edges.push({ id: 'e-bad', source: 'app', target: 'missing', latencyMs: -5, routeType: 'default' });
    badEdge.edges.push({ id: 'e-loop', source: 'app', target: 'app', latencyMs: 1, routeType: 'default' });
    const badEdgeRes = validateGraph(badEdge);
    expect(badEdgeRes.issues.some((i) => i.code === 'DANGLING_EDGE')).toBe(true);
    expect(badEdgeRes.issues.some((i) => i.code === 'NEGATIVE_EDGE_LATENCY')).toBe(true);
    expect(badEdgeRes.issues.some((i) => i.code === 'SELF_LOOP')).toBe(true);
  });

  it('detects directed multi-node cycles cleanly', () => {
    const g = makeValidBase();
    g.nodes.push({
      id: 'app2',
      label: 'App 2',
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
    });
    g.edges.push({ id: 'e2', source: 'app', target: 'app2', latencyMs: 1, routeType: 'default' });
    g.edges.push({ id: 'e3', source: 'app2', target: 'app', latencyMs: 1, routeType: 'default' });

    const res = validateGraph(g);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === 'DIRECTED_CYCLE')).toBe(true);
  });

  it('rejects invalid numeric inputs (negative, NaN, out-of-range probabilities) and oversize graphs', () => {
    const g = makeValidBase();
    if (g.nodes[0]!.config.type === 'client') {
      g.nodes[0]!.config.ratePerSecond = Number.NaN;
      g.nodes[0]!.config.timeoutMs = -10;
      g.nodes[0]!.config.readRatio = 1.5;
    }
    if (g.nodes[1]!.config.type === 'app_server') {
      g.nodes[1]!.config.concurrency = 0;
      g.nodes[1]!.config.maxRetries = 10;
    }
    const res = validateGraph(g);
    expect(res.valid).toBe(false);
    expect(res.issues.length).toBeGreaterThanOrEqual(5);

    const big = makeValidBase();
    for (let i = 0; i < MAX_NODES + 5; i += 1) {
      big.nodes.push({
        id: `extra-${i}`,
        label: `Extra ${i}`,
        config: {
          type: 'app_server',
          concurrency: 1,
          queueCapacity: 1,
          serviceTimeMs: 10,
          distribution: 'fixed',
          cv: 0.5,
          failureProbability: 0,
          maxRetries: 0,
          retryDelayMs: 10,
        },
      });
    }
    expect(validateGraph(big).issues.some((i) => i.code === 'MAX_NODES_EXCEEDED')).toBe(true);
  });

  it('emits non-blocking warnings for unreachable nodes and message queues without workers', () => {
    const g = makeValidBase();
    g.nodes.push({
      id: 'mq',
      label: 'Lonely Queue',
      config: { type: 'message_queue', queueCapacity: 50, enqueueLatencyMs: 2, deliveryMode: 'async_ack' },
    });
    g.edges.push({ id: 'e-mq', source: 'app', target: 'mq', latencyMs: 1, routeType: 'default' });
    g.nodes.push({
      id: 'orphan',
      label: 'Orphan Worker',
      config: {
        type: 'worker',
        concurrency: 2,
        processingTimeMs: 20,
        distribution: 'fixed',
        cv: 0.4,
        failureProbability: 0,
      },
    });

    const res = validateGraph(g);
    expect(res.valid).toBe(true);
    expect(res.issues.some((i) => i.severity === 'warning' && i.code === 'MQ_WITHOUT_WORKER')).toBe(true);
    expect(res.issues.some((i) => i.severity === 'warning' && i.code === 'UNREACHABLE_NODE')).toBe(true);
    expect(res.issues.some((i) => i.severity === 'warning' && i.code === 'DISCONNECTED_WORKER')).toBe(true);
  });

  it('validates config constraints across gateway, cache, database, worker, circuit breaker, replica, and simConfig', () => {
    const g: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 10,
            workloadPattern: 'constant',
            burstMultiplier: 0.5,
            burstDurationMs: 1000,
            burstPeriodMs: 500,
            readRatio: 0.5,
            timeoutMs: 1000,
          },
        },
        {
          id: 'lb',
          label: 'LB',
          config: { type: 'load_balancer', strategy: 'round_robin', processingLatencyMs: -1, healthCheckEnabled: true },
        },
        {
          id: 'gw',
          label: 'GW',
          config: {
            type: 'api_gateway',
            processingLatencyMs: -2,
            rateLimitEnabled: true,
            rateLimitRps: 0,
            burstCapacity: 0,
            routingMode: 'default',
          },
        },
        {
          id: 'cache',
          label: 'Cache',
          config: {
            type: 'cache',
            lookupLatencyMs: -1,
            hitProbability: 2,
            writePolicy: 'write_through',
            coldStartWarmupMs: -10,
          },
        },
        {
          id: 'db',
          label: 'DB',
          config: {
            type: 'database',
            maxConnections: 0,
            queueCapacity: -1,
            readLatencyMs: 0,
            writeLatencyMs: -5,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 1.5,
          },
        },
        {
          id: 'mq',
          label: 'MQ',
          config: { type: 'message_queue', queueCapacity: 0, enqueueLatencyMs: -1, deliveryMode: 'async_ack' },
        },
        {
          id: 'w',
          label: 'Worker',
          config: {
            type: 'worker',
            concurrency: 0,
            processingTimeMs: 0,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: -0.1,
          },
        },
        {
          id: 'cb',
          label: 'CB',
          config: {
            type: 'circuit_breaker',
            failureThreshold: 0,
            openDurationMs: 0,
            halfOpenMaxProbes: 0,
            processingLatencyMs: -1,
          },
        },
        {
          id: 'rr',
          label: 'RR',
          config: {
            type: 'read_replica',
            maxConnections: 0,
            queueCapacity: -1,
            readLatencyMs: 0,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 2,
          },
        },
      ],
      edges: [],
    };

    const res = validateGraph(g, {
      seed: Number.NaN,
      durationMs: 0,
      drainOnEnd: true,
      maxDrainMs: 1000,
      safetyLimits: { maxEvents: 1000, maxZeroTimeEvents: 100, maxHops: 16, maxInFlight: 1000 },
    });
    expect(res.valid).toBe(false);
    const codes = new Set(res.issues.map((i) => i.code));
    expect(codes.has('INVALID_SIM_DURATION')).toBe(true);
    expect(codes.has('INVALID_SEED')).toBe(true);
    expect(codes.has('INVALID_BURST_MULT')).toBe(true);
    expect(codes.has('INVALID_BURST_WINDOW')).toBe(true);
    expect(codes.has('INVALID_RATE_LIMIT')).toBe(true);
    expect(codes.has('INVALID_HIT_PROB')).toBe(true);
    expect(codes.has('CACHE_MISSING_ORIGIN')).toBe(true);
    expect(codes.has('INVALID_DB_LATENCY')).toBe(true);
    expect(codes.has('INVALID_CB_THRESHOLD')).toBe(true);
    expect(codes.has('MISSING_DOWNSTREAM')).toBe(true);
  });
});
