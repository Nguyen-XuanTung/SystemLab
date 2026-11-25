import { useState } from 'react';
import { Layers, Play } from 'lucide-react';
import { BUILT_IN_SCENARIOS, type ScenarioCollection, type ScenarioDifficulty } from './scenarios';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function ScenarioLibraryView() {
  const [collectionFilter, setCollectionFilter] = useState<'all' | ScenarioCollection>('all');
  const [difficulty, setDifficulty] = useState<'All' | ScenarioDifficulty>('All');
  const loadScenario = useWorkspaceStore((s) => s.loadScenario);
  const reset = useSimulationStore((s) => s.reset);

  const coreCount = BUILT_IN_SCENARIOS.filter((s) => (s.collection ?? 'core') === 'core').length;
  const vcraftCount = BUILT_IN_SCENARIOS.filter((s) => s.collection === 'vcraft').length;

  const filtered = BUILT_IN_SCENARIOS.filter((s) => {
    const col = s.collection ?? 'core';
    const matchCol = collectionFilter === 'all' || col === collectionFilter;
    const matchDiff = difficulty === 'All' || s.difficulty === difficulty;
    return matchCol && matchDiff;
  });

  const handleOpenScenario = (scenarioId: string): void => {
    reset();
    loadScenario(scenarioId);
  };

  return (
    <main className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div
          className="flex flex-wrap items-end justify-between gap-3 border-b pb-4"
          style={{ borderColor: 'var(--sl-border-subtle)' }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--sl-text-primary)' }}>
              Built-in Scenario Library
            </h1>
            <p className="mt-1 text-xs" style={{ color: 'var(--sl-text-secondary)' }}>
              {BUILT_IN_SCENARIOS.length} interactive topologies ({coreCount} core
              distributed-systems scenarios &amp; {vcraftCount} VCraft case study architectures).
              Every metric is simulated live by the discrete-event engine.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: `All (${BUILT_IN_SCENARIOS.length})` },
                  { id: 'core', label: `Core (${coreCount})` },
                  { id: 'vcraft', label: `VCraft Case Study (${vcraftCount})` },
                ] as const
              ).map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setCollectionFilter(col.id)}
                  className="rounded border px-2.5 py-1 font-medium"
                  style={{
                    backgroundColor:
                      collectionFilter === col.id
                        ? 'var(--sl-btn-primary-bg)'
                        : 'var(--sl-bg-surface)',
                    borderColor:
                      collectionFilter === col.id
                        ? 'var(--sl-btn-primary-bg)'
                        : 'var(--sl-border-default)',
                    color: collectionFilter === col.id ? 'white' : 'var(--sl-text-secondary)',
                  }}
                >
                  {col.label}
                </button>
              ))}
            </div>

            <span className="h-4 w-px" style={{ backgroundColor: 'var(--sl-border-subtle)' }} />

            <div className="flex items-center gap-1">
              {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  className="rounded border px-2.5 py-1 font-medium"
                  style={{
                    backgroundColor:
                      difficulty === level ? 'var(--sl-btn-routing-bg)' : 'var(--sl-bg-surface)',
                    borderColor:
                      difficulty === level
                        ? 'var(--sl-btn-routing-bg)'
                        : 'var(--sl-border-default)',
                    color: difficulty === level ? 'white' : 'var(--sl-text-secondary)',
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* VCraft Featured Real-world Case Study Banner */}
        {collectionFilter !== 'core' && (
          <section
            aria-label="VCraft — Real-world Architecture Case Study"
            className="rounded-lg border p-4"
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-accent-routing)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 max-w-3xl">
                <div
                  className="inline-flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: 'var(--sl-accent-routing)' }}
                >
                  <Layers className="h-3.5 w-3.5" />
                  VCraft — Real-world Architecture Case Study (Educational Simulation)
                </div>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: 'var(--sl-text-secondary)' }}
                >
                  Explore how the verified{' '}
                  <span style={{ color: 'var(--sl-text-primary)', fontWeight: 600 }}>
                    React SPA → Nginx Proxy → Spring Boot → MySQL 8.4
                  </span>{' '}
                  architecture from VCraft behaves under normal traffic, 3x peak bursts, a proposed
                  horizontally scaled cache/LB topology, and injected faults. Parameters are{' '}
                  <strong>educational simulation assumptions</strong>, not production benchmarks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenScenario('vcraft-01-current-architecture')}
                className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white shrink-0"
                style={{ backgroundColor: 'var(--sl-btn-routing-bg)' }}
              >
                <Play className="h-3.5 w-3.5" />
                Explore VCraft Architecture
              </button>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((scenario) => {
            const proj = scenario.createProject();
            return (
              <article
                key={scenario.id}
                className="flex flex-col justify-between rounded-lg border p-4"
                style={{
                  backgroundColor: 'var(--sl-bg-surface)',
                  borderColor: 'var(--sl-border-default)',
                }}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className="font-mono-tabular text-xs font-semibold"
                      style={{ color: 'var(--sl-accent-traffic)' }}
                    >
                      Scenario {scenario.number} · {scenario.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {scenario.architectureType === 'verified_current' && (
                        <span
                          className="rounded border px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            borderColor: 'var(--sl-accent-success)',
                            color: 'var(--sl-accent-success)',
                          }}
                        >
                          Verified Current
                        </span>
                      )}
                      {scenario.architectureType === 'proposed_scaled' && (
                        <span
                          className="rounded border px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            borderColor: 'var(--sl-accent-warning)',
                            color: 'var(--sl-accent-warning)',
                          }}
                        >
                          Proposed Scaled
                        </span>
                      )}
                      <span
                        className="rounded border px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          borderColor: 'var(--sl-border-default)',
                          color: 'var(--sl-text-secondary)',
                        }}
                      >
                        {scenario.difficulty}
                      </span>
                    </div>
                  </div>

                  <h2
                    className="text-base font-semibold"
                    style={{ color: 'var(--sl-text-primary)' }}
                  >
                    {scenario.title}
                  </h2>

                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: 'var(--sl-text-secondary)' }}
                  >
                    {scenario.educationalObjective}
                  </p>

                  <div
                    className="rounded border p-2.5 text-[11px] space-y-1"
                    style={{
                      backgroundColor: 'var(--sl-bg-elevated)',
                      borderColor: 'var(--sl-border-subtle)',
                    }}
                  >
                    <div style={{ color: 'var(--sl-text-primary)' }}>
                      <strong>Suggested Experiment:</strong> {scenario.suggestedExperiment}
                    </div>
                    <div style={{ color: 'var(--sl-text-muted)' }}>
                      <strong>Expected Behavior:</strong> {scenario.expectedBehavior}
                    </div>
                  </div>
                </div>

                <div
                  className="mt-4 flex items-center justify-between border-t pt-3 text-xs"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <span
                    className="font-mono-tabular text-[11px]"
                    style={{ color: 'var(--sl-text-muted)' }}
                  >
                    {proj.nodes.length} nodes · {proj.edges.length} edges ·{' '}
                    {proj.scheduledFaults.length} faults
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenScenario(scenario.id)}
                    className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: 'var(--sl-btn-primary-bg)' }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Open in Workspace
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
