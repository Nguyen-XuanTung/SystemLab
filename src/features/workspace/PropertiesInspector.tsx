import * as Tabs from '@radix-ui/react-tabs';
import * as Switch from '@radix-ui/react-switch';
import {
  AlertCircle,
  BookOpen,
  Copy,
  Info,
  Lock,
  RotateCcw,
  Sliders,
  Trash2,
  BarChart3,
} from 'lucide-react';
import { COMPONENT_DEFINITIONS, type ConfigFieldDescriptor } from '@/engine/models/nodeRegistry';
import type { NodeConfig, SimEdge } from '@/engine/models/types';
import { ComponentIcon } from '@/components/ui/ComponentIcon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMs, formatPct, hasCapacityPool } from '@/lib/format';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

function renderFieldControl(params: {
  field: ConfigFieldDescriptor;
  config: NodeConfig;
  disabled: boolean;
  onChange: (nextConfig: NodeConfig) => void;
}) {
  const { field, config, disabled, onChange } = params;
  const record = config as unknown as Record<string, unknown>;
  const rawValue = record[field.key];

  if (field.type === 'boolean') {
    const checked = Boolean(rawValue);
    return (
      <div className="flex items-center justify-between py-1">
        <div className="pr-2">
          <div className="text-xs font-medium" style={{ color: 'var(--sl-text-primary)' }}>
            {field.label}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
            {field.helpText}
          </p>
        </div>
        <Switch.Root
          checked={checked}
          disabled={disabled}
          aria-label={field.label}
          onCheckedChange={(next) => {
            onChange({ ...config, [field.key]: next } as NodeConfig);
          }}
          className="relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50"
          style={{
            backgroundColor: checked ? 'var(--sl-accent-traffic)' : 'var(--sl-bg-input)',
            borderColor: 'var(--sl-border-default)',
          }}
        >
          <Switch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
        </Switch.Root>
      </div>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <div>
        <label
          htmlFor={`field-${field.key}`}
          className="block text-xs font-medium"
          style={{ color: 'var(--sl-text-primary)' }}
        >
          {field.label}
        </label>
        <select
          id={`field-${field.key}`}
          disabled={disabled}
          value={String(rawValue ?? '')}
          onChange={(e) => {
            onChange({ ...config, [field.key]: e.target.value } as NodeConfig);
          }}
          className="mt-1 w-full rounded border px-2.5 py-1.5 text-xs disabled:opacity-50"
          style={{
            backgroundColor: 'var(--sl-bg-input)',
            borderColor: 'var(--sl-border-default)',
            color: 'var(--sl-text-primary)',
          }}
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
          {field.helpText}
        </p>
      </div>
    );
  }

  const numVal = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <label
          htmlFor={`field-${field.key}`}
          className="text-xs font-medium"
          style={{ color: 'var(--sl-text-primary)' }}
        >
          {field.label}
        </label>
        {field.unit && (
          <span className="text-[11px] font-mono-tabular" style={{ color: 'var(--sl-text-muted)' }}>
            {field.unit}
          </span>
        )}
      </div>
      <input
        id={`field-${field.key}`}
        type="number"
        disabled={disabled}
        min={field.min}
        max={field.max}
        step={field.step ?? 'any'}
        value={Number.isFinite(numVal) ? numVal : ''}
        onChange={(e) => {
          const parsed =
            field.type === 'integer' ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
          onChange({
            ...config,
            [field.key]: Number.isNaN(parsed) ? 0 : parsed,
          } as NodeConfig);
        }}
        className="mt-1 w-full rounded border px-2.5 py-1.5 text-xs font-mono-tabular disabled:opacity-50"
        style={{
          backgroundColor: 'var(--sl-bg-input)',
          borderColor: 'var(--sl-border-default)',
          color: 'var(--sl-text-primary)',
        }}
      />
      <p className="mt-0.5 text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
        {field.helpText}
      </p>
    </div>
  );
}

export function PropertiesInspector() {
  const project = useWorkspaceStore((s) => s.project);
  const selectedNodeId = useWorkspaceStore((s) => s.selectedNodeId);
  const selectedEdgeId = useWorkspaceStore((s) => s.selectedEdgeId);
  const validation = useWorkspaceStore((s) => s.validation);
  const updateNodeLabel = useWorkspaceStore((s) => s.updateNodeLabel);
  const updateNodeConfig = useWorkspaceStore((s) => s.updateNodeConfig);
  const duplicateNode = useWorkspaceStore((s) => s.duplicateNode);
  const deleteNode = useWorkspaceStore((s) => s.deleteNode);
  const updateEdge = useWorkspaceStore((s) => s.updateEdge);
  const deleteEdge = useWorkspaceStore((s) => s.deleteEdge);

  const simStatus = useSimulationStore((s) => s.status);
  const reset = useSimulationStore((s) => s.reset);
  const nodeMetrics = useSimulationStore((s) =>
    selectedNodeId ? s.snapshot?.nodeMetrics[selectedNodeId] : undefined,
  );

  const locked = simStatus === 'running' || simStatus === 'paused';

  const selectedNode = selectedNodeId
    ? project.nodes.find((n) => n.id === selectedNodeId)
    : undefined;
  const selectedEdge = selectedEdgeId
    ? project.edges.find((e) => e.id === selectedEdgeId)
    : undefined;

  if (!selectedNode && !selectedEdge) {
    return (
      <aside
        aria-label="Properties Inspector"
        className="flex h-full flex-col items-center justify-center border-l p-5 text-center"
        style={{
          backgroundColor: 'var(--sl-bg-surface)',
          borderColor: 'var(--sl-border-subtle)',
        }}
      >
        <Info className="h-7 w-7 opacity-60" style={{ color: 'var(--sl-text-muted)' }} />
        <h2 className="mt-2 text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
          No Selection
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--sl-text-muted)' }}>
          Click any component node or connection edge on the canvas to configure parameters, inspect
          live telemetry, or read distributed-systems documentation.
        </p>
      </aside>
    );
  }

  if (selectedEdge) {
    const sourceLabel =
      project.nodes.find((n) => n.id === selectedEdge.source)?.label ?? selectedEdge.source;
    const targetLabel =
      project.nodes.find((n) => n.id === selectedEdge.target)?.label ?? selectedEdge.target;

    return (
      <aside
        aria-label="Connection Inspector"
        className="flex h-full flex-col border-l"
        style={{
          backgroundColor: 'var(--sl-bg-surface)',
          borderColor: 'var(--sl-border-subtle)',
        }}
      >
        <div className="border-b px-3.5 py-3" style={{ borderColor: 'var(--sl-border-subtle)' }}>
          <div className="text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
            Connection Edge
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
            {sourceLabel} → {targetLabel}
          </div>
        </div>

        {locked && (
          <div
            className="flex items-center justify-between gap-2 border-b px-3.5 py-2 text-[11px]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--sl-accent-warning) 10%, transparent)',
              borderColor: 'var(--sl-border-subtle)',
              color: 'var(--sl-accent-warning)',
            }}
          >
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Snapshot locked while running
            </span>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium"
              style={{ borderColor: 'var(--sl-accent-warning)' }}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          <div>
            <label
              htmlFor="edge-latency-input"
              className="block text-xs font-medium"
              style={{ color: 'var(--sl-text-primary)' }}
            >
              Propagation Latency (ms)
            </label>
            <input
              id="edge-latency-input"
              type="number"
              disabled={locked}
              min={0}
              max={60000}
              value={selectedEdge.latencyMs}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                updateEdge(selectedEdge.id, { latencyMs: Number.isNaN(v) ? 0 : Math.max(0, v) });
              }}
              className="mt-1 w-full rounded border px-2.5 py-1.5 text-xs font-mono-tabular disabled:opacity-50"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="edge-route-select"
              className="block text-xs font-medium"
              style={{ color: 'var(--sl-text-primary)' }}
            >
              Route Type (API Gateway Split)
            </label>
            <select
              id="edge-route-select"
              disabled={locked}
              value={selectedEdge.routeType}
              onChange={(e) =>
                updateEdge(selectedEdge.id, {
                  routeType: e.target.value as SimEdge['routeType'],
                })
              }
              className="mt-1 w-full rounded border px-2.5 py-1.5 text-xs disabled:opacity-50"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            >
              <option value="default">Default (All Traffic)</option>
              <option value="read">Read Only</option>
              <option value="write">Write Only</option>
            </select>
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => deleteEdge(selectedEdge.id)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              style={{
                borderColor: 'color-mix(in srgb, var(--sl-accent-danger) 45%, transparent)',
                color: 'var(--sl-accent-danger)',
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Connection
            </button>
          </div>
        </div>
      </aside>
    );
  }

  const node = selectedNode!;
  const def = COMPONENT_DEFINITIONS[node.config.type];
  const nodeIssues = validation.issues.filter((i) => i.nodeId === node.id);

  return (
    <aside
      aria-label="Node Properties Inspector"
      className="flex h-full flex-col border-l"
      style={{
        backgroundColor: 'var(--sl-bg-surface)',
        borderColor: 'var(--sl-border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5"
        style={{ borderColor: 'var(--sl-border-subtle)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{
              color: def.accentVar,
              backgroundColor: `color-mix(in srgb, ${def.accentVar} 15%, transparent)`,
            }}
          >
            <ComponentIcon type={node.config.type} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div
              className="truncate text-xs font-semibold"
              style={{ color: 'var(--sl-text-primary)' }}
            >
              {node.label}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
              {def.displayName}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={locked}
            onClick={() => duplicateNode(node.id)}
            title="Duplicate node"
            aria-label="Duplicate node"
            className="rounded p-1.5 hover:bg-black/10 disabled:opacity-40"
            style={{ color: 'var(--sl-text-secondary)' }}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => deleteNode(node.id)}
            title="Delete node"
            aria-label="Delete node"
            className="rounded p-1.5 hover:bg-black/10 disabled:opacity-40"
            style={{ color: 'var(--sl-accent-danger)' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {locked && (
        <div
          className="flex items-center justify-between gap-2 border-b px-3.5 py-2 text-[11px]"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--sl-accent-warning) 10%, transparent)',
            borderColor: 'var(--sl-border-subtle)',
            color: 'var(--sl-accent-warning)',
          }}
        >
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Editing locked during active run
          </span>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium"
            style={{ borderColor: 'var(--sl-accent-warning)' }}
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      )}

      <Tabs.Root defaultValue="config" className="flex flex-1 flex-col min-h-0">
        <Tabs.List
          aria-label="Inspector sections"
          className="grid grid-cols-3 border-b text-xs"
          style={{ borderColor: 'var(--sl-border-subtle)' }}
        >
          <Tabs.Trigger
            value="config"
            className="flex items-center justify-center gap-1.5 border-b-2 border-transparent py-2 font-medium data-[state=active]:border-[var(--sl-accent-traffic)] data-[state=active]:text-[var(--sl-text-primary)]"
            style={{ color: 'var(--sl-text-secondary)' }}
          >
            <Sliders className="h-3.5 w-3.5" />
            Config
          </Tabs.Trigger>
          <Tabs.Trigger
            value="metrics"
            className="flex items-center justify-center gap-1.5 border-b-2 border-transparent py-2 font-medium data-[state=active]:border-[var(--sl-accent-traffic)] data-[state=active]:text-[var(--sl-text-primary)]"
            style={{ color: 'var(--sl-text-secondary)' }}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Metrics
          </Tabs.Trigger>
          <Tabs.Trigger
            value="learn"
            className="flex items-center justify-center gap-1.5 border-b-2 border-transparent py-2 font-medium data-[state=active]:border-[var(--sl-accent-traffic)] data-[state=active]:text-[var(--sl-text-primary)]"
            style={{ color: 'var(--sl-text-secondary)' }}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Learn
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="config" className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {nodeIssues.length > 0 && (
            <div className="space-y-1.5">
              {nodeIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="flex items-start gap-2 rounded border px-2.5 py-2 text-[11px]"
                  style={{
                    borderColor:
                      issue.severity === 'error'
                        ? 'var(--sl-accent-danger)'
                        : 'var(--sl-accent-warning)',
                    color:
                      issue.severity === 'error'
                        ? 'var(--sl-accent-danger)'
                        : 'var(--sl-accent-warning)',
                    backgroundColor:
                      issue.severity === 'error'
                        ? 'color-mix(in srgb, var(--sl-accent-danger) 10%, transparent)'
                        : 'color-mix(in srgb, var(--sl-accent-warning) 10%, transparent)',
                  }}
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <label
              htmlFor="inspector-node-label"
              className="block text-xs font-medium"
              style={{ color: 'var(--sl-text-primary)' }}
            >
              Component Name
            </label>
            <input
              id="inspector-node-label"
              type="text"
              disabled={locked}
              value={node.label}
              onChange={(e) => updateNodeLabel(node.id, e.target.value)}
              className="mt-1 w-full rounded border px-2.5 py-1.5 text-xs disabled:opacity-50"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            />
          </div>

          <div
            className="border-t pt-3 space-y-3"
            style={{ borderColor: 'var(--sl-border-subtle)' }}
          >
            {def.fields.map((field) => (
              <div key={field.key}>
                {renderFieldControl({
                  field,
                  config: node.config,
                  disabled: locked,
                  onChange: (nextCfg) => updateNodeConfig(node.id, nextCfg),
                })}
              </div>
            ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="metrics" className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {!nodeMetrics ? (
            <p className="py-6 text-center text-xs" style={{ color: 'var(--sl-text-muted)' }}>
              Run a simulation to inspect per-component metrics.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--sl-text-secondary)' }}>
                  Runtime State
                </span>
                <StatusBadge status={nodeMetrics.status} />
              </div>

              <div
                className="grid grid-cols-2 gap-2 rounded border p-2.5 text-xs font-mono-tabular"
                style={{
                  backgroundColor: 'var(--sl-bg-elevated)',
                  borderColor: 'var(--sl-border-subtle)',
                }}
              >
                <div>
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Arrivals
                  </div>
                  <div style={{ color: 'var(--sl-text-primary)' }}>{nodeMetrics.arrivals}</div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Completions
                  </div>
                  <div style={{ color: 'var(--sl-text-primary)' }}>{nodeMetrics.completions}</div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Active / Queue
                  </div>
                  <div style={{ color: 'var(--sl-text-primary)' }}>
                    {nodeMetrics.activeRequests} / {nodeMetrics.queueDepth} (max{' '}
                    {nodeMetrics.maxQueueDepthObserved})
                  </div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Dropped / Failed
                  </div>
                  <div style={{ color: 'var(--sl-accent-danger)' }}>
                    {nodeMetrics.droppedRequests} / {nodeMetrics.failedRequests}
                  </div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Mean Service
                  </div>
                  <div style={{ color: 'var(--sl-text-primary)' }}>
                    {formatMs(nodeMetrics.meanServiceTimeMs)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                    Mean Queue Wait
                  </div>
                  <div style={{ color: 'var(--sl-text-primary)' }}>
                    {formatMs(nodeMetrics.meanWaitingTimeMs)}
                  </div>
                </div>
              </div>

              {hasCapacityPool(node.config.type) ? (
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--sl-text-secondary)' }}>
                      {node.config.type === 'message_queue'
                        ? 'Queue Occupancy'
                        : 'Time-Weighted Utilization'}
                    </span>
                    <span className="font-mono-tabular" style={{ color: 'var(--sl-text-primary)' }}>
                      {formatPct(nodeMetrics.utilization)}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--sl-bg-input)' }}
                  >
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${Math.min(100, nodeMetrics.utilization * 100)}%`,
                        backgroundColor:
                          nodeMetrics.utilization > 0.85
                            ? 'var(--sl-accent-danger)'
                            : nodeMetrics.utilization > 0.65
                              ? 'var(--sl-accent-warning)'
                              : 'var(--sl-accent-compute)',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--sl-text-secondary)' }}>Utilization</span>
                  <span className="font-mono-tabular" style={{ color: 'var(--sl-text-muted)' }}>
                    N/A — Stateless component
                  </span>
                </div>
              )}

              {node.config.type === 'cache' && (
                <div
                  className="rounded border p-2.5 text-xs space-y-1 font-mono-tabular"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div
                    className="font-sans font-medium"
                    style={{ color: 'var(--sl-text-primary)' }}
                  >
                    Probabilistic Cache Telemetry
                  </div>
                  <div>Hits: {nodeMetrics.cacheHits}</div>
                  <div>Misses: {nodeMetrics.cacheMisses}</div>
                  <div>Observed Hit Ratio: {formatPct(nodeMetrics.cacheHitRatio)}</div>
                </div>
              )}

              {(node.config.type === 'database' || node.config.type === 'read_replica') && (
                <div
                  className="rounded border p-2.5 text-xs space-y-1 font-mono-tabular"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div
                    className="font-sans font-medium"
                    style={{ color: 'var(--sl-text-primary)' }}
                  >
                    Query Operations
                  </div>
                  <div>Reads: {nodeMetrics.dbReads}</div>
                  <div>Writes: {nodeMetrics.dbWrites}</div>
                </div>
              )}

              {(node.config.type === 'message_queue' || node.config.type === 'worker') && (
                <div
                  className="rounded border p-2.5 text-xs space-y-1 font-mono-tabular"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div
                    className="font-sans font-medium"
                    style={{ color: 'var(--sl-text-primary)' }}
                  >
                    Async Background Jobs
                  </div>
                  {node.config.type === 'message_queue' && (
                    <div>Enqueued: {nodeMetrics.jobsEnqueued}</div>
                  )}
                  <div>Completed: {nodeMetrics.jobsCompleted}</div>
                  <div>Failed: {nodeMetrics.jobsFailed}</div>
                  <div>Mean Job Time: {formatMs(nodeMetrics.jobMeanLatencyMs)}</div>
                </div>
              )}

              {node.config.type === 'circuit_breaker' && (
                <div
                  className="rounded border p-2.5 text-xs space-y-1 font-mono-tabular"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div
                    className="font-sans font-medium"
                    style={{ color: 'var(--sl-text-primary)' }}
                  >
                    Circuit Breaker State
                  </div>
                  <div>State: {(nodeMetrics.circuitState ?? 'closed').toUpperCase()}</div>
                  <div>Fast Rejections: {nodeMetrics.circuitRejections}</div>
                </div>
              )}

              {Object.keys(nodeMetrics.routedCounts).length > 0 && (
                <div
                  className="rounded border p-2.5 text-xs space-y-1.5"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <div className="font-medium" style={{ color: 'var(--sl-text-primary)' }}>
                    Target Routing Distribution
                  </div>
                  {Object.entries(nodeMetrics.routedCounts).map(([targetId, count]) => {
                    const targetLabel =
                      project.nodes.find((n) => n.id === targetId)?.label ?? targetId;
                    return (
                      <div key={targetId} className="flex items-center justify-between text-[11px]">
                        <span
                          className="truncate pr-2"
                          style={{ color: 'var(--sl-text-secondary)' }}
                        >
                          {targetLabel}
                        </span>
                        <span
                          className="font-mono-tabular"
                          style={{ color: 'var(--sl-text-primary)' }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Tabs.Content>

        <Tabs.Content
          value="learn"
          className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs leading-relaxed"
        >
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
              What It Is
            </h3>
            <p className="mt-0.5" style={{ color: 'var(--sl-text-secondary)' }}>
              {def.education.whatItIs}
            </p>
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
              Why It Exists
            </h3>
            <p className="mt-0.5" style={{ color: 'var(--sl-text-secondary)' }}>
              {def.education.whyItExists}
            </p>
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
              How SystemLab Models It
            </h3>
            <p className="mt-0.5" style={{ color: 'var(--sl-text-secondary)' }}>
              {def.education.howModeled}
            </p>
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
              Common Failure Modes
            </h3>
            <ul
              className="mt-1 list-disc pl-4 space-y-1"
              style={{ color: 'var(--sl-text-secondary)' }}
            >
              {def.education.failureModes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
              Model Simplifications
            </h3>
            <ul className="mt-1 list-disc pl-4 space-y-1" style={{ color: 'var(--sl-text-muted)' }}>
              {def.education.simplifications.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
