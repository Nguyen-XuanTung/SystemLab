import type { ServiceDistribution } from '../random/prng';
import type { SimulationEventType } from '../events/types';

export const ENGINE_VERSION = '1.0.0';

export type ComponentType =
  | 'client'
  | 'load_balancer'
  | 'api_gateway'
  | 'app_server'
  | 'cache'
  | 'database'
  | 'message_queue'
  | 'worker'
  | 'circuit_breaker'
  | 'read_replica';

export type WorkloadPattern = 'constant' | 'poisson' | 'bursty' | 'ramp' | 'step';
export type LoadBalancerStrategy = 'round_robin' | 'random' | 'least_in_flight';
export type GatewayRoutingMode = 'default' | 'read_write_split';
export type CacheWritePolicy = 'bypass' | 'write_through';
export type QueueDeliveryMode = 'async_ack' | 'sync_wait';
export type RequestMethod = 'read' | 'write';
export type EdgeRouteType = 'default' | 'read' | 'write';

export interface ClientConfig {
  type: 'client';
  ratePerSecond: number;
  workloadPattern: WorkloadPattern;
  burstMultiplier: number;
  burstDurationMs: number;
  burstPeriodMs: number;
  readRatio: number;
  timeoutMs: number;
}

export interface LoadBalancerConfig {
  type: 'load_balancer';
  strategy: LoadBalancerStrategy;
  processingLatencyMs: number;
  healthCheckEnabled: boolean;
}

export interface ApiGatewayConfig {
  type: 'api_gateway';
  processingLatencyMs: number;
  rateLimitEnabled: boolean;
  rateLimitRps: number;
  burstCapacity: number;
  routingMode: GatewayRoutingMode;
}

export interface AppServerConfig {
  type: 'app_server';
  concurrency: number;
  queueCapacity: number;
  serviceTimeMs: number;
  distribution: ServiceDistribution;
  cv: number;
  failureProbability: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface CacheConfig {
  type: 'cache';
  lookupLatencyMs: number;
  hitProbability: number;
  writePolicy: CacheWritePolicy;
  coldStartWarmupMs: number;
}

export interface DatabaseConfig {
  type: 'database';
  maxConnections: number;
  queueCapacity: number;
  readLatencyMs: number;
  writeLatencyMs: number;
  distribution: ServiceDistribution;
  cv: number;
  failureProbability: number;
}

export interface MessageQueueConfig {
  type: 'message_queue';
  queueCapacity: number;
  enqueueLatencyMs: number;
  deliveryMode: QueueDeliveryMode;
}

export interface WorkerConfig {
  type: 'worker';
  concurrency: number;
  processingTimeMs: number;
  distribution: ServiceDistribution;
  cv: number;
  failureProbability: number;
}

export interface CircuitBreakerConfig {
  type: 'circuit_breaker';
  failureThreshold: number;
  openDurationMs: number;
  halfOpenMaxProbes: number;
  processingLatencyMs: number;
}

export interface ReadReplicaConfig {
  type: 'read_replica';
  maxConnections: number;
  queueCapacity: number;
  readLatencyMs: number;
  distribution: ServiceDistribution;
  cv: number;
  failureProbability: number;
}

export type NodeConfig =
  | ClientConfig
  | LoadBalancerConfig
  | ApiGatewayConfig
  | AppServerConfig
  | CacheConfig
  | DatabaseConfig
  | MessageQueueConfig
  | WorkerConfig
  | CircuitBreakerConfig
  | ReadReplicaConfig;

export interface SimNode {
  id: string;
  label: string;
  config: NodeConfig;
}

export interface SimEdge {
  id: string;
  source: string;
  target: string;
  latencyMs: number;
  routeType: EdgeRouteType;
  label?: string;
}

export interface ArchitectureGraph {
  nodes: SimNode[];
  edges: SimEdge[];
}

export interface SafetyLimits {
  maxEvents: number;
  maxZeroTimeEvents: number;
  maxHops: number;
  maxInFlight: number;
}

export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxEvents: 500_000,
  maxZeroTimeEvents: 10_000,
  maxHops: 64,
  maxInFlight: 100_000,
};

export interface SimulationConfig {
  seed: number;
  durationMs: number;
  drainOnEnd: boolean;
  maxDrainMs: number;
  safetyLimits: SafetyLimits;
}

export type FaultType =
  | 'node_failure'
  | 'latency_spike'
  | 'capacity_drop'
  | 'traffic_spike'
  | 'packet_drop'
  | 'cache_cold_start'
  | 'edge_latency_spike'
  | 'edge_failure';

export interface ScheduledFault {
  id: string;
  type: FaultType;
  targetId: string;
  startAtMs: number;
  durationMs: number | null; // null = permanent until manual recovery or simulation end
  value: number; // e.g., added latency ms, multiplier (0.25 for 25% capacity, 3 for 3x traffic), drop probability (0..1)
  label?: string;
}

export interface ActiveFault {
  id: string;
  type: FaultType;
  targetId: string;
  activatedAtMs: number;
  expiresAtMs: number | null;
  value: number;
  origin: 'scheduled' | 'manual';
  label?: string;
}

export type TerminalState = 'succeeded' | 'failed' | 'timed_out';
export type CircuitState = 'closed' | 'open' | 'half_open';
export type NodeRuntimeStatus = 'healthy' | 'degraded' | 'saturated' | 'failed' | 'open';

export interface RequestHop {
  nodeId: string;
  nodeLabel: string;
  nodeType: ComponentType;
  arrivedAtMs: number;
  queueWaitMs: number;
  serviceMs: number;
  departedAtMs: number;
  outcome: 'forwarded' | 'completed' | 'cache_hit' | 'cache_miss' | 'failed' | 'retried' | 'enqueued';
  note?: string;
}

export interface LogicalRequest {
  id: string;
  method: RequestMethod;
  sourceClientId: string;
  createdAtMs: number;
  deadlineMs: number;
  terminalState: TerminalState | null;
  completedAtMs: number | null;
  errorCategory: string | null;
  hopCount: number;
  retriesAttemptedOnNode: Record<string, number>;
  circuitBreakerIds: string[];
  isBackgroundJob: boolean;
  hops: RequestHop[];
}

export interface RequestTrace {
  id: string;
  method: RequestMethod;
  createdAtMs: number;
  completedAtMs: number | null;
  totalLatencyMs: number | null;
  terminalState: TerminalState | 'in_flight';
  errorCategory: string | null;
  hops: RequestHop[];
}

export interface GlobalMetrics {
  virtualTimeMs: number;
  generated: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  inFlight: number;
  throughputRps: number;
  errorRate: number | null;
  meanLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  processedEvents: number;
  sampleCount: number;
}

export interface NodeMetrics {
  nodeId: string;
  label: string;
  type: ComponentType;
  status: NodeRuntimeStatus;
  arrivals: number;
  completions: number;
  activeRequests: number;
  queueDepth: number;
  maxQueueDepthObserved: number;
  droppedRequests: number;
  failedRequests: number;
  meanServiceTimeMs: number | null;
  meanWaitingTimeMs: number | null;
  utilization: number;
  // Component-specific metrics
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatio: number | null;
  rateLimitedCount: number;
  dbReads: number;
  dbWrites: number;
  jobsEnqueued: number;
  jobsCompleted: number;
  jobsFailed: number;
  jobMeanLatencyMs: number | null;
  circuitState?: CircuitState;
  circuitRejections: number;
  routedCounts: Record<string, number>;
}

export interface TimeSeriesPoint {
  timeMs: number;
  timeSec: number;
  throughputRps: number;
  meanLatencyMs: number | null;
  p95LatencyMs: number | null;
  errorRate: number | null;
  inFlight: number;
  totalQueueDepth: number;
}

export type EventSeverity = 'info' | 'warn' | 'error';

export interface EventLogEntry {
  id: string;
  timestampMs: number;
  severity: EventSeverity;
  type: SimulationEventType;
  nodeId: string;
  requestId?: string;
  message: string;
}

export interface EdgeTrafficDelta {
  edgeId: string;
  count: number;
  errorCount: number;
  cacheHitCount: number;
}

export type EngineRunStatus =
  | 'ready'
  | 'running'
  | 'completed'
  | 'halted_safety';

export interface SimulationSnapshot {
  engineVersion: string;
  seed: number;
  virtualTimeMs: number;
  durationMs: number;
  status: EngineRunStatus;
  haltReason?: string;
  global: GlobalMetrics;
  nodeMetrics: Record<string, NodeMetrics>;
  timeSeries: TimeSeriesPoint[];
  eventLog: EventLogEntry[];
  recentTraces: RequestTrace[];
  activeFaults: ActiveFault[];
  faultTimeline: ScheduledFault[];
  edgeDeltas: EdgeTrafficDelta[];
}

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
