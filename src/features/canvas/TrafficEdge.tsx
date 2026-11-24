import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { useSimulationStore } from '@/store/simulationStore';
import { type CanvasFlowEdge, useWorkspaceStore } from '@/store/workspaceStore';

function TrafficEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<CanvasFlowEdge>) {
  const pulse = useSimulationStore((s) => s.edgePulseMap[id]);
  const simStatus = useSimulationStore((s) => s.status);
  const hasEdgeFault = useSimulationStore((s) =>
    Boolean(s.snapshot?.activeFaults.some((f) => f.targetId === id)),
  );
  const visMode = useWorkspaceStore((s) => s.visMode);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
  });

  const routeColor = hasEdgeFault
    ? 'var(--sl-accent-danger)'
    : selected
      ? 'var(--sl-focus-ring)'
      : data?.routeType === 'read'
        ? 'var(--sl-accent-compute)'
        : data?.routeType === 'write'
          ? 'var(--sl-accent-cache)'
          : 'var(--sl-edge-default)';

  const latencyLabel =
    data?.edgeLabel && data.edgeLabel.trim().length > 0
      ? data.edgeLabel
      : `${data?.latencyMs ?? 0} ms`;

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const showMotion =
    simStatus === 'running' &&
    visMode === 'normal' &&
    !prefersReduced &&
    pulse !== undefined &&
    pulse.count > 0;

  // Represent real frame traffic proportionally with a capped number of visual packets (1..3)
  const packetCount = showMotion ? Math.min(3, Math.max(1, Math.ceil(pulse.count / 4))) : 0;
  const packetColor =
    pulse && pulse.errorCount > 0
      ? 'var(--sl-accent-danger)'
      : pulse && pulse.cacheHitCount > 0
        ? 'var(--sl-accent-compute)'
        : 'var(--sl-accent-traffic)';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: routeColor,
          strokeWidth: selected ? 2.5 : pulse && pulse.count > 0 ? 2 : 1.5,
          strokeDasharray: hasEdgeFault ? '5 4' : undefined,
        }}
      />

      {packetCount > 0 &&
        Array.from({ length: packetCount }, (_, idx) => (
          <circle
            key={`${id}-pkt-${idx}`}
            r={3.5}
            fill={packetColor}
            className="pointer-events-none"
          >
            <animateMotion
              dur={`${0.95 - Math.min(0.45, idx * 0.15)}s`}
              begin={`${idx * 0.22}s`}
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        ))}

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: selected ? 'var(--sl-focus-ring)' : 'var(--sl-border-default)',
            color: hasEdgeFault ? 'var(--sl-accent-danger)' : 'var(--sl-text-secondary)',
          }}
          className="nodrag nopan rounded border px-1.5 py-0.5 text-[11px] font-mono-tabular shadow-xs"
        >
          {hasEdgeFault ? `${latencyLabel} · FAULT` : latencyLabel}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const TrafficEdge = memo(TrafficEdgeComponent);
