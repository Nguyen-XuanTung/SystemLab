import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, AlertTriangle, Zap } from 'lucide-react';
import { COMPONENT_DEFINITIONS } from '@/engine/models/nodeRegistry';
import { ComponentIcon } from '@/components/ui/ComponentIcon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatPct } from '@/lib/format';
import { useSimulationStore } from '@/store/simulationStore';
import { type CanvasFlowNode, useWorkspaceStore } from '@/store/workspaceStore';

function SystemNodeComponent({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const def = COMPONENT_DEFINITIONS[data.config.type];
  const nodeMetrics = useSimulationStore((s) => s.snapshot?.nodeMetrics[id]);
  const hasFault = useSimulationStore((s) =>
    Boolean(s.snapshot?.activeFaults.some((f) => f.targetId === id)),
  );
  const validationIssue = useWorkspaceStore((s) =>
    s.validation.issues.find((i) => i.nodeId === id),
  );

  const status = nodeMetrics?.status ?? 'healthy';
  const isErrorHighlight = status === 'failed' || status === 'open';
  const borderColor = selected
    ? 'var(--sl-focus-ring)'
    : isErrorHighlight
      ? 'var(--sl-accent-danger)'
      : status === 'saturated' || status === 'degraded'
        ? 'var(--sl-accent-warning)'
        : 'var(--sl-border-default)';

  return (
    <div
      data-testid={`canvas-node-${id}`}
      className="min-w-[216px] max-w-[244px] rounded-lg border transition-shadow"
      style={{
        backgroundColor: 'var(--sl-bg-surface)',
        borderColor,
        boxShadow: selected
          ? '0 0 0 2px color-mix(in srgb, var(--sl-focus-ring) 35%, transparent)'
          : 'var(--sl-shadow-sm)',
      }}
    >
      {/* Semantic top category indicator bar */}
      <div
        className="h-1 w-full rounded-t-lg"
        style={{ backgroundColor: isErrorHighlight ? 'var(--sl-accent-danger)' : def.accentVar }}
      />

      {def.allowIncoming && (
        <Handle
          type="target"
          position={Position.Left}
          aria-label={`Incoming connection handle for ${data.label}`}
          className="!h-3 !w-3 !border-2"
          style={{
            backgroundColor: 'var(--sl-bg-elevated)',
            borderColor: def.accentVar,
          }}
        />
      )}

      {def.allowOutgoing && (
        <Handle
          type="source"
          position={Position.Right}
          aria-label={`Outgoing connection handle for ${data.label}`}
          className="!h-3 !w-3 !border-2"
          style={{
            backgroundColor: 'var(--sl-bg-elevated)',
            borderColor: def.accentVar,
          }}
        />
      )}

      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
              style={{
                color: def.accentVar,
                backgroundColor: `color-mix(in srgb, ${def.accentVar} 14%, transparent)`,
              }}
            >
              <ComponentIcon type={data.config.type} className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div
                className="truncate text-xs font-semibold"
                style={{ color: 'var(--sl-text-primary)' }}
                title={data.label}
              >
                {data.label}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                {def.shortLabel}
              </div>
            </div>
          </div>

          {validationIssue && (
            <span
              title={validationIssue.message}
              aria-label={validationIssue.message}
              className="shrink-0 pt-0.5"
              style={{
                color:
                  validationIssue.severity === 'error'
                    ? 'var(--sl-accent-danger)'
                    : 'var(--sl-accent-warning)',
              }}
            >
              {validationIssue.severity === 'error' ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </span>
          )}
        </div>

        {/* Runtime Status & Active Chaos Fault Indicator */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={status} compact />
          {hasFault && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                color: 'var(--sl-accent-danger)',
                backgroundColor: 'color-mix(in srgb, var(--sl-accent-danger) 14%, transparent)',
              }}
            >
              <Zap className="h-3 w-3" aria-hidden="true" />
              Fault
            </span>
          )}
        </div>

        {/* Live Telemetry Mini-Strip (never fabricated when unpopulated) */}
        <div
          className="mt-2.5 grid grid-cols-3 gap-1 border-t pt-2 text-[11px] font-mono-tabular"
          style={{ borderColor: 'var(--sl-border-subtle)' }}
        >
          <div>
            <div style={{ color: 'var(--sl-text-muted)' }}>In</div>
            <div style={{ color: 'var(--sl-text-primary)' }}>
              {nodeMetrics ? nodeMetrics.arrivals : '—'}
            </div>
          </div>

          {data.config.type === 'cache' ? (
            <div>
              <div style={{ color: 'var(--sl-text-muted)' }}>Hit%</div>
              <div style={{ color: 'var(--sl-accent-cache)' }}>
                {nodeMetrics ? formatPct(nodeMetrics.cacheHitRatio) : '—'}
              </div>
            </div>
          ) : data.config.type === 'message_queue' ? (
            <div>
              <div style={{ color: 'var(--sl-text-muted)' }}>Queue</div>
              <div style={{ color: 'var(--sl-accent-messaging)' }}>
                {nodeMetrics ? `${nodeMetrics.queueDepth}/${data.config.queueCapacity}` : '—'}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: 'var(--sl-text-muted)' }}>Queue</div>
              <div style={{ color: 'var(--sl-text-primary)' }}>
                {nodeMetrics ? nodeMetrics.queueDepth : '—'}
              </div>
            </div>
          )}

          <div>
            <div style={{ color: 'var(--sl-text-muted)' }}>
              {data.config.type === 'api_gateway' ? 'RL' : 'Util'}
            </div>
            <div style={{ color: 'var(--sl-text-primary)' }}>
              {nodeMetrics
                ? data.config.type === 'api_gateway'
                  ? nodeMetrics.rateLimitedCount
                  : formatPct(nodeMetrics.utilization)
                : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SystemNode = memo(SystemNodeComponent);
