import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useSimulationStore } from '@/store/simulationStore';

export function ChartsPanel() {
  const snapshot = useSimulationStore((s) => s.snapshot);

  if (!snapshot || snapshot.timeSeries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <BarChart3 className="h-7 w-7 opacity-60" style={{ color: 'var(--sl-text-muted)' }} />
        <p className="mt-2 text-xs font-medium" style={{ color: 'var(--sl-text-primary)' }}>
          No Simulation Telemetry Yet
        </p>
        <p className="mt-1 max-w-md text-xs" style={{ color: 'var(--sl-text-muted)' }}>
          Charts render strictly from virtual-time engine buckets — never fabricated placeholder curves.
          Press Run to stream live time-series data.
        </p>
      </div>
    );
  }

  const utilizationData = Object.values(snapshot.nodeMetrics)
    .filter((n) => n.type !== 'client')
    .map((n) => ({
      name: n.label.length > 14 ? `${n.label.slice(0, 12)}…` : n.label,
      utilizationPct: Number((n.utilization * 100).toFixed(1)),
      dropped: n.droppedRequests,
    }));

  const tooltipStyle = {
    backgroundColor: 'var(--sl-bg-surface)',
    borderColor: 'var(--sl-border-default)',
    fontSize: '11px',
    color: 'var(--sl-text-primary)',
  };

  return (
    <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
      {/* Chart 1: Throughput */}
      <div
        className="rounded border p-3"
        style={{ backgroundColor: 'var(--sl-bg-elevated)', borderColor: 'var(--sl-border-subtle)' }}
      >
        <h3 className="mb-2 text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
          Throughput over Virtual Time (RPS)
        </h3>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snapshot.timeSeries}>
              <CartesianGrid stroke="var(--sl-border-subtle)" strokeDasharray="3 3" />
              <XAxis dataKey="timeSec" tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} unit="s" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="throughputRps"
                name="Throughput (RPS)"
                stroke="var(--sl-accent-traffic)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Latency Mean & P95 */}
      <div
        className="rounded border p-3"
        style={{ backgroundColor: 'var(--sl-bg-elevated)', borderColor: 'var(--sl-border-subtle)' }}
      >
        <h3 className="mb-2 text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
          Mean &amp; P95 Latency over Virtual Time (ms)
        </h3>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snapshot.timeSeries}>
              <CartesianGrid stroke="var(--sl-border-subtle)" strokeDasharray="3 3" />
              <XAxis dataKey="timeSec" tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} unit="s" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} width={42} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line
                type="monotone"
                dataKey="meanLatencyMs"
                name="Mean (ms)"
                stroke="var(--sl-accent-compute)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="p95LatencyMs"
                name="P95 (ms)"
                stroke="var(--sl-accent-cache)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 3: Error Rate & Total Queue Depth */}
      <div
        className="rounded border p-3"
        style={{ backgroundColor: 'var(--sl-bg-elevated)', borderColor: 'var(--sl-border-subtle)' }}
      >
        <h3 className="mb-2 text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
          Error Rate (%) &amp; Total Queue Depth
        </h3>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snapshot.timeSeries}>
              <CartesianGrid stroke="var(--sl-border-subtle)" strokeDasharray="3 3" />
              <XAxis dataKey="timeSec" tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} unit="s" />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} width={38} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }}
                width={38}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="errorRate"
                name="Error Rate (%)"
                stroke="var(--sl-accent-danger)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="totalQueueDepth"
                name="Queue Depth"
                stroke="var(--sl-accent-messaging)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 4: Node Utilization */}
      <div
        className="rounded border p-3"
        style={{ backgroundColor: 'var(--sl-bg-elevated)', borderColor: 'var(--sl-border-subtle)' }}
      >
        <h3 className="mb-2 text-xs font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
          Component Utilization (%)
        </h3>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={utilizationData} layout="vertical" margin={{ left: 10, right: 16 }}>
              <CartesianGrid stroke="var(--sl-border-subtle)" strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--sl-text-muted)' }} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--sl-text-secondary)' }} width={96} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="utilizationPct"
                name="Utilization %"
                fill="var(--sl-accent-routing)"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
