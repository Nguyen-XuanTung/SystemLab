import { useMemo, useState } from 'react';
import { Eye, Search } from 'lucide-react';
import type { EventSeverity } from '@/engine/models/types';
import { formatVirtualClock } from '@/lib/format';
import { useSimulationStore } from '@/store/simulationStore';

export function EventLogPanel() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const setSelectedTraceId = useSimulationStore((s) => s.setSelectedTraceId);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<'all' | EventSeverity>('all');

  const filteredEvents = useMemo(() => {
    if (!snapshot) return [];
    const q = search.trim().toLowerCase();
    return [...snapshot.eventLog].reverse().filter((entry) => {
      if (severity !== 'all' && entry.severity !== severity) return false;
      if (!q) return true;
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.type.toLowerCase().includes(q) ||
        entry.nodeId.toLowerCase().includes(q) ||
        (entry.requestId ?? '').toLowerCase().includes(q)
      );
    });
  }, [search, severity, snapshot]);

  const traceIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const t of snapshot?.recentTraces ?? []) {
      set.add(t.id);
    }
    return set;
  }, [snapshot?.recentTraces]);

  return (
    <div className="p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: 'var(--sl-text-muted)' }}
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events, node, or req-ID..."
              aria-label="Search event stream"
              className="w-64 rounded border py-1 pr-2 pl-8 text-xs"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            />
          </div>

          <select
            aria-label="Filter by severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as 'all' | EventSeverity)}
            className="rounded border px-2 py-1 text-xs"
            style={{
              backgroundColor: 'var(--sl-bg-input)',
              borderColor: 'var(--sl-border-default)',
              color: 'var(--sl-text-primary)',
            }}
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <span className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
          Bounded history (last 500 warning/fault/state events) · Showing {filteredEvents.length}
        </span>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="py-6 text-center text-xs" style={{ color: 'var(--sl-text-muted)' }}>
          {snapshot
            ? 'No matching diagnostic events recorded yet (only warnings, errors, faults, retries, and circuit transitions are logged to keep ring buffer compact).'
            : 'Run a simulation to inspect events and request traces.'}
        </div>
      ) : (
        <div
          className="max-h-56 overflow-y-auto rounded border"
          style={{ borderColor: 'var(--sl-border-subtle)' }}
        >
          <table className="w-full text-left text-xs">
            <thead
              className="sticky top-0 border-b text-[11px]"
              style={{
                backgroundColor: 'var(--sl-bg-elevated)',
                borderColor: 'var(--sl-border-subtle)',
                color: 'var(--sl-text-muted)',
              }}
            >
              <tr>
                <th className="px-2.5 py-1.5">Virtual Time</th>
                <th className="px-2 py-1.5">Level</th>
                <th className="px-2 py-1.5">Event Type</th>
                <th className="px-2 py-1.5">Node</th>
                <th className="px-2 py-1.5">Details</th>
                <th className="px-2.5 py-1.5">Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--sl-border-subtle)' }}>
              {filteredEvents.map((ev) => {
                const levelColor =
                  ev.severity === 'error'
                    ? 'var(--sl-accent-danger)'
                    : ev.severity === 'warn'
                      ? 'var(--sl-accent-warning)'
                      : 'var(--sl-accent-traffic)';
                return (
                  <tr key={ev.id} className="hover:bg-black/10">
                    <td className="px-2.5 py-1.5 font-mono-tabular">
                      {formatVirtualClock(ev.timestampMs)}
                    </td>
                    <td
                      className="px-2 py-1.5 font-mono-tabular uppercase"
                      style={{ color: levelColor }}
                    >
                      {ev.severity}
                    </td>
                    <td className="px-2 py-1.5 font-mono-tabular">{ev.type}</td>
                    <td
                      className="px-2 py-1.5 font-mono-tabular"
                      style={{ color: 'var(--sl-text-secondary)' }}
                    >
                      {ev.nodeId}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--sl-text-primary)' }}>
                      {ev.message}
                    </td>
                    <td className="px-2.5 py-1.5">
                      {ev.requestId && traceIdSet.has(ev.requestId) ? (
                        <button
                          type="button"
                          onClick={() => setSelectedTraceId(ev.requestId!)}
                          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono-tabular text-[11px]"
                          style={{
                            borderColor: 'var(--sl-border-default)',
                            color: 'var(--sl-accent-traffic)',
                          }}
                        >
                          <Eye className="h-3 w-3" /> {ev.requestId}
                        </button>
                      ) : (
                        <span
                          className="font-mono-tabular"
                          style={{ color: 'var(--sl-text-muted)' }}
                        >
                          {ev.requestId ?? '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
