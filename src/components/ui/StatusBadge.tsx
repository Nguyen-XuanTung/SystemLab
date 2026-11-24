import { AlertTriangle, CheckCircle2, Flame, ShieldOff, XCircle } from 'lucide-react';
import type { NodeRuntimeStatus } from '@/engine/models/types';

interface StatusBadgeProps {
  status: NodeRuntimeStatus;
  compact?: boolean;
}

const STATUS_META: Record<
  NodeRuntimeStatus,
  { label: string; colorVar: string; Icon: typeof CheckCircle2 }
> = {
  healthy: { label: 'HEALTHY', colorVar: 'var(--sl-accent-success)', Icon: CheckCircle2 },
  degraded: { label: 'DEGRADED', colorVar: 'var(--sl-accent-warning)', Icon: AlertTriangle },
  saturated: { label: 'SATURATED', colorVar: 'var(--sl-accent-danger)', Icon: Flame },
  failed: { label: 'FAILED', colorVar: 'var(--sl-accent-danger)', Icon: XCircle },
  open: { label: 'CB OPEN', colorVar: 'var(--sl-accent-danger)', Icon: ShieldOff },
};

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const { label, colorVar, Icon } = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tracking-tight"
      style={{
        color: colorVar,
        border: `1px solid color-mix(in srgb, ${colorVar} 38%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${colorVar} 12%, transparent)`,
      }}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {!compact && <span>{label}</span>}
      {compact && <span>{label}</span>}
    </span>
  );
}
