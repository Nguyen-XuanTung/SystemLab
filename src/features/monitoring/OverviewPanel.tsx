import { useMemo, useState } from 'react';
import { ArrowUpDown, CheckCircle2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMs, formatPct, formatRps } from '@/lib/format';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

type SortKey = 'label' | 'arrivals' | 'utilization' | 'queueDepth' | 'failedRequests';

export function OverviewPanel() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const [sortKey, setSortKey] = useState<SortKey>('arrivals');
  const [sortDesc, setSortDesc] = useState(true);

  const nodeRows = useMemo(() => {
    if (!snapshot) return [];
    const list = Object.values(snapshot.nodeMetrics);
    return [...list].sort((a, b) => {
      const cmp = sortKey === 'label' ? a.label.localeCompare(b.label) : a[sortKey] - b[sortKey];
      return sortDesc ? -cmp : cmp;
    });
  }, [snapshot, sortDesc, sortKey]);

  const g = snapshot?.global;
  const conserved =
    g !== undefined && g.generated === g.succeeded + g.failed + g.timedOut + g.inFlight;

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDesc((v) => !v);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  return (
    <div className="space-y-3 p-3">
      {/* Unified Metric Strip */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 divide-y sm:divide-y-0 sm:divide-x rounded-md border text-xs"
        style={{
          backgroundColor: 'var(--sl-bg-elevated)',
          borderColor: 'var(--sl-border-subtle)',
        }}
      >
        {[
          { label: 'Generated', value: g ? String(g.generated) : '—' },
          { label: 'Succeeded', value: g ? String(g.succeeded) : '—', color: 'var(--sl-accent-success)' },
          { label: 'Failed', value: g ? String(g.failed) : '—', color: g && g.failed > 0 ? 'var(--sl-accent-danger)' : undefined },
          { label: 'Timed Out', value: g ? String(g.timedOut) : '—', color: g && g.timedOut > 0 ? 'var(--sl-accent-warning)' : undefined },
          { label: 'In-Flight', value: g ? String(g.inFlight) : '—' },
          { label: 'Throughput', value: g ? formatRps(g.throughputRps) : '—' },
          { label: 'Error Rate', value: g ? formatPct(g.errorRate, true) : '—' },
          { label: 'Mean Lat', value: g ? formatMs(g.meanLatencyMs) : '—' },
          { label: 'P50', value: g ? formatMs(g.p50LatencyMs) : '—' },
          { label: 'P95', value: g ? formatMs(g.p95LatencyMs) : '—' },
          { label: 'P99', value: g ? formatMs(g.p99LatencyMs) : '—' },
        ].map((metric) => (
          <div key={metric.label} className="px-2.5 py-2" style={{ borderColor: 'var(--sl-border-subtle)' }}>
            <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
              {metric.label}
            </div>
            <div
              className="mt-0.5 font-mono-tabular text-xs font-semibold"
              style={{ color: metric.color ?? 'var(--sl-text-primary)' }}
            >
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      {/* Conservation & Horizon Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2" style={{ color: 'var(--sl-text-secondary)' }}>
          {g ? (
            <>
              <span
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono-tabular"
                style={{
                  backgroundColor: conserved
                    ? 'color-mix(in srgb, var(--sl-accent-success) 12%, transparent)'
                    : 'color-mix(in srgb, var(--sl-accent-danger) 12%, transparent)',
                  color: conserved ? 'var(--sl-accent-success)' : 'var(--sl-accent-danger)',
                }}
              >
                <CheckCircle2 className="h-3 w-3" />
                Conservation: {g.generated} = {g.succeeded} + {g.failed} + {g.timedOut} + {g.inFlight}
              </span>
              <span className="font-mono-tabular" style={{ color: 'var(--sl-text-muted)' }}>
                Events: {g.processedEvents.toLocaleString()} · Samples: {g.sampleCount.toLocaleString()}
              </span>
            </>
          ) : (
            <span>Press Run to simulate virtual request flow and collect telemetry.</span>
          )}
        </div>
      </div>

      {/* Per-Node Metrics Table */}
      {nodeRows.length > 0 && (
        <div
          className="overflow-x-auto rounded border"
          style={{ borderColor: 'var(--sl-border-subtle)' }}
        >
          <table className="w-full text-left text-xs">
            <thead
              className="border-b text-[11px]"
              style={{
                backgroundColor: 'var(--sl-bg-elevated)',
                borderColor: 'var(--sl-border-subtle)',
                color: 'var(--sl-text-muted)',
              }}
            >
              <tr>
                <th className="px-3 py-1.5">
                  <button type="button" onClick={() => handleSort('label')} className="inline-flex items-center gap-1 font-medium">
                    Component <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">
                  <button type="button" onClick={() => handleSort('arrivals')} className="inline-flex items-center gap-1 font-medium">
                    Arrivals <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-2 py-1.5">Done</th>
                <th className="px-2 py-1.5">Active</th>
                <th className="px-2 py-1.5">
                  <button type="button" onClick={() => handleSort('queueDepth')} className="inline-flex items-center gap-1 font-medium">
                    Queue (Max) <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-2 py-1.5">Svc / Wait</th>
                <th className="px-2 py-1.5">
                  <button type="button" onClick={() => handleSort('utilization')} className="inline-flex items-center gap-1 font-medium">
                    Util <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-2 py-1.5">
                  <button type="button" onClick={() => handleSort('failedRequests')} className="inline-flex items-center gap-1 font-medium">
                    Drop / Fail <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-1.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono-tabular" style={{ borderColor: 'var(--sl-border-subtle)' }}>
              {nodeRows.map((row) => {
                const details =
                  row.type === 'cache'
                    ? `Hit ${formatPct(row.cacheHitRatio)} (${row.cacheHits}/${row.cacheHits + row.cacheMisses})`
                    : row.type === 'api_gateway'
                      ? `RL: ${row.rateLimitedCount}`
                      : row.type === 'database' || row.type === 'read_replica'
                        ? `R:${row.dbReads} W:${row.dbWrites}`
                        : row.type === 'message_queue' || row.type === 'worker'
                          ? `Jobs: ${row.jobsCompleted}/${row.jobsEnqueued}`
                          : row.type === 'circuit_breaker'
                            ? `${(row.circuitState ?? 'closed').toUpperCase()} (${row.circuitRejections})`
                            : '—';

                return (
                  <tr
                    key={row.nodeId}
                    onClick={() => selectNode(row.nodeId)}
                    className="cursor-pointer hover:bg-black/10"
                    style={{ borderColor: 'var(--sl-border-subtle)' }}
                  >
                    <td className="px-3 py-1.5 font-sans font-medium" style={{ color: 'var(--sl-text-primary)' }}>
                      {row.label}
                    </td>
                    <td className="px-2 py-1.5 font-sans">
                      <StatusBadge status={row.status} compact />
                    </td>
                    <td className="px-2 py-1.5">{row.arrivals}</td>
                    <td className="px-2 py-1.5">{row.completions}</td>
                    <td className="px-2 py-1.5">{row.activeRequests}</td>
                    <td className="px-2 py-1.5">
                      {row.queueDepth} ({row.maxQueueDepthObserved})
                    </td>
                    <td className="px-2 py-1.5">
                      {formatMs(row.meanServiceTimeMs, 0)} / {formatMs(row.meanWaitingTimeMs, 0)}
                    </td>
                    <td className="px-2 py-1.5">{formatPct(row.utilization)}</td>
                    <td
                      className="px-2 py-1.5"
                      style={{
                        color:
                          row.droppedRequests + row.failedRequests > 0
                            ? 'var(--sl-accent-danger)'
                            : 'var(--sl-text-secondary)',
                      }}
                    >
                      {row.droppedRequests} / {row.failedRequests}
                    </td>
                    <td className="px-3 py-1.5 font-sans text-[11px]" style={{ color: 'var(--sl-text-secondary)' }}>
                      {details}
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
