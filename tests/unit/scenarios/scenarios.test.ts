import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '@/engine/core/engine';
import { validateGraph } from '@/engine/validation/validator';
import { BUILT_IN_SCENARIOS } from '@/features/scenarios/scenarios';
import { SYSTEM_DESIGN_GLOSSARY } from '@/features/scenarios/glossary';

describe('Built-in Scenario Library (10 Verified Scenarios)', () => {
  it('ships 10 complete scenarios that pass validation and preserve request conservation', () => {
    expect(BUILT_IN_SCENARIOS.length).toBeGreaterThanOrEqual(10);

    const resultsById = new Map<string, ReturnType<SimulationEngine['runToCompletion']>>();

    for (const scenario of BUILT_IN_SCENARIOS) {
      const proj = scenario.createProject();
      const graph = {
        nodes: proj.nodes.map((n) => ({ id: n.id, label: n.label, config: n.config })),
        edges: proj.edges,
      };
      const val = validateGraph(graph, proj.simConfig);
      expect(val.valid).toBe(true);
      expect(val.issues.filter((i) => i.severity === 'error')).toHaveLength(0);

      const snap = new SimulationEngine(
        graph,
        proj.simConfig,
        proj.scheduledFaults,
      ).runToCompletion();
      expect(snap.status).toBe('completed');
      expect(snap.global.generated).toBeGreaterThan(0);
      expect(snap.global.generated).toBe(
        snap.global.succeeded + snap.global.failed + snap.global.timedOut + snap.global.inFlight,
      );
      resultsById.set(scenario.id, snap);
    }

    // Qualitative behavioral checks per scenario design
    const s03 = resultsById.get('scenario-03-caching-fundamentals')!;
    expect(s03.nodeMetrics['cache-1']!.cacheHits).toBeGreaterThan(0);

    const s04 = resultsById.get('scenario-04-database-bottleneck')!;
    expect(s04.nodeMetrics['db-1']!.utilization).toBeGreaterThan(0.8);

    const s05 = resultsById.get('scenario-05-rate-limiting')!;
    expect(s05.nodeMetrics['gw-1']!.rateLimitedCount).toBeGreaterThan(0);

    const s06 = resultsById.get('scenario-06-async-processing')!;
    expect(s06.nodeMetrics['mq-1']!.jobsCompleted).toBeGreaterThan(0);

    const s08 = resultsById.get('scenario-08-failure-and-recovery')!;
    expect(s08.nodeMetrics['app-2']!.status).toBe('healthy');
    expect(s08.global.succeeded).toBeGreaterThan(0);

    const s09 = resultsById.get('scenario-09-circuit-breaker')!;
    expect(s09.nodeMetrics['cb-1']!.circuitRejections).toBeGreaterThan(0);

    const s10 = resultsById.get('scenario-10-read-replica-split')!;
    expect(s10.nodeMetrics['rr-1']!.dbReads).toBeGreaterThan(s10.nodeMetrics['db-1']!.dbWrites);
  });

  it('glossary covers >=12 core terms linked to real scenarios', () => {
    expect(SYSTEM_DESIGN_GLOSSARY.length).toBeGreaterThanOrEqual(12);
    const scenarioIds = new Set(BUILT_IN_SCENARIOS.map((s) => s.id));
    for (const entry of SYSTEM_DESIGN_GLOSSARY) {
      if (entry.relatedScenarioId) {
        expect(scenarioIds.has(entry.relatedScenarioId)).toBe(true);
      }
    }
  });
});
