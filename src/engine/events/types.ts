export type SimulationEventType =
  | 'REQUEST_CREATED'
  | 'REQUEST_ARRIVED'
  | 'REQUEST_QUEUED'
  | 'SERVICE_STARTED'
  | 'SERVICE_COMPLETED'
  | 'REQUEST_FORWARDED'
  | 'REQUEST_SUCCEEDED'
  | 'REQUEST_FAILED'
  | 'REQUEST_TIMEOUT'
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'QUEUE_OVERFLOW'
  | 'RATE_LIMITED'
  | 'RETRY_SCHEDULED'
  | 'NODE_FAILED'
  | 'NODE_RECOVERED'
  | 'FAULT_ACTIVATED'
  | 'FAULT_EXPIRED'
  | 'CIRCUIT_OPENED'
  | 'CIRCUIT_HALF_OPEN'
  | 'CIRCUIT_CLOSED'
  | 'JOB_ENQUEUED'
  | 'JOB_AVAILABLE'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'METRICS_TICK';

/**
 * Deterministic priority ordering for events occurring at identical virtual timestamps.
 * Lower values run first:
 *   10: Fault / infrastructure state transitions
 *   20: Service & job completions (free worker slots before new arrivals)
 *   30: Request arrivals, forwarding, retries
 *   40: New traffic arrivals
 *   50: Request timeouts (completions at the exact deadline win)
 *   90: Periodic telemetry snapshots
 */
export const EVENT_PRIORITY: Record<SimulationEventType, number> = {
  FAULT_ACTIVATED: 10,
  FAULT_EXPIRED: 10,
  NODE_FAILED: 10,
  NODE_RECOVERED: 10,
  CIRCUIT_OPENED: 15,
  CIRCUIT_HALF_OPEN: 15,
  CIRCUIT_CLOSED: 15,
  SERVICE_COMPLETED: 20,
  JOB_COMPLETED: 20,
  JOB_FAILED: 20,
  JOB_AVAILABLE: 25,
  JOB_ENQUEUED: 25,
  REQUEST_ARRIVED: 30,
  REQUEST_FORWARDED: 30,
  RETRY_SCHEDULED: 30,
  SERVICE_STARTED: 30,
  REQUEST_QUEUED: 30,
  CACHE_HIT: 30,
  CACHE_MISS: 30,
  QUEUE_OVERFLOW: 30,
  RATE_LIMITED: 30,
  REQUEST_SUCCEEDED: 35,
  REQUEST_FAILED: 35,
  REQUEST_CREATED: 40,
  REQUEST_TIMEOUT: 50,
  METRICS_TICK: 90,
};

export interface SimEventPayload {
  requestId?: string;
  jobId?: string;
  edgeId?: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  faultId?: string;
  nodeEpoch?: number;
  isBackgroundJob?: boolean;
  reason?: string;
}

export interface SimEvent {
  id: string;
  timestampMs: number;
  type: SimulationEventType;
  priority: number;
  sequence: number;
  nodeId: string;
  payload: SimEventPayload;
}

/**
 * Total strict ordering for DES priority queue:
 * (timestampMs asc, priority asc, sequence asc).
 */
export function compareSimEvents(a: SimEvent, b: SimEvent): number {
  if (a.timestampMs !== b.timestampMs) {
    return a.timestampMs - b.timestampMs;
  }
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return a.sequence - b.sequence;
}
