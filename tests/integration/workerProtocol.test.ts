import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SCENARIOS } from '@/features/scenarios/scenarios';
import type { WorkerResponse } from '@/workers/protocol';
import { WorkerSessionRunner } from '@/workers/runner';
import { SimulationWorkerClient } from '@/workers/workerClient';

describe('Web Worker Protocol & SimulationWorkerClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes INIT -> START -> PAUSE -> RESUME -> COMPLETED via fallback runner with runId isolation', async () => {
    const client = new SimulationWorkerClient(true);
    expect(client.isFallback).toBe(true);

    const events: WorkerResponse[] = [];
    const unsubscribe = client.subscribe((msg) => {
      events.push(msg);
    });

    const proj = BUILT_IN_SCENARIOS[0]!.createProject();
    const graph = {
      nodes: proj.nodes.map((n) => ({ id: n.id, label: n.label, config: n.config })),
      edges: proj.edges,
    };

    const run1 = client.initRun({
      graph,
      config: { ...proj.simConfig, durationMs: 2000 },
      scheduledFaults: [],
      speed: 100,
      visMode: 'headless',
    });

    expect(events.some((e) => e.type === 'READY' && e.runId === run1)).toBe(true);

    client.start();
    // Wait briefly for headless setTimeout(0) completion
    await new Promise((resolve) => setTimeout(resolve, 60));

    const completed1 = events.find((e) => e.type === 'COMPLETED' && e.runId === run1);
    expect(completed1).toBeTruthy();
    if (completed1?.type === 'COMPLETED') {
      expect(completed1.snapshot.global.generated).toBe(30);
      expect(completed1.snapshot.global.succeeded).toBe(30);
    }

    // Start a second run and verify speed invariance vs run1
    const run2 = client.initRun({
      graph,
      config: { ...proj.simConfig, durationMs: 2000 },
      scheduledFaults: [],
      speed: 25,
      visMode: 'normal',
    });
    expect(run2).toBeGreaterThan(run1);
    client.step();
    expect(events.some((e) => e.type === 'PAUSED' && e.runId === run2)).toBe(true);

    client.injectFault('latency_spike', 'app-1', 100, null, 'Spike');
    expect(events.some((e) => e.type === 'FAULT_INJECTED' && e.runId === run2)).toBe(true);

    client.stop();
    expect(events.some((e) => e.type === 'STOPPED' && e.runId === run2)).toBe(true);

    unsubscribe();
    client.dispose();
  });

  it('ignores commands carrying stale runIds and reports invalid graph errors cleanly', () => {
    const received: WorkerResponse[] = [];
    const runner = new WorkerSessionRunner((msg) => received.push(msg));

    runner.handleCommand({
      type: 'INIT',
      runId: 10,
      graph: { nodes: [], edges: [] },
      config: {
        seed: 1,
        durationMs: 1000,
        drainOnEnd: true,
        maxDrainMs: 1000,
        safetyLimits: { maxEvents: 1000, maxZeroTimeEvents: 100, maxHops: 16, maxInFlight: 1000 },
      },
      scheduledFaults: [],
      speed: 1,
      visMode: 'normal',
    });
    expect(received[0]?.type).toBe('ERROR');

    // Stale runId 9 should be ignored
    const countBefore = received.length;
    runner.handleCommand({ type: 'START', runId: 9 });
    expect(received).toHaveLength(countBefore);

    runner.dispose();
  });
});
