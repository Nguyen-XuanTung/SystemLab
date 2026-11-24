import * as Dialog from '@radix-ui/react-dialog';
import { GitCommitHorizontal, X } from 'lucide-react';
import { formatMs } from '@/lib/format';
import { useSimulationStore } from '@/store/simulationStore';

export function RequestTraceModal() {
  const selectedTraceId = useSimulationStore((s) => s.selectedTraceId);
  const setSelectedTraceId = useSimulationStore((s) => s.setSelectedTraceId);
  const trace = useSimulationStore((s) =>
    selectedTraceId ? s.snapshot?.recentTraces.find((t) => t.id === selectedTraceId) : undefined,
  );

  return (
    <Dialog.Root
      open={Boolean(selectedTraceId && trace)}
      onOpenChange={(open) => {
        if (!open) setSelectedTraceId(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          aria-describedby="trace-desc"
          className="fixed top-1/2 left-1/2 z-50 w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-xl"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border-default)',
            color: 'var(--sl-text-primary)',
          }}
        >
          <div
            className="flex items-center justify-between border-b pb-3"
            style={{ borderColor: 'var(--sl-border-subtle)' }}
          >
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold font-mono-tabular">
              <GitCommitHorizontal className="h-4 w-4" />
              Request Trace · {trace?.id}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close request trace"
                className="rounded p-1 hover:bg-black/15"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {trace && (
            <>
              <div
                id="trace-desc"
                className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-tabular"
              >
                <div
                  className="rounded border p-2"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Method
                  </div>
                  <div className="uppercase font-semibold">{trace.method}</div>
                </div>
                <div
                  className="rounded border p-2"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Outcome
                  </div>
                  <div
                    className="font-semibold uppercase"
                    style={{
                      color:
                        trace.terminalState === 'succeeded'
                          ? 'var(--sl-accent-success)'
                          : 'var(--sl-accent-danger)',
                    }}
                  >
                    {trace.terminalState}
                  </div>
                </div>
                <div
                  className="rounded border p-2"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Total Latency
                  </div>
                  <div>{formatMs(trace.totalLatencyMs)}</div>
                </div>
                <div
                  className="rounded border p-2"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Error Category
                  </div>
                  <div>{trace.errorCategory ?? '—'}</div>
                </div>
              </div>

              <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
                {trace.hops.map((hop, idx) => (
                  <div
                    key={`${hop.nodeId}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-xs"
                    style={{
                      backgroundColor: 'var(--sl-bg-elevated)',
                      borderColor: 'var(--sl-border-subtle)',
                    }}
                  >
                    <div>
                      <span className="font-semibold">{hop.nodeLabel}</span>{' '}
                      <span className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                        ({hop.nodeType})
                      </span>
                      {hop.note && (
                        <div
                          className="mt-0.5 text-[11px] font-mono-tabular"
                          style={{ color: 'var(--sl-text-secondary)' }}
                        >
                          {hop.note}
                        </div>
                      )}
                    </div>
                    <div className="text-right font-mono-tabular text-[11px]">
                      <div>
                        Arrived {hop.arrivedAtMs.toFixed(1)} ms · Wait {hop.queueWaitMs.toFixed(1)}{' '}
                        ms · Svc {hop.serviceMs.toFixed(1)} ms
                      </div>
                      <div
                        style={{
                          color:
                            hop.outcome === 'failed'
                              ? 'var(--sl-accent-danger)'
                              : 'var(--sl-accent-compute)',
                        }}
                      >
                        {hop.outcome}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
