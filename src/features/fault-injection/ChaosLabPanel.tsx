import { useState } from 'react';
import { Flame, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import type { FaultType } from '@/engine/models/types';
import { formatVirtualClock } from '@/lib/format';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const FAULT_META: Record<
  FaultType,
  { label: string; targetKind: 'node' | 'edge'; defaultValue: number; valueLabel: string; hint: string }
> = {
  node_failure: {
    label: 'Node Failure (Crash)',
    targetKind: 'node',
    defaultValue: 1,
    valueLabel: 'Flag (1)',
    hint: 'Node crashes: fails active & queued requests and rejects arrivals until recovered.',
  },
  latency_spike: {
    label: 'Latency Spike (+ms)',
    targetKind: 'node',
    defaultValue: 200,
    valueLabel: 'Added ms',
    hint: 'Adds extra processing latency (ms) on top of normal service time.',
  },
  capacity_drop: {
    label: 'Capacity Drop (0–1)',
    targetKind: 'node',
    defaultValue: 0.25,
    valueLabel: 'Multiplier',
    hint: 'Scales worker concurrency / DB connections (e.g., 0.25 keeps 25% capacity).',
  },
  traffic_spike: {
    label: 'Traffic Spike (x)',
    targetKind: 'node',
    defaultValue: 3,
    valueLabel: 'Rate Multiplier',
    hint: 'Multiplies Client arrival rate immediately at virtual timestamp.',
  },
  packet_drop: {
    label: 'Packet / Request Drop (0–1)',
    targetKind: 'node',
    defaultValue: 0.35,
    valueLabel: 'Drop Prob',
    hint: 'Drops incoming requests at target node with configured probability.',
  },
  cache_cold_start: {
    label: 'Cache Cold Start',
    targetKind: 'node',
    defaultValue: 1,
    valueLabel: 'Active (1)',
    hint: 'Drops probabilistic cache hit ratio to 0% and recovers linearly over Warmup ms.',
  },
  edge_latency_spike: {
    label: 'Connection Latency Spike (+ms)',
    targetKind: 'edge',
    defaultValue: 150,
    valueLabel: 'Added ms',
    hint: 'Adds network propagation latency on the chosen connection edge.',
  },
  edge_failure: {
    label: 'Connection Link Failure',
    targetKind: 'edge',
    defaultValue: 1,
    valueLabel: 'Flag (1)',
    hint: 'Drops packets traversing the selected connection link.',
  },
};

export function ChaosLabPanel() {
  const project = useWorkspaceStore((s) => s.project);
  const addScheduledFault = useWorkspaceStore((s) => s.addScheduledFault);
  const removeScheduledFault = useWorkspaceStore((s) => s.removeScheduledFault);

  const simStatus = useSimulationStore((s) => s.status);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const injectLiveFault = useSimulationStore((s) => s.injectLiveFault);
  const recoverLiveFault = useSimulationStore((s) => s.recoverLiveFault);

  const isLive = simStatus === 'running' || simStatus === 'paused';

  const [faultType, setFaultType] = useState<FaultType>('node_failure');
  const [targetId, setTargetId] = useState<string>(project.nodes[1]?.id ?? project.nodes[0]?.id ?? '');
  const [value, setValue] = useState<number>(FAULT_META.node_failure.defaultValue);
  const [startSec, setStartSec] = useState<number>(4);
  const [durationSec, setDurationSec] = useState<number>(6);
  const [permanent, setPermanent] = useState<boolean>(false);

  const meta = FAULT_META[faultType];
  const candidateTargets =
    meta.targetKind === 'edge'
      ? project.edges.map((e) => ({ id: e.id, label: `${e.source} -> ${e.target} (${e.id})` }))
      : project.nodes.map((n) => ({ id: n.id, label: `${n.label} (${n.config.type})` }));

  const effectiveTargetId = candidateTargets.some((t) => t.id === targetId)
    ? targetId
    : (candidateTargets[0]?.id ?? '');

  const handleTypeChange = (nextType: FaultType): void => {
    setFaultType(nextType);
    setValue(FAULT_META[nextType].defaultValue);
    const nextTargets =
      FAULT_META[nextType].targetKind === 'edge' ? project.edges : project.nodes;
    if (nextTargets[0]) {
      setTargetId(nextTargets[0].id);
    }
  };

  const activeFaults = snapshot?.activeFaults ?? [];
  const horizonMs = Math.max(1000, project.simConfig.durationMs);
  const cursorPct = Math.min(100, ((snapshot?.virtualTimeMs ?? 0) / horizonMs) * 100);

  return (
    <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-12">
      {/* Left: Fault Builder (Live OR Scheduled) */}
      <div
        className="lg:col-span-5 rounded border p-3 space-y-2.5"
        style={{
          backgroundColor: 'var(--sl-bg-elevated)',
          borderColor: 'var(--sl-border-subtle)',
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
            <Flame className="h-3.5 w-3.5" style={{ color: 'var(--sl-accent-danger)' }} />
            {isLive ? 'Live Fault Injection' : 'Schedule Chaos Fault'}
          </h3>
          <span className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
            {isLive ? 'Applies at current virtual clock' : 'Runs during simulation'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <label htmlFor="chaos-fault-type" className="block text-[11px]" style={{ color: 'var(--sl-text-secondary)' }}>
              Fault Type
            </label>
            <select
              id="chaos-fault-type"
              value={faultType}
              onChange={(e) => handleTypeChange(e.target.value as FaultType)}
              className="mt-1 w-full rounded border px-2 py-1.5 text-xs"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            >
              {(Object.keys(FAULT_META) as FaultType[]).map((t) => (
                <option key={t} value={t}>
                  {FAULT_META[t].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="chaos-target" className="block text-[11px]" style={{ color: 'var(--sl-text-secondary)' }}>
              Target {meta.targetKind === 'edge' ? 'Connection' : 'Component'}
            </label>
            <select
              id="chaos-target"
              value={effectiveTargetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5 text-xs"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            >
              {candidateTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
          {meta.hint}
        </p>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <label htmlFor="chaos-value" className="block text-[11px]" style={{ color: 'var(--sl-text-secondary)' }}>
              {meta.valueLabel}
            </label>
            <input
              id="chaos-value"
              type="number"
              step="any"
              min={0}
              value={value}
              onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded border px-2 py-1 font-mono-tabular"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            />
          </div>

          {!isLive && (
            <div>
              <label htmlFor="chaos-start-sec" className="block text-[11px]" style={{ color: 'var(--sl-text-secondary)' }}>
                Start (s)
              </label>
              <input
                id="chaos-start-sec"
                type="number"
                min={0}
                step={0.5}
                value={startSec}
                onChange={(e) => setStartSec(Math.max(0, parseFloat(e.target.value) || 0))}
                className="mt-1 w-full rounded border px-2 py-1 font-mono-tabular"
                style={{
                  backgroundColor: 'var(--sl-bg-input)',
                  borderColor: 'var(--sl-border-default)',
                  color: 'var(--sl-text-primary)',
                }}
              />
            </div>
          )}

          <div>
            <label htmlFor="chaos-dur-sec" className="block text-[11px]" style={{ color: 'var(--sl-text-secondary)' }}>
              Duration (s)
            </label>
            <input
              id="chaos-dur-sec"
              type="number"
              disabled={permanent}
              min={0.5}
              step={0.5}
              value={durationSec}
              onChange={(e) => setDurationSec(Math.max(0.5, parseFloat(e.target.value) || 1))}
              className="mt-1 w-full rounded border px-2 py-1 font-mono-tabular disabled:opacity-40"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--sl-text-secondary)' }}>
            <input
              type="checkbox"
              checked={permanent}
              onChange={(e) => setPermanent(e.target.checked)}
            />
            Permanent until manual recovery
          </label>

          {isLive ? (
            <button
              type="button"
              disabled={!effectiveTargetId}
              onClick={() =>
                injectLiveFault(
                  faultType,
                  effectiveTargetId,
                  value,
                  permanent ? null : durationSec * 1000,
                  meta.label,
                )
              }
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: 'var(--sl-accent-danger)' }}
            >
              <Zap className="h-3.5 w-3.5" />
              Inject Live Fault
            </button>
          ) : (
            <button
              type="button"
              disabled={!effectiveTargetId}
              onClick={() =>
                addScheduledFault({
                  type: faultType,
                  targetId: effectiveTargetId,
                  startAtMs: startSec * 1000,
                  durationMs: permanent ? null : durationSec * 1000,
                  value,
                  label: meta.label,
                })
              }
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: 'var(--sl-accent-traffic)' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add to Timeline
            </button>
          )}
        </div>
      </div>

      {/* Right: Active Faults + Visual Fault Timeline */}
      <div className="lg:col-span-7 space-y-3">
        {/* Visual Timeline Track */}
        <div
          className="rounded border p-3"
          style={{
            backgroundColor: 'var(--sl-bg-elevated)',
            borderColor: 'var(--sl-border-subtle)',
          }}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
              Virtual Fault Timeline (0s – {(horizonMs / 1000).toFixed(0)}s)
            </span>
            <span className="font-mono-tabular text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
              Cursor: {formatVirtualClock(snapshot?.virtualTimeMs ?? 0)}
            </span>
          </div>

          <div
            className="relative mt-2.5 h-10 w-full overflow-hidden rounded border"
            style={{
              backgroundColor: 'var(--sl-bg-input)',
              borderColor: 'var(--sl-border-subtle)',
            }}
          >
            {project.scheduledFaults.map((f, idx) => {
              const leftPct = Math.min(100, (f.startAtMs / horizonMs) * 100);
              const widthPct =
                f.durationMs === null
                  ? 100 - leftPct
                  : Math.max(2, Math.min(100 - leftPct, (f.durationMs / horizonMs) * 100));
              return (
                <div
                  key={f.id}
                  title={`${f.type} on ${f.targetId} (${f.startAtMs / 1000}s)`}
                  className="absolute h-3 rounded-sm text-[9px] font-mono-tabular text-white px-1 truncate"
                  style={{
                    top: `${4 + (idx % 2) * 16}px`,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: 'var(--sl-accent-danger)',
                    opacity: 0.85,
                  }}
                >
                  {f.targetId}
                </div>
              );
            })}
            {/* Virtual clock playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5"
              style={{
                left: `${cursorPct}%`,
                backgroundColor: 'var(--sl-accent-traffic)',
              }}
            />
          </div>
        </div>

        {/* Active Live Faults */}
        {activeFaults.length > 0 && (
          <div
            className="rounded border p-3 space-y-1.5"
            style={{
              borderColor: 'var(--sl-accent-danger)',
              backgroundColor: 'color-mix(in srgb, var(--sl-accent-danger) 8%, transparent)',
            }}
          >
            <div className="text-xs font-semibold" style={{ color: 'var(--sl-accent-danger)' }}>
              Active Faults ({activeFaults.length})
            </div>
            {activeFaults.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono-tabular">
                  {f.type} → <strong>{f.targetId}</strong> (since {formatVirtualClock(f.activatedAtMs)})
                </span>
                <button
                  type="button"
                  onClick={() => recoverLiveFault(f.id)}
                  className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    borderColor: 'var(--sl-accent-success)',
                    color: 'var(--sl-accent-success)',
                  }}
                >
                  <RotateCcw className="h-3 w-3" /> Recover Now
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Scheduled Faults List */}
        <div
          className="rounded border p-3"
          style={{
            backgroundColor: 'var(--sl-bg-elevated)',
            borderColor: 'var(--sl-border-subtle)',
          }}
        >
          <div className="text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
            Scheduled Faults ({project.scheduledFaults.length})
          </div>
          {project.scheduledFaults.length === 0 ? (
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
              No pre-scheduled faults. Add one on the left or inject faults live while running.
            </p>
          ) : (
            <div className="mt-2 space-y-1">
              {project.scheduledFaults.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs"
                  style={{
                    backgroundColor: 'var(--sl-bg-surface)',
                    borderColor: 'var(--sl-border-subtle)',
                  }}
                >
                  <div className="font-mono-tabular text-[11px]">
                    <span className="font-semibold" style={{ color: 'var(--sl-accent-danger)' }}>
                      {f.type}
                    </span>{' '}
                    on <strong>{f.targetId}</strong> @ {(f.startAtMs / 1000).toFixed(1)}s ·{' '}
                    {f.durationMs === null ? 'until recovered' : `for ${(f.durationMs / 1000).toFixed(1)}s`}
                  </div>
                  <button
                    type="button"
                    disabled={isLive}
                    onClick={() => removeScheduledFault(f.id)}
                    aria-label={`Remove fault ${f.id}`}
                    className="rounded p-1 hover:bg-black/15 disabled:opacity-40"
                    style={{ color: 'var(--sl-accent-danger)' }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
