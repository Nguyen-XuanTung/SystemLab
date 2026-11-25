import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '@/engine/core/engine';
import { validateGraph } from '@/engine/validation/validator';
import { BUILT_IN_SCENARIOS } from '@/features/scenarios/scenarios';
import { SYSTEM_DESIGN_GLOSSARY } from '@/features/scenarios/glossary';
import { buildExperimentRecordFromSnapshot } from '@/schemas/projectSchema';
import { computeFairnessWarnings } from '@/store/experimentStore';

describe('Built-in Scenario Library (10 Core + 4 VCraft Scenarios)', () => {
  it('ships 14 complete scenarios that pass validation and preserve request conservation', () => {
    expect(BUILT_IN_SCENARIOS).toHaveLength(14);
    expect(BUILT_IN_SCENARIOS.filter((s) => (s.collection ?? 'core') === 'core')).toHaveLength(10);
    expect(BUILT_IN_SCENARIOS.filter((s) => s.collection === 'vcraft')).toHaveLength(4);

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

  it('models VCraft Current, Peak, Scaled, and Failure/Recovery case studies with fair A/B comparison semantics', () => {
    const runById = (id: string) => {
      const scenario = BUILT_IN_SCENARIOS.find((s) => s.id === id);
      expect(scenario).toBeDefined();
      const proj = scenario!.createProject();
      const graph = {
        nodes: proj.nodes.map((n) => ({ id: n.id, label: n.label, config: n.config })),
        edges: proj.edges,
      };
      const snap = new SimulationEngine(
        graph,
        proj.simConfig,
        proj.scheduledFaults,
      ).runToCompletion();
      const exp = buildExperimentRecordFromSnapshot({
        id: `exp-${id}`,
        name: scenario!.title,
        project: proj,
        config: proj.simConfig,
        snapshot: snap,
      });
      return { proj, snap, exp };
    };

    const cur = runById('vcraft-01-current-architecture');
    const peak = runById('vcraft-02-peak-traffic');
    const scaled = runById('vcraft-03-scaled-architecture');
    const fail = runById('vcraft-04-failure-recovery');

    // Current baseline runs cleanly without collapse
    expect(cur.snap.global.errorRate ?? 0).toBeLessThan(0.05);
    expect(cur.snap.nodeMetrics['vcraft-backend']!.utilization).toBeGreaterThan(0.1);
    expect(cur.snap.nodeMetrics['vcraft-mysql']!.utilization).toBeGreaterThan(0.1);

    // Peak traffic generates more load and degrades queue/P95 relative to Current
    expect(peak.snap.global.generated).toBeGreaterThan(cur.snap.global.generated);
    expect(peak.snap.global.p95LatencyMs!).toBeGreaterThan(cur.snap.global.p95LatencyMs!);
    expect(peak.snap.nodeMetrics['vcraft-backend']!.maxQueueDepthObserved).toBeGreaterThanOrEqual(
      cur.snap.nodeMetrics['vcraft-backend']!.maxQueueDepthObserved,
    );

    // Scaled proposal uses cache & reduces MySQL load + P95 latency with ZERO fairness warnings vs Current
    expect(scaled.snap.nodeMetrics['vcraft-cache']!.cacheHits).toBeGreaterThan(0);
    expect(scaled.snap.nodeMetrics['vcraft-mysql']!.utilization).toBeLessThan(
      cur.snap.nodeMetrics['vcraft-mysql']!.utilization,
    );
    expect(scaled.snap.global.p95LatencyMs!).toBeLessThan(cur.snap.global.p95LatencyMs!);
    expect(computeFairnessWarnings(cur.exp, scaled.exp)).toEqual([]);

    // Peak vs Current triggers scheduled traffic_spike fairness warning
    const peakWarnings = computeFairnessWarnings(cur.exp, peak.exp);
    expect(peakWarnings.some((w) => /traffic spike/i.test(w))).toBe(true);

    // Failure & recovery incurs transient errors and recovers cleanly after faults expire
    expect(fail.snap.global.failed + fail.snap.global.timedOut).toBeGreaterThan(0);
    expect(fail.snap.nodeMetrics['vcraft-backend']!.status).toBe('healthy');
    expect(fail.snap.nodeMetrics['vcraft-mysql']!.status).toBe('healthy');
  });
});
