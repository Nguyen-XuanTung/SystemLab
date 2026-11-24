import { z } from 'zod';
import {
  DEFAULT_SAFETY_LIMITS,
  ENGINE_VERSION,
  type ArchitectureGraph,
  type ComponentType,
  type ScheduledFault,
  type SimulationConfig,
  type SimulationSnapshot,
} from '@/engine/models/types';

export const SCHEMA_VERSION = 1;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB strict ceiling
export const MAX_JSON_DEPTH = 64;

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively clones plain JSON structures while stripping keys capable of
 * triggering prototype pollution and bounding recursion depth.
 */
export function stripDangerousKeys<T>(input: T, depth = 0): T {
  if (depth > MAX_JSON_DEPTH) {
    throw new Error(`JSON nesting depth exceeds safety limit (${MAX_JSON_DEPTH}).`);
  }
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => stripDangerousKeys(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    out[key] = stripDangerousKeys(value, depth + 1);
  }
  return out as T;
}

const DistributionSchema = z.enum(['fixed', 'exponential', 'lognormal']);

export const NodeConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('client'),
    ratePerSecond: z.number().finite().positive().max(50_000),
    workloadPattern: z.enum(['constant', 'poisson', 'bursty', 'ramp', 'step']),
    burstMultiplier: z.number().finite().min(1).max(20),
    burstDurationMs: z.number().finite().positive().max(300_000),
    burstPeriodMs: z.number().finite().positive().max(600_000),
    readRatio: z.number().finite().min(0).max(1),
    timeoutMs: z.number().finite().positive().max(300_000),
  }),
  z.object({
    type: z.literal('load_balancer'),
    strategy: z.enum(['round_robin', 'random', 'least_in_flight']),
    processingLatencyMs: z.number().finite().min(0).max(60_000),
    healthCheckEnabled: z.boolean(),
  }),
  z.object({
    type: z.literal('api_gateway'),
    processingLatencyMs: z.number().finite().min(0).max(60_000),
    rateLimitEnabled: z.boolean(),
    rateLimitRps: z.number().finite().positive().max(50_000),
    burstCapacity: z.number().int().min(1).max(100_000),
    routingMode: z.enum(['default', 'read_write_split']),
  }),
  z.object({
    type: z.literal('app_server'),
    concurrency: z.number().int().min(1).max(4096),
    queueCapacity: z.number().int().min(0).max(100_000),
    serviceTimeMs: z.number().finite().positive().max(300_000),
    distribution: DistributionSchema,
    cv: z.number().finite().min(0.01).max(5),
    failureProbability: z.number().finite().min(0).max(1),
    maxRetries: z.number().int().min(0).max(5),
    retryDelayMs: z.number().finite().min(0).max(60_000),
  }),
  z.object({
    type: z.literal('cache'),
    lookupLatencyMs: z.number().finite().min(0).max(60_000),
    hitProbability: z.number().finite().min(0).max(1),
    writePolicy: z.enum(['bypass', 'write_through']),
    coldStartWarmupMs: z.number().finite().min(0).max(600_000),
  }),
  z.object({
    type: z.literal('database'),
    maxConnections: z.number().int().min(1).max(4096),
    queueCapacity: z.number().int().min(0).max(100_000),
    readLatencyMs: z.number().finite().positive().max(300_000),
    writeLatencyMs: z.number().finite().positive().max(300_000),
    distribution: DistributionSchema,
    cv: z.number().finite().min(0.01).max(5),
    failureProbability: z.number().finite().min(0).max(1),
  }),
  z.object({
    type: z.literal('message_queue'),
    queueCapacity: z.number().int().min(1).max(100_000),
    enqueueLatencyMs: z.number().finite().min(0).max(60_000),
    deliveryMode: z.enum(['async_ack', 'sync_wait']),
  }),
  z.object({
    type: z.literal('worker'),
    concurrency: z.number().int().min(1).max(4096),
    processingTimeMs: z.number().finite().positive().max(300_000),
    distribution: DistributionSchema,
    cv: z.number().finite().min(0.01).max(5),
    failureProbability: z.number().finite().min(0).max(1),
  }),
  z.object({
    type: z.literal('circuit_breaker'),
    failureThreshold: z.number().int().min(1).max(10_000),
    openDurationMs: z.number().finite().positive().max(600_000),
    halfOpenMaxProbes: z.number().int().min(1).max(1000),
    processingLatencyMs: z.number().finite().min(0).max(60_000),
  }),
  z.object({
    type: z.literal('read_replica'),
    maxConnections: z.number().int().min(1).max(4096),
    queueCapacity: z.number().int().min(0).max(100_000),
    readLatencyMs: z.number().finite().positive().max(300_000),
    distribution: DistributionSchema,
    cv: z.number().finite().min(0.01).max(5),
    failureProbability: z.number().finite().min(0).max(1),
  }),
]);

export const PersistedNodeSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  config: NodeConfigSchema,
});

export const SimEdgeSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  latencyMs: z.number().finite().min(0).max(60_000),
  routeType: z.enum(['default', 'read', 'write']).default('default'),
  label: z.string().max(60).optional(),
});

export const ScheduledFaultSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum([
    'node_failure',
    'latency_spike',
    'capacity_drop',
    'traffic_spike',
    'packet_drop',
    'cache_cold_start',
    'edge_latency_spike',
    'edge_failure',
  ]),
  targetId: z.string().min(1).max(100),
  startAtMs: z.number().finite().min(0).max(3_600_000),
  durationMs: z.number().finite().min(0).max(3_600_000).nullable(),
  value: z.number().finite().min(0).max(100_000),
  label: z.string().max(120).optional(),
});

export const SimConfigSchema = z.object({
  seed: z.number().int().min(0).max(2_147_483_647),
  durationMs: z.number().int().min(1000).max(3_600_000),
  drainOnEnd: z.boolean(),
  maxDrainMs: z.number().int().min(0).max(120_000),
  safetyLimits: z
    .object({
      maxEvents: z.number().int().min(100).max(2_000_000),
      maxZeroTimeEvents: z.number().int().min(10).max(100_000),
      maxHops: z.number().int().min(2).max(256),
      maxInFlight: z.number().int().min(10).max(500_000),
    })
    .default(DEFAULT_SAFETY_LIMITS),
});

export const ProjectFileV1Schema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(120),
    description: z.string().max(1000).default(''),
    scenarioId: z.string().max(100).optional(),
    nodes: z.array(PersistedNodeSchema).max(100),
    edges: z.array(SimEdgeSchema).max(300),
    simConfig: SimConfigSchema,
    scheduledFaults: z.array(ScheduledFaultSchema).max(100).default([]),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
  })
  .superRefine((proj, ctx) => {
    const nodeIds = new Set<string>();
    for (const node of proj.nodes) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate node ID "${node.id}".`,
        });
      }
      nodeIds.add(node.id);
    }
    const edgeIds = new Set<string>();
    for (const edge of proj.edges) {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate edge ID "${edge.id}".`,
        });
      }
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge "${edge.id}" points to a non-existent node.`,
        });
      }
    }
  });

export type PersistedNode = z.infer<typeof PersistedNodeSchema>;
export type SystemLabProject = z.infer<typeof ProjectFileV1Schema>;

const ExperimentGraphNodeSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  config: NodeConfigSchema,
});

const NodeMetricsSchema = z.object({
  nodeId: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  type: z.enum([
    'client',
    'load_balancer',
    'api_gateway',
    'app_server',
    'cache',
    'database',
    'message_queue',
    'worker',
    'circuit_breaker',
    'read_replica',
  ]),
  status: z.enum(['healthy', 'degraded', 'saturated', 'failed', 'open']),
  arrivals: z.number().int().min(0),
  completions: z.number().int().min(0),
  activeRequests: z.number().int().min(0),
  queueDepth: z.number().int().min(0),
  maxQueueDepthObserved: z.number().int().min(0),
  droppedRequests: z.number().int().min(0),
  failedRequests: z.number().int().min(0),
  meanServiceTimeMs: z.number().finite().min(0).nullable(),
  meanWaitingTimeMs: z.number().finite().min(0).nullable(),
  utilization: z.number().finite().min(0).max(1),
  cacheHits: z.number().int().min(0),
  cacheMisses: z.number().int().min(0),
  cacheHitRatio: z.number().finite().min(0).max(1).nullable(),
  rateLimitedCount: z.number().int().min(0),
  dbReads: z.number().int().min(0),
  dbWrites: z.number().int().min(0),
  jobsEnqueued: z.number().int().min(0),
  jobsCompleted: z.number().int().min(0),
  jobsFailed: z.number().int().min(0),
  jobMeanLatencyMs: z.number().finite().min(0).nullable(),
  circuitState: z.enum(['closed', 'open', 'half_open']).optional(),
  circuitRejections: z.number().int().min(0),
  routedCounts: z.record(z.string(), z.number().int().min(0)),
});

export const ExperimentRecordSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  projectId: z.string().min(1).max(100),
  projectName: z.string().min(1).max(120),
  engineVersion: z.string().min(1).max(32).default(ENGINE_VERSION),
  seed: z.number().int(),
  durationMs: z.number().int().positive(),
  drainOnEnd: z.boolean(),
  graphSnapshot: z.object({
    nodes: z.array(ExperimentGraphNodeSchema).max(100),
    edges: z.array(SimEdgeSchema).max(300),
  }),
  faultTimeline: z.array(ScheduledFaultSchema).max(200),
  summaryMetrics: z.object({
    virtualTimeMs: z.number(),
    generated: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    timedOut: z.number().int(),
    inFlight: z.number().int(),
    throughputRps: z.number(),
    errorRate: z.number().nullable(),
    meanLatencyMs: z.number().nullable(),
    p50LatencyMs: z.number().nullable(),
    p95LatencyMs: z.number().nullable(),
    p99LatencyMs: z.number().nullable(),
    processedEvents: z.number().int(),
    sampleCount: z.number().int(),
  }),
  nodeMetrics: z.record(z.string(), NodeMetricsSchema),
  timeSeries: z
    .array(
      z.object({
        timeMs: z.number(),
        timeSec: z.number(),
        throughputRps: z.number(),
        meanLatencyMs: z.number().nullable(),
        p95LatencyMs: z.number().nullable(),
        errorRate: z.number().nullable(),
        inFlight: z.number(),
        totalQueueDepth: z.number(),
      }),
    )
    .max(600),
  createdAt: z.string().min(1).max(64),
});

export type ExperimentRecord = z.infer<typeof ExperimentRecordSchema>;

export interface SafeImportResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function getUtf8ByteLength(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).byteLength;
  }
  return str.length * 2;
}

/**
 * Future-proof migration hook for legacy version 0 payloads before v1 validation.
 */
export function migrateProjectPayload(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.schemaVersion === 0) {
    return {
      ...raw,
      schemaVersion: SCHEMA_VERSION,
      scheduledFaults: Array.isArray(raw.scheduledFaults) ? raw.scheduledFaults : [],
      simConfig:
        raw.simConfig && typeof raw.simConfig === 'object'
          ? {
              drainOnEnd: true,
              maxDrainMs: 15_000,
              safetyLimits: DEFAULT_SAFETY_LIMITS,
              ...(raw.simConfig as Record<string, unknown>),
            }
          : {
              seed: 42,
              durationMs: 30_000,
              drainOnEnd: true,
              maxDrainMs: 15_000,
              safetyLimits: DEFAULT_SAFETY_LIMITS,
            },
    };
  }
  return raw;
}

export function safeParseProjectJson(rawText: string): SafeImportResult<SystemLabProject> {
  if (getUtf8ByteLength(rawText) > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `Import rejected: file exceeds the ${MAX_IMPORT_BYTES / (1024 * 1024)} MB safety limit.`,
    };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(rawText);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse failed'}.`,
    };
  }

  if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
    return { ok: false, error: 'Imported JSON must be a top-level project object.' };
  }

  let sanitized: Record<string, unknown>;
  try {
    sanitized = stripDangerousKeys(parsedUnknown as Record<string, unknown>);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JSON structure.',
    };
  }
  const migrated = migrateProjectPayload(sanitized);

  if (migrated.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schemaVersion "${String(migrated.schemaVersion)}". Expected version ${SCHEMA_VERSION}.`,
    };
  }

  const validation = ProjectFileV1Schema.safeParse(migrated);
  if (!validation.success) {
    const first = validation.error.issues[0];
    return {
      ok: false,
      error: `Invalid project schema${first ? ` (${first.path.join('.') || 'root'}: ${first.message})` : ''}.`,
    };
  }

  return { ok: true, data: validation.data };
}

export function safeParseExperimentJson(rawText: string): SafeImportResult<ExperimentRecord> {
  if (getUtf8ByteLength(rawText) > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `Experiment import rejected: file exceeds ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`,
    };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(rawText);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse failed'}.`,
    };
  }

  if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
    return { ok: false, error: 'Imported JSON must be a top-level experiment object.' };
  }

  let sanitized: Record<string, unknown>;
  try {
    sanitized = stripDangerousKeys(parsedUnknown as Record<string, unknown>);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JSON structure.',
    };
  }
  const validation = ExperimentRecordSchema.safeParse(sanitized);
  if (!validation.success) {
    const first = validation.error.issues[0];
    return {
      ok: false,
      error: `Invalid experiment schema${first ? ` (${first.path.join('.') || 'root'}: ${first.message})` : ''}.`,
    };
  }
  return { ok: true, data: validation.data };
}

export function buildExperimentRecordFromSnapshot(params: {
  id: string;
  name: string;
  project: SystemLabProject;
  config: SimulationConfig;
  snapshot: SimulationSnapshot;
}): ExperimentRecord {
  const graph: ArchitectureGraph = {
    nodes: params.project.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      config: { ...n.config },
    })),
    edges: params.project.edges.map((e) => ({ ...e })),
  };
  const faults: ScheduledFault[] = params.snapshot.faultTimeline.map((f) => ({ ...f }));
  return {
    schemaVersion: SCHEMA_VERSION,
    id: params.id,
    name: params.name,
    projectId: params.project.id,
    projectName: params.project.name,
    engineVersion: params.snapshot.engineVersion,
    seed: params.config.seed,
    durationMs: params.config.durationMs,
    drainOnEnd: params.config.drainOnEnd,
    graphSnapshot: graph,
    faultTimeline: faults,
    summaryMetrics: { ...params.snapshot.global },
    nodeMetrics: { ...params.snapshot.nodeMetrics },
    timeSeries: params.snapshot.timeSeries.slice(0, 600),
    createdAt: new Date().toISOString(),
  };
}

export function isKnownComponentType(type: string): type is ComponentType {
  return [
    'client',
    'load_balancer',
    'api_gateway',
    'app_server',
    'cache',
    'database',
    'message_queue',
    'worker',
    'circuit_breaker',
    'read_replica',
  ].includes(type);
}
