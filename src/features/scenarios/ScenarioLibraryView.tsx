import { useState } from 'react';
import { Play } from 'lucide-react';
import { BUILT_IN_SCENARIOS, type ScenarioDifficulty } from './scenarios';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function ScenarioLibraryView() {
  const [difficulty, setDifficulty] = useState<'All' | ScenarioDifficulty>('All');
  const loadScenario = useWorkspaceStore((s) => s.loadScenario);
  const reset = useSimulationStore((s) => s.reset);

  const filtered = BUILT_IN_SCENARIOS.filter(
    (s) => difficulty === 'All' || s.difficulty === difficulty,
  );

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
              Ten verified interactive topologies demonstrating core distributed-systems behavior.
              Every metric is simulated live by the discrete-event engine.
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {(['All', 'Beginner', 'Intermediate', 'Advanced'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                className="rounded border px-2.5 py-1 font-medium"
                style={{
                  backgroundColor:
                    difficulty === level ? 'var(--sl-accent-traffic)' : 'var(--sl-bg-surface)',
                  borderColor:
                    difficulty === level ? 'var(--sl-accent-traffic)' : 'var(--sl-border-default)',
                  color: difficulty === level ? 'white' : 'var(--sl-text-secondary)',
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

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
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-mono-tabular text-xs font-semibold"
                      style={{ color: 'var(--sl-accent-traffic)' }}
                    >
                      Scenario {scenario.number} · {scenario.category}
                    </span>
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
                    onClick={() => {
                      reset();
                      loadScenario(scenario.id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: 'var(--sl-accent-traffic)' }}
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
