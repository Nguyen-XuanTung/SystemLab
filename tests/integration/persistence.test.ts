import { beforeEach, describe, expect, it } from 'vitest';
import { SimulationEngine } from '@/engine/core/engine';
import {
  clearAllLocalData,
  deleteExperiment,
  deleteProject,
  getProject,
  listExperiments,
  listProjects,
  loadPreferences,
  saveExperiment,
  savePreferences,
  saveProject,
} from '@/features/persistence/repository';
import { BUILT_IN_SCENARIOS } from '@/features/scenarios/scenarios';
import { buildExperimentRecordFromSnapshot, safeParseExperimentJson } from '@/schemas/projectSchema';

describe('IndexedDB Persistence & Experiment Round-Trip', () => {
  beforeEach(async () => {
    await clearAllLocalData();
  });

  it('saves, lists, reads, updates, and deletes projects in IndexedDB', async () => {
    const p1 = BUILT_IN_SCENARIOS[0]!.createProject();
    await saveProject(p1);

    const loaded = await getProject(p1.id);
    expect(loaded?.name).toBe(p1.name);

    const all = await listProjects();
    expect(all).toHaveLength(1);

    await deleteProject(p1.id);
    expect(await listProjects()).toHaveLength(0);
  });

  it('persists and round-trips immutable ExperimentRecord snapshots through JSON export/import', async () => {
    const proj = BUILT_IN_SCENARIOS[1]!.createProject();
    const graph = {
      nodes: proj.nodes.map((n) => ({ id: n.id, label: n.label, config: n.config })),
      edges: proj.edges,
    };
    const snap = new SimulationEngine(graph, { ...proj.simConfig, durationMs: 3000 }).runToCompletion();
    const record = buildExperimentRecordFromSnapshot({
      id: 'exp-1',
      name: 'Baseline Horizontal',
      project: proj,
      config: { ...proj.simConfig, durationMs: 3000 },
      snapshot: snap,
    });

    await saveExperiment(record);
    const exps = await listExperiments();
    expect(exps).toHaveLength(1);
    expect(exps[0]!.summaryMetrics.succeeded).toBe(snap.global.succeeded);

    const exported = JSON.stringify(exps[0]);
    const reimported = safeParseExperimentJson(exported);
    expect(reimported.ok).toBe(true);
    expect(reimported.data?.seed).toBe(proj.simConfig.seed);

    await deleteExperiment('exp-1');
    expect(await listExperiments()).toHaveLength(0);
  });

  it('saves and loads user preferences cleanly', () => {
    savePreferences({
      theme: 'light',
      visMode: 'reduced_motion',
      snapToGrid: false,
      tutorialDismissed: true,
    });
    const prefs = loadPreferences();
    expect(prefs).toEqual({
      theme: 'light',
      visMode: 'reduced_motion',
      snapToGrid: false,
      tutorialDismissed: true,
    });
  });
});
