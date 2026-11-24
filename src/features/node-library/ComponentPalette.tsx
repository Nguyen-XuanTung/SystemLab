import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  CATEGORY_LABELS,
  COMPONENT_DEFINITIONS,
  COMPONENT_TYPE_LIST,
  type NodeCategory,
} from '@/engine/models/nodeRegistry';
import type { ComponentType } from '@/engine/models/types';
import { ComponentIcon } from '@/components/ui/ComponentIcon';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const CATEGORY_ORDER: NodeCategory[] = [
  'clients',
  'networking',
  'compute',
  'caching',
  'storage',
  'messaging',
];

export function ComponentPalette() {
  const [query, setQuery] = useState('');
  const addNode = useWorkspaceStore((s) => s.addNode);
  const simStatus = useSimulationStore((s) => s.status);
  const locked = simStatus === 'running' || simStatus === 'paused';

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORY_ORDER.map((category) => {
      const items = COMPONENT_TYPE_LIST.map((type) => COMPONENT_DEFINITIONS[type]).filter(
        (def) =>
          def.category === category &&
          (!q ||
            def.displayName.toLowerCase().includes(q) ||
            def.shortLabel.toLowerCase().includes(q) ||
            def.category.toLowerCase().includes(q)),
      );
      return { category, label: CATEGORY_LABELS[category], items };
    }).filter((g) => g.items.length > 0);
  }, [query]);

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, type: ComponentType): void => {
    if (locked) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('application/systemlab-node-type', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside
      aria-label="Component Library"
      className="flex h-full flex-col border-r"
      style={{
        backgroundColor: 'var(--sl-bg-surface)',
        borderColor: 'var(--sl-border-subtle)',
      }}
    >
      <div
        className="border-b px-3 py-2.5"
        style={{ borderColor: 'var(--sl-border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide" style={{ color: 'var(--sl-text-primary)' }}>
            Components
          </h2>
          <span className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
            Drag or click
          </span>
        </div>

        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: 'var(--sl-text-muted)' }}
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter components..."
            aria-label="Filter components"
            className="w-full rounded border py-1.5 pr-2 pl-8 text-xs transition-colors"
            style={{
              backgroundColor: 'var(--sl-bg-input)',
              borderColor: 'var(--sl-border-default)',
              color: 'var(--sl-text-primary)',
            }}
          />
        </div>
      </div>

      {locked && (
        <div
          className="border-b px-3 py-2 text-[11px]"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--sl-accent-warning) 10%, transparent)',
            borderColor: 'var(--sl-border-subtle)',
            color: 'var(--sl-accent-warning)',
          }}
        >
          Pause &amp; Reset simulation to add components.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-3">
        {grouped.map((group) => (
          <div key={group.category}>
            <div
              className="mb-1 px-1 text-[11px] font-medium"
              style={{ color: 'var(--sl-text-muted)' }}
            >
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  draggable={!locked}
                  disabled={locked}
                  onDragStart={(e) => handleDragStart(e, def.type)}
                  onClick={() => addNode(def.type)}
                  aria-label={`Add ${def.displayName} to canvas`}
                  className="group flex w-full items-center justify-between rounded border px-2.5 py-2 text-left text-xs transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--sl-bg-elevated)',
                    borderColor: 'var(--sl-border-subtle)',
                    color: 'var(--sl-text-primary)',
                  }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                      style={{
                        color: def.accentVar,
                        backgroundColor: `color-mix(in srgb, ${def.accentVar} 14%, transparent)`,
                      }}
                    >
                      <ComponentIcon type={def.type} className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate font-medium">{def.shortLabel}</span>
                  </span>
                  <Plus
                    className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100"
                    style={{ color: 'var(--sl-text-muted)' }}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        ))}

        {grouped.length === 0 && (
          <p className="px-2 py-4 text-center text-xs" style={{ color: 'var(--sl-text-muted)' }}>
            No matching components.
          </p>
        )}
      </div>
    </aside>
  );
}
