import { useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { SYSTEM_DESIGN_GLOSSARY } from './glossary';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function GlossaryView() {
  const [query, setQuery] = useState('');
  const loadScenario = useWorkspaceStore((s) => s.loadScenario);
  const reset = useSimulationStore((s) => s.reset);

  const filtered = SYSTEM_DESIGN_GLOSSARY.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.term.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.intuition.toLowerCase().includes(q)
    );
  });

  return (
    <main className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div
          className="flex flex-wrap items-end justify-between gap-3 border-b pb-4"
          style={{ borderColor: 'var(--sl-border-subtle)' }}
        >
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--sl-text-primary)' }}>
              System Design Glossary
            </h1>
            <p className="mt-1 text-xs" style={{ color: 'var(--sl-text-secondary)' }}>
              Key distributed systems and queueing concepts explained alongside live SystemLab
              experiments.
            </p>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: 'var(--sl-text-muted)' }}
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search concepts..."
              aria-label="Search glossary concepts"
              className="w-64 rounded border py-1.5 pr-2 pl-8 text-xs"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((entry) => (
            <article
              key={entry.id}
              className="flex flex-col justify-between rounded-lg border p-4"
              style={{
                backgroundColor: 'var(--sl-bg-surface)',
                borderColor: 'var(--sl-border-default)',
              }}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
                    {entry.term}
                  </h2>
                  <span
                    className="rounded border px-1.5 py-0.5 text-[11px]"
                    style={{
                      borderColor: 'var(--sl-border-subtle)',
                      color: 'var(--sl-text-muted)',
                    }}
                  >
                    {entry.category}
                  </span>
                </div>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: 'var(--sl-text-secondary)' }}
                >
                  {entry.summary}
                </p>
                {entry.formula && (
                  <div
                    className="rounded border px-2.5 py-1.5 font-mono-tabular text-[11px]"
                    style={{
                      backgroundColor: 'var(--sl-bg-elevated)',
                      borderColor: 'var(--sl-border-subtle)',
                      color: 'var(--sl-accent-traffic)',
                    }}
                  >
                    {entry.formula}
                  </div>
                )}
                <p className="text-xs" style={{ color: 'var(--sl-text-muted)' }}>
                  <strong>Intuition:</strong> {entry.intuition}
                </p>
              </div>

              {entry.relatedScenarioId && (
                <div
                  className="mt-3 pt-2 border-t"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      loadScenario(entry.relatedScenarioId!);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--sl-accent-traffic)' }}
                  >
                    Try in related scenario <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
