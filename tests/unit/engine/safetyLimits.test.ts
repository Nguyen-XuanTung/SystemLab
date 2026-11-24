import { describe, expect, it } from 'vitest';
import { GraphValidationError, SimulationEngine } from '@/engine/core/engine';
import type { ArchitectureGraph } from '@/engine/models/types';

function makeSimpleGraph(ratePerSecond = 50, serviceTimeMs = 100): ArchitectureGraph {
  return {
    nodes: [
      {
        id: 'c',
        label: 'Client',
        config: {
          type: 'client',
          ratePerSecond,
          workloadPattern: 'constant',
          burstMultiplier: 1,
          burstDurationMs: 100,
          burstPeriodMs: 200,
          readRatio: 1,
          timeoutMs: 10_000,
        },
      },
      {
        id: 's',
        label: 'Server',
        config: {
          type: 'app_server',
          concurrency: 1,
          queueCapacity: 500,
          serviceTimeMs,
          distribution: 'fixed',
          cv: 0.5,
          failureProbability: 0,
          maxRetries: 0,
          retryDelayMs: 50,
        },
      },
    ],
    edges: [{ id: 'e1', source: 'c', target: 's', latencyMs: 0, routeType: 'default' }],
  };
}

describe('Engine Safety Limits & Error Guardrails', () => {
  it('throws GraphValidationError when constructed with an invalid topology', () => {
    expect(() => new SimulationEngine({ nodes: [], edges: [] }, { seed: 1, durationMs: 1000 })).toThrow(
      GraphValidationError,
    );
  });

  it('halts cleanly when maxEvents safety ceiling is exceeded', () => {
    const engine = new SimulationEngine(makeSimpleGraph(50, 10), {
      seed: 1,
      durationMs: 10_000,
      safetyLimits: {
        maxEvents: 40,
        maxZeroTimeEvents: 1000,
        maxHops: 32,
        maxInFlight: 1000,
      },
    });
    const snap = engine.runToCompletion();
    expect(snap.status).toBe('halted_safety');
    expect(snap.haltReason).toContain('processed events exceeded 40');
    expect(snap.global.generated).toBe(
      snap.global.succeeded + snap.global.failed + snap.global.timedOut + snap.global.inFlight,
    );
  });

  it('halts cleanly when maxInFlight safety ceiling is exceeded', () => {
    const engine = new SimulationEngine(makeSimpleGraph(200, 5000), {
      seed: 1,
      durationMs: 5000,
      safetyLimits: {
        maxEvents: 50_000,
        maxZeroTimeEvents: 1000,
        maxHops: 32,
        maxInFlight: 25,
      },
    });
    const snap = engine.runToCompletion();
    expect(snap.status).toBe('halted_safety');
    expect(snap.haltReason).toContain('in-flight requests exceeded 25');
  });

  it('halts cleanly when maxZeroTimeEvents loop limit is reached', () => {
    // Multiple concurrent zero-latency retries at t=0 trigger zero-time loop protection cleanly
    const g: ArchitectureGraph = {
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
            readRatio: 1,
            timeoutMs: 1000,
          },
        },
        {
          id: 'cache',
          label: 'Zero Latency Cache',
          config: {
            type: 'cache',
            lookupLatencyMs: 0,
            hitProbability: 1,
            writePolicy: 'bypass',
            coldStartWarmupMs: 0,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'c', target: 'cache', latencyMs: 0, routeType: 'default' }],
    };

    const engine = new SimulationEngine(g, {
      seed: 1,
      durationMs: 5000,
      safetyLimits: {
        maxEvents: 10_000,
        maxZeroTimeEvents: 2,
        maxHops: 32,
        maxInFlight: 1000,
      },
    });
    const snap = engine.runToCompletion();
    expect(snap.status).toBe('halted_safety');
    expect(snap.haltReason).toContain('possible zero-time loop');
  });

  it('enforces maxHops safety limit across deep multi-tier pipelines', () => {
    const deepGraph: ArchitectureGraph = {
      nodes: [
        {
          id: 'c',
          label: 'Client',
          config: {
            type: 'client',
            ratePerSecond: 2,
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
          config: { type: 'load_balancer', strategy: 'round_robin', processingLatencyMs: 1, healthCheckEnabled: true },
        },
        {
          id: 'gw',
          label: 'GW',
          config: {
            type: 'api_gateway',
            processingLatencyMs: 1,
            rateLimitEnabled: false,
            rateLimitRps: 100,
            burstCapacity: 10,
            routingMode: 'default',
          },
        },
        {
          id: 'app',
          label: 'App',
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 5,
            serviceTimeMs: 5,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 10,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'c', target: 'lb', latencyMs: 1, routeType: 'default' },
        { id: 'e2', source: 'lb', target: 'gw', latencyMs: 1, routeType: 'default' },
        { id: 'e3', source: 'gw', target: 'app', latencyMs: 1, routeType: 'default' },
      ],
    };

    const snap = new SimulationEngine(deepGraph, {
      seed: 1,
      durationMs: 1000,
      safetyLimits: { maxEvents: 1000, maxZeroTimeEvents: 100, maxHops: 2, maxInFlight: 100 },
    }).runToCompletion();
    expect(snap.global.failed).toBe(2);
    expect(snap.recentTraces[0]?.errorCategory).toBe('MAX_HOPS_EXCEEDED');
  });
});
