import { useRef, useState } from 'react';
import { AlertTriangle, Download, FlaskConical, Save, Trash2, Upload } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { downloadJsonFile, formatMs, formatPct, formatRps } from '@/lib/format';
import { computeFairnessWarnings, useExperimentStore } from '@/store/experimentStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function formatDelta(base: number | null, cand: number | null, unit = '', lowerIsBetter = true) {
  if (base === null || cand === null || !Number.isFinite(base) || !Number.isFinite(cand)) {
    return { text: '—', color: 'var(--sl-text-muted)' };
  }
  const diff = cand - base;
  const sign = diff > 0 ? '+' : '';
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  const regressed = lowerIsBetter ? diff > 0 : diff < 0;
  const color =
    Math.abs(diff) < 1e-6
      ? 'var(--sl-text-secondary)'
      : improved
        ? 'var(--sl-accent-success)'
        : regressed
          ? 'var(--sl-accent-danger)'
          : 'var(--sl-text-secondary)';
  const pctStr =
    Math.abs(base) > 1e-6 ? ` (${sign}${((diff / Math.abs(base)) * 100).toFixed(1)}%)` : '';
  return {
    text: `${sign}${diff.toFixed(1)}${unit}${pctStr}`,
    color,
  };
}

export function ExperimentsPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expName, setExpName] = useState('');
  const [importErr, setImportErr] = useState<string | null>(null);

  const project = useWorkspaceStore((s) => s.project);
  const snapshot = useSimulationStore((s) => s.snapshot);

  const experiments = useExperimentStore((s) => s.experiments);
  const baselineId = useExperimentStore((s) => s.baselineId);
  const candidateId = useExperimentStore((s) => s.candidateId);
  const saveSnapshot = useExperimentStore((s) => s.saveSnapshot);
  const removeExperiment = useExperimentStore((s) => s.removeExperiment);
  const importExperimentJson = useExperimentStore((s) => s.importExperimentJson);
  const setBaseline = useExperimentStore((s) => s.setBaseline);
  const setCandidate = useExperimentStore((s) => s.setCandidate);

  const canSave = snapshot !== null && snapshot.global.generated > 0;

  const baseline = experiments.find((e) => e.id === baselineId) ?? null;
  const candidate = experiments.find((e) => e.id === candidateId) ?? null;
  const fairnessWarnings =
    baseline && candidate ? computeFairnessWarnings(baseline, candidate) : [];

  const comparisonBarData =
    baseline && candidate
      ? [
          {
            metric: 'Throughput (RPS)',
            Baseline: Number(baseline.summaryMetrics.throughputRps.toFixed(2)),
            Candidate: Number(candidate.summaryMetrics.throughputRps.toFixed(2)),
          },
          {
            metric: 'Mean Lat (ms)',
            Baseline:
              baseline.summaryMetrics.meanLatencyMs !== null
                ? Number(baseline.summaryMetrics.meanLatencyMs.toFixed(2))
                : null,
            Candidate:
              candidate.summaryMetrics.meanLatencyMs !== null
                ? Number(candidate.summaryMetrics.meanLatencyMs.toFixed(2))
                : null,
          },
          {
            metric: 'P95 Lat (ms)',
            Baseline:
              baseline.summaryMetrics.p95LatencyMs !== null
                ? Number(baseline.summaryMetrics.p95LatencyMs.toFixed(2))
                : null,
            Candidate:
              candidate.summaryMetrics.p95LatencyMs !== null
                ? Number(candidate.summaryMetrics.p95LatencyMs.toFixed(2))
                : null,
          },
        ]
      : [];

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!snapshot) return;
    const defaultLabel = `${project.name} (Seed ${project.simConfig.seed})`;
    await saveSnapshot(expName.trim() || defaultLabel, project, snapshot);
    setExpName('');
  };

  const handleImport = async (ev: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    const text = await file.text();
    const res = await importExperimentJson(text);
    setImportErr(res.ok ? null : (res.error ?? 'Import failed'));
  };

  return (
    <div className="p-3 space-y-3">
      {/* Save Current Snapshot Bar */}
      <form
        onSubmit={handleSave}
        className="flex flex-wrap items-center justify-between gap-2 rounded border p-2.5"
        style={{
          backgroundColor: 'var(--sl-bg-elevated)',
          borderColor: 'var(--sl-border-subtle)',
        }}
      >
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <FlaskConical
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--sl-accent-routing)' }}
          />
          <input
            type="text"
            value={expName}
            onChange={(e) => setExpName(e.target.value)}
            placeholder="Experiment snapshot name (e.g., 1 Server vs 3 Servers)..."
            aria-label="Experiment snapshot name"
            className="min-w-[220px] flex-1 rounded border px-2.5 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--sl-bg-input)',
              borderColor: 'var(--sl-border-default)',
              color: 'var(--sl-text-primary)',
            }}
          />
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--sl-btn-routing-bg)' }}
          >
            <Save className="h-3.5 w-3.5" />
            Save Snapshot
          </button>
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs"
          style={{
            borderColor: 'var(--sl-border-default)',
            color: 'var(--sl-text-primary)',
          }}
        >
          <Upload className="h-3.5 w-3.5" /> Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Import experiment JSON file"
          className="hidden"
          onChange={handleImport}
        />
      </form>

      {importErr && (
        <div
          role="alert"
          className="rounded border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--sl-accent-danger)', color: 'var(--sl-accent-danger)' }}
        >
          {importErr}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Saved Experiments Table */}
        <div
          className="lg:col-span-5 rounded border p-3"
          style={{
            backgroundColor: 'var(--sl-bg-elevated)',
            borderColor: 'var(--sl-border-subtle)',
          }}
        >
          <div className="text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
            Saved Experiments ({experiments.length})
          </div>
          {experiments.length === 0 ? (
            <p className="mt-2 text-xs" style={{ color: 'var(--sl-text-muted)' }}>
              Run a simulation and click <strong>Save Snapshot</strong>, then modify your
              architecture or configuration and save a second snapshot to compare them side-by-side.
            </p>
          ) : (
            <div className="mt-2 max-h-64 overflow-y-auto space-y-1.5">
              {experiments.map((exp) => {
                const isBase = exp.id === baselineId;
                const isCand = exp.id === candidateId;
                return (
                  <div
                    key={exp.id}
                    className="rounded border p-2 text-xs"
                    style={{
                      backgroundColor: 'var(--sl-bg-surface)',
                      borderColor:
                        isBase || isCand ? 'var(--sl-accent-routing)' : 'var(--sl-border-subtle)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          className="truncate font-semibold"
                          style={{ color: 'var(--sl-text-primary)' }}
                        >
                          {exp.name}
                        </div>
                        <div
                          className="text-[11px] font-mono-tabular"
                          style={{ color: 'var(--sl-text-muted)' }}
                        >
                          Seed {exp.seed} · {(exp.durationMs / 1000).toFixed(0)}s ·{' '}
                          {formatRps(exp.summaryMetrics.throughputRps)} · P95{' '}
                          {formatMs(exp.summaryMetrics.p95LatencyMs)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="Export experiment JSON"
                          aria-label={`Export ${exp.name}`}
                          onClick={() =>
                            downloadJsonFile(
                              `${exp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.exp.json`,
                              exp,
                            )
                          }
                          className="rounded p-1 hover:bg-black/15"
                          style={{ color: 'var(--sl-text-secondary)' }}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete experiment"
                          aria-label={`Delete ${exp.name}`}
                          onClick={() => removeExperiment(exp.id)}
                          className="rounded p-1 hover:bg-black/15"
                          style={{ color: 'var(--sl-accent-danger)' }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBaseline(exp.id)}
                        className="rounded border px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: isBase ? 'var(--sl-btn-primary-bg)' : 'transparent',
                          borderColor: isBase
                            ? 'var(--sl-btn-primary-bg)'
                            : 'var(--sl-border-default)',
                          color: isBase ? 'white' : 'var(--sl-text-secondary)',
                        }}
                      >
                        {isBase ? 'Baseline ✓' : 'Set Baseline'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCandidate(exp.id)}
                        className="rounded border px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: isCand ? 'var(--sl-btn-routing-bg)' : 'transparent',
                          borderColor: isCand
                            ? 'var(--sl-btn-routing-bg)'
                            : 'var(--sl-border-default)',
                          color: isCand ? 'white' : 'var(--sl-text-secondary)',
                        }}
                      >
                        {isCand ? 'Candidate ✓' : 'Set Candidate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side-by-Side Comparison View */}
        <div
          className="lg:col-span-7 rounded border p-3 space-y-2.5"
          style={{
            backgroundColor: 'var(--sl-bg-elevated)',
            borderColor: 'var(--sl-border-subtle)',
          }}
        >
          <div className="text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
            Baseline vs. Candidate Comparison
          </div>

          {!baseline || !candidate ? (
            <p className="py-6 text-center text-xs" style={{ color: 'var(--sl-text-muted)' }}>
              Select one <strong>Baseline</strong> and one <strong>Candidate</strong> experiment on
              the left to compare throughput, latency percentiles, error rate, and fairness checks.
            </p>
          ) : (
            <>
              {fairnessWarnings.length > 0 && (
                <div
                  role="alert"
                  className="rounded border p-2.5 text-[11px]"
                  style={{
                    borderColor: 'var(--sl-accent-warning)',
                    backgroundColor:
                      'color-mix(in srgb, var(--sl-accent-warning) 10%, transparent)',
                    color: 'var(--sl-accent-warning)',
                  }}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Comparison Fairness Notice
                  </div>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {fairnessWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                className="overflow-x-auto rounded border"
                style={{ borderColor: 'var(--sl-border-subtle)' }}
              >
                <table className="w-full text-left text-xs">
                  <thead
                    className="border-b text-[11px]"
                    style={{
                      backgroundColor: 'var(--sl-bg-surface)',
                      borderColor: 'var(--sl-border-subtle)',
                      color: 'var(--sl-text-muted)',
                    }}
                  >
                    <tr>
                      <th className="px-2.5 py-1.5">Metric</th>
                      <th className="px-2.5 py-1.5">Baseline ({baseline.name})</th>
                      <th className="px-2.5 py-1.5">Candidate ({candidate.name})</th>
                      <th className="px-2.5 py-1.5">Difference</th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y font-mono-tabular"
                    style={{ borderColor: 'var(--sl-border-subtle)' }}
                  >
                    {[
                      {
                        label: 'Throughput',
                        base: formatRps(baseline.summaryMetrics.throughputRps),
                        cand: formatRps(candidate.summaryMetrics.throughputRps),
                        delta: formatDelta(
                          baseline.summaryMetrics.throughputRps,
                          candidate.summaryMetrics.throughputRps,
                          ' RPS',
                          false,
                        ),
                      },
                      {
                        label: 'Mean Latency',
                        base: formatMs(baseline.summaryMetrics.meanLatencyMs),
                        cand: formatMs(candidate.summaryMetrics.meanLatencyMs),
                        delta: formatDelta(
                          baseline.summaryMetrics.meanLatencyMs,
                          candidate.summaryMetrics.meanLatencyMs,
                          ' ms',
                          true,
                        ),
                      },
                      {
                        label: 'P50 Latency',
                        base: formatMs(baseline.summaryMetrics.p50LatencyMs),
                        cand: formatMs(candidate.summaryMetrics.p50LatencyMs),
                        delta: formatDelta(
                          baseline.summaryMetrics.p50LatencyMs,
                          candidate.summaryMetrics.p50LatencyMs,
                          ' ms',
                          true,
                        ),
                      },
                      {
                        label: 'P95 Latency',
                        base: formatMs(baseline.summaryMetrics.p95LatencyMs),
                        cand: formatMs(candidate.summaryMetrics.p95LatencyMs),
                        delta: formatDelta(
                          baseline.summaryMetrics.p95LatencyMs,
                          candidate.summaryMetrics.p95LatencyMs,
                          ' ms',
                          true,
                        ),
                      },
                      {
                        label: 'P99 Latency',
                        base: formatMs(baseline.summaryMetrics.p99LatencyMs),
                        cand: formatMs(candidate.summaryMetrics.p99LatencyMs),
                        delta: formatDelta(
                          baseline.summaryMetrics.p99LatencyMs,
                          candidate.summaryMetrics.p99LatencyMs,
                          ' ms',
                          true,
                        ),
                      },
                      {
                        label: 'Error Rate',
                        base: formatPct(baseline.summaryMetrics.errorRate, true),
                        cand: formatPct(candidate.summaryMetrics.errorRate, true),
                        delta: formatDelta(
                          baseline.summaryMetrics.errorRate,
                          candidate.summaryMetrics.errorRate,
                          '%',
                          true,
                        ),
                      },
                    ].map((row) => (
                      <tr key={row.label}>
                        <td className="px-2.5 py-1.5 font-sans font-medium">{row.label}</td>
                        <td className="px-2.5 py-1.5">{row.base}</td>
                        <td className="px-2.5 py-1.5">{row.cand}</td>
                        <td className="px-2.5 py-1.5" style={{ color: row.delta.color }}>
                          {row.delta.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonBarData}>
                    <CartesianGrid stroke="var(--sl-border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="metric" tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} width={40} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--sl-bg-surface)',
                        borderColor: 'var(--sl-border-default)',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar
                      dataKey="Baseline"
                      fill="var(--sl-accent-traffic)"
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="Candidate"
                      fill="var(--sl-accent-routing)"
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
