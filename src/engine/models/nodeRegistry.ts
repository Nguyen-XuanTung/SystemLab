import type { ComponentType, NodeConfig } from './types';

export type NodeCategory =
  'clients' | 'networking' | 'compute' | 'caching' | 'storage' | 'messaging';

export type ConfigFieldType = 'number' | 'integer' | 'select' | 'boolean';

export interface ConfigFieldOption {
  label: string;
  value: string;
}

export interface ConfigFieldDescriptor {
  key: string;
  label: string;
  type: ConfigFieldType;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: ConfigFieldOption[];
  helpText: string;
}

export interface NodeEducationDoc {
  whatItIs: string;
  whyItExists: string;
  howModeled: string;
  keyParameters: string[];
  failureModes: string[];
  tradeoffs: string[];
  simplifications: string[];
  furtherReading: string[];
}

export interface ComponentDefinition {
  type: ComponentType;
  displayName: string;
  shortLabel: string;
  category: NodeCategory;
  accentVar: string;
  defaultLabel: string;
  defaultConfig: () => NodeConfig;
  allowIncoming: boolean;
  allowOutgoing: boolean;
  fields: ConfigFieldDescriptor[];
  education: NodeEducationDoc;
}

export const COMPONENT_DEFINITIONS: Record<ComponentType, ComponentDefinition> = {
  client: {
    type: 'client',
    displayName: 'Client / Traffic Generator',
    shortLabel: 'Client',
    category: 'clients',
    accentVar: 'var(--sl-accent-traffic)',
    defaultLabel: 'Client Traffic',
    allowIncoming: false,
    allowOutgoing: true,
    defaultConfig: () => ({
      type: 'client',
      ratePerSecond: 20,
      workloadPattern: 'constant',
      burstMultiplier: 3,
      burstDurationMs: 2000,
      burstPeriodMs: 6000,
      readRatio: 0.8,
      timeoutMs: 2500,
    }),
    fields: [
      {
        key: 'ratePerSecond',
        label: 'Request Rate',
        type: 'number',
        unit: 'RPS',
        min: 0.1,
        max: 50000,
        step: 1,
        helpText: 'Baseline logical requests generated per simulated second.',
      },
      {
        key: 'workloadPattern',
        label: 'Workload Pattern',
        type: 'select',
        options: [
          { label: 'Constant', value: 'constant' },
          { label: 'Poisson', value: 'poisson' },
          { label: 'Bursty', value: 'bursty' },
          { label: 'Ramp-Up', value: 'ramp' },
          { label: 'Step', value: 'step' },
        ],
        helpText: 'Arrival spacing law driving virtual timestamps.',
      },
      {
        key: 'readRatio',
        label: 'Read Ratio',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        helpText: 'Fraction of requests tagged as reads (remainder are writes).',
      },
      {
        key: 'timeoutMs',
        label: 'Request Timeout',
        type: 'number',
        unit: 'ms',
        min: 10,
        max: 120000,
        step: 50,
        helpText: 'End-to-end deadline after which in-flight logical requests time out.',
      },
      {
        key: 'burstMultiplier',
        label: 'Burst / Step Multiplier',
        type: 'number',
        unit: 'x',
        min: 1,
        max: 20,
        step: 0.5,
        helpText: 'Multiplier applied during burst or step high-load windows.',
      },
      {
        key: 'burstDurationMs',
        label: 'Burst Window',
        type: 'integer',
        unit: 'ms',
        min: 100,
        max: 60000,
        step: 250,
        helpText: 'Active high-load window length inside each burst period.',
      },
      {
        key: 'burstPeriodMs',
        label: 'Burst Period',
        type: 'integer',
        unit: 'ms',
        min: 200,
        max: 120000,
        step: 500,
        helpText: 'Total cycle duration before the next burst window starts.',
      },
    ],
    education: {
      whatItIs:
        'Synthetic workload generator representing external API consumers, mobile clients, or upstream callers.',
      whyItExists:
        'Every performance experiment starts with a reproducible arrival process, read/write mix, and client-side timeout budget.',
      howModeled:
        'Emits logical requests using Constant, Poisson (exponential inter-arrivals), Bursty, Ramp-Up, or Step schedules, and enforces end-to-end deadlines via REQUEST_TIMEOUT.',
      keyParameters: ['ratePerSecond', 'workloadPattern', 'readRatio', 'timeoutMs'],
      failureModes: [
        'Client timeout exhaustion when downstream queues grow faster than deadline budget.',
        'Burst spikes saturating fixed-capacity backend pools.',
      ],
      tradeoffs: [
        'Shorter timeouts fail fast and bound waiting, while longer timeouts ride out transient spikes at the cost of holding slots open.',
      ],
      simplifications: [
        'Models open-loop arrivals (arrivals do not automatically slow down when the server stalls unless rate-limited or dropped).',
      ],
      furtherReading: ['Open vs. Closed Load Models — Bianca Schroeder et al., NSDI'],
    },
  },

  load_balancer: {
    type: 'load_balancer',
    displayName: 'Load Balancer',
    shortLabel: 'Load Balancer',
    category: 'networking',
    accentVar: 'var(--sl-accent-routing)',
    defaultLabel: 'Load Balancer',
    allowIncoming: true,
    allowOutgoing: true,
    defaultConfig: () => ({
      type: 'load_balancer',
      strategy: 'round_robin',
      processingLatencyMs: 2,
      healthCheckEnabled: true,
    }),
    fields: [
      {
        key: 'strategy',
        label: 'Routing Strategy',
        type: 'select',
        options: [
          { label: 'Round-Robin', value: 'round_robin' },
          { label: 'Least In-Flight', value: 'least_in_flight' },
          { label: 'Random', value: 'random' },
        ],
        helpText: 'Policy used to choose among healthy downstream targets.',
      },
      {
        key: 'processingLatencyMs',
        label: 'Proxy Latency',
        type: 'number',
        unit: 'ms',
        min: 0,
        max: 5000,
        step: 1,
        helpText: 'Fixed forwarding overhead added by the load balancer.',
      },
      {
        key: 'healthCheckEnabled',
        label: 'Health-Aware Routing',
        type: 'boolean',
        helpText: 'Skips targets currently in failed state when active.',
      },
    ],
    education: {
      whatItIs:
        'Layer-4/Layer-7 traffic distributor that spreads incoming requests across multiple healthy backend instances.',
      whyItExists:
        'Enables horizontal scaling and improves availability when individual server instances fail or slow down.',
      howModeled:
        'Supports deterministic Round-Robin, Random (via SeededRng), and Least-In-Flight (active + queued requests at target) with optional health filtering.',
      keyParameters: ['strategy', 'healthCheckEnabled', 'processingLatencyMs'],
      failureModes: [
        'Routing into failed nodes if health checks are disabled.',
        'Uneven latency tail under Round-Robin when backend capacities differ.',
      ],
      tradeoffs: [
        'Round-Robin is simple and stateless; Least-In-Flight adapts better to heterogeneous or degraded servers at the cost of tracking active state.',
      ],
      simplifications: [
        'Health checks reflect instantaneous node failure state rather than delayed periodic probe intervals.',
      ],
      furtherReading: [
        'Nginx Load Balancing Algorithms',
        'The Power of Two Choices — Mitzenmacher',
      ],
    },
  },

  api_gateway: {
    type: 'api_gateway',
    displayName: 'API Gateway',
    shortLabel: 'API Gateway',
    category: 'networking',
    accentVar: 'var(--sl-accent-traffic)',
    defaultLabel: 'API Gateway',
    allowIncoming: true,
    allowOutgoing: true,
    defaultConfig: () => ({
      type: 'api_gateway',
      processingLatencyMs: 3,
      rateLimitEnabled: true,
      rateLimitRps: 60,
      burstCapacity: 20,
      routingMode: 'default',
    }),
    fields: [
      {
        key: 'processingLatencyMs',
        label: 'Gateway Latency',
        type: 'number',
        unit: 'ms',
        min: 0,
        max: 5000,
        step: 1,
        helpText: 'Fixed auth/routing overhead per accepted request.',
      },
      {
        key: 'rateLimitEnabled',
        label: 'Enable Token Bucket',
        type: 'boolean',
        helpText: 'Enforces admission control using a continuous virtual-time token bucket.',
      },
      {
        key: 'rateLimitRps',
        label: 'Rate Limit',
        type: 'number',
        unit: 'RPS',
        min: 0.1,
        max: 50000,
        step: 5,
        helpText: 'Sustained token refill rate in requests per second.',
      },
      {
        key: 'burstCapacity',
        label: 'Burst Capacity',
        type: 'integer',
        unit: 'tokens',
        min: 1,
        max: 10000,
        step: 5,
        helpText: 'Maximum tokens stored in the bucket for short traffic bursts.',
      },
      {
        key: 'routingMode',
        label: 'Routing Mode',
        type: 'select',
        options: [
          { label: 'Default Forward', value: 'default' },
          { label: 'Read / Write Split', value: 'read_write_split' },
        ],
        helpText: 'Routes reads vs. writes along matching labeled edges.',
      },
    ],
    education: {
      whatItIs:
        'Edge entry point handling request validation, routing rules, and rate limiting before requests hit core compute.',
      whyItExists:
        'Protects downstream services from abusive bursts and lets read/write paths route independently.',
      howModeled:
        'Uses a continuous-time Token Bucket refilled proportionally to elapsed virtual time. Requests arriving with <1 token are rejected immediately as RATE_LIMITED.',
      keyParameters: ['rateLimitEnabled', 'rateLimitRps', 'burstCapacity', 'routingMode'],
      failureModes: [
        'Overly strict limits reject legitimate spikes (availability drop on caller side).',
        'Overly permissive limits allow overload into downstream databases.',
      ],
      tradeoffs: [
        'Rejecting excess load at the edge trades partial client errors for preserving healthy low-latency service for admitted requests.',
      ],
      simplifications: [
        'Global single-bucket limiter per gateway node rather than per-API-key or distributed Redis token buckets.',
      ],
      furtherReading: ['Stripe Engineering — Scaling your API with rate limiters'],
    },
  },

  app_server: {
    type: 'app_server',
    displayName: 'Application Server',
    shortLabel: 'App Server',
    category: 'compute',
    accentVar: 'var(--sl-accent-compute)',
    defaultLabel: 'App Server',
    allowIncoming: true,
    allowOutgoing: true,
    defaultConfig: () => ({
      type: 'app_server',
      concurrency: 4,
      queueCapacity: 50,
      serviceTimeMs: 40,
      distribution: 'fixed',
      cv: 0.5,
      failureProbability: 0,
      maxRetries: 0,
      retryDelayMs: 50,
    }),
    fields: [
      {
        key: 'concurrency',
        label: 'Worker Concurrency',
        type: 'integer',
        min: 1,
        max: 512,
        step: 1,
        helpText: 'Simultaneous requests this server instance can execute.',
      },
      {
        key: 'queueCapacity',
        label: 'Queue Capacity',
        type: 'integer',
        min: 0,
        max: 10000,
        step: 5,
        helpText: 'Bounded FIFO queue size before new requests overflow.',
      },
      {
        key: 'serviceTimeMs',
        label: 'Mean Service Time',
        type: 'number',
        unit: 'ms',
        min: 0.5,
        max: 60000,
        step: 5,
        helpText: 'CPU/business logic processing time before downstream calls or response.',
      },
      {
        key: 'distribution',
        label: 'Latency Distribution',
        type: 'select',
        options: [
          { label: 'Fixed', value: 'fixed' },
          { label: 'Exponential', value: 'exponential' },
          { label: 'Lognormal', value: 'lognormal' },
        ],
        helpText: 'Probability distribution for service time sampling.',
      },
      {
        key: 'cv',
        label: 'Lognormal CV',
        type: 'number',
        min: 0.05,
        max: 5,
        step: 0.1,
        helpText: 'Coefficient of variation (sigma / mean) when using Lognormal distribution.',
      },
      {
        key: 'failureProbability',
        label: 'Failure Probability',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        helpText: 'Per-request internal error probability (0 to 1).',
      },
      {
        key: 'maxRetries',
        label: 'Max Retries',
        type: 'integer',
        min: 0,
        max: 5,
        step: 1,
        helpText:
          'Bounded local retry attempts on transient failure (preserves logical request ID).',
      },
      {
        key: 'retryDelayMs',
        label: 'Retry Delay',
        type: 'number',
        unit: 'ms',
        min: 0,
        max: 10000,
        step: 10,
        helpText: 'Backoff delay before re-attempting after a failed try.',
      },
    ],
    education: {
      whatItIs:
        'Stateless compute tier executing application logic, calling caches/databases, and managing worker concurrency.',
      whyItExists:
        'Core processing unit whose worker pool size and service latency determine sustainable throughput (Little’s Law).',
      howModeled:
        'G/G/c/K queue: finite worker pool (c) + finite FIFO queue (K). Tracks time-weighted utilization, queue waiting time, and bounded retries without double-counting logical requests.',
      keyParameters: [
        'concurrency',
        'queueCapacity',
        'serviceTimeMs',
        'distribution',
        'maxRetries',
      ],
      failureModes: [
        'Queue buildup and tail latency spike when arrival rate approaches or exceeds c / E[S].',
        'Retry amplification worsening downstream congestion during partial failures.',
      ],
      tradeoffs: [
        'Larger queues absorb short bursts without errors, but excessive queues increase waiting latency until requests time out.',
      ],
      simplifications: [
        'Uses a single worker pool model without OS context-switch penalties, GC pauses, or memory-per-connection limits.',
      ],
      furtherReading: ['Little’s Law (L = lambda * W)', 'The Tail at Scale — Dean & Barroso'],
    },
  },

  cache: {
    type: 'cache',
    displayName: 'Cache (Probabilistic)',
    shortLabel: 'Cache',
    category: 'caching',
    accentVar: 'var(--sl-accent-cache)',
    defaultLabel: 'Cache Layer',
    allowIncoming: true,
    allowOutgoing: true,
    defaultConfig: () => ({
      type: 'cache',
      lookupLatencyMs: 2,
      hitProbability: 0.8,
      writePolicy: 'bypass',
      coldStartWarmupMs: 5000,
    }),
    fields: [
      {
        key: 'lookupLatencyMs',
        label: 'Lookup Latency',
        type: 'number',
        unit: 'ms',
        min: 0,
        max: 1000,
        step: 0.5,
        helpText: 'Fast in-memory lookup time.',
      },
      {
        key: 'hitProbability',
        label: 'Hit Probability',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        helpText: 'Configured probability that a read request is served directly by the cache.',
      },
      {
        key: 'writePolicy',
        label: 'Write Policy',
        type: 'select',
        options: [
          { label: 'Bypass on Write', value: 'bypass' },
          { label: 'Write-Through', value: 'write_through' },
        ],
        helpText: 'How write requests traverse the cache toward the origin.',
      },
      {
        key: 'coldStartWarmupMs',
        label: 'Cold-Start Warmup',
        type: 'integer',
        unit: 'ms',
        min: 0,
        max: 60000,
        step: 500,
        helpText: 'Linear recovery time when a Cache Cold Start fault is triggered.',
      },
    ],
    education: {
      whatItIs:
        'Low-latency in-memory layer placed in front of slower databases to absorb repeated read traffic.',
      whyItExists:
        'Reduces end-to-end read latency and protects primary storage capacity from read saturation.',
      howModeled:
        'Explicitly uses a **probabilistic cache hit model** (seeded Bernoulli trial per read). On CACHE_HIT, completes in lookupLatencyMs; on CACHE_MISS, forwards to origin.',
      keyParameters: ['hitProbability', 'lookupLatencyMs', 'writePolicy', 'coldStartWarmupMs'],
      failureModes: [
        'Cache cold start or flush suddenly sending 100% miss traffic to the database (thundering herd).',
      ],
      tradeoffs: [
        'Higher hit rates dramatically improve latency and DB headroom, while writes or cold starts expose underlying DB capacity.',
      ],
      simplifications: [
        'Does NOT simulate individual keys, TTL expiration clocks, or stateful LRU/LFU eviction sets.',
      ],
      furtherReading: ['Scaling Memcache at Facebook — Nishtala et al.'],
    },
  },

  database: {
    type: 'database',
    displayName: 'Primary Database',
    shortLabel: 'Database',
    category: 'storage',
    accentVar: 'var(--sl-accent-storage)',
    defaultLabel: 'Database',
    allowIncoming: true,
    allowOutgoing: false,
    defaultConfig: () => ({
      type: 'database',
      maxConnections: 5,
      queueCapacity: 40,
      readLatencyMs: 25,
      writeLatencyMs: 60,
      distribution: 'fixed',
      cv: 0.4,
      failureProbability: 0,
    }),
    fields: [
      {
        key: 'maxConnections',
        label: 'Max Connections',
        type: 'integer',
        min: 1,
        max: 512,
        step: 1,
        helpText: 'Maximum concurrent queries executed by the database pool.',
      },
      {
        key: 'queueCapacity',
        label: 'Connection Wait Queue',
        type: 'integer',
        min: 0,
        max: 10000,
        step: 5,
        helpText: 'Pending queries waiting for an open database connection.',
      },
      {
        key: 'readLatencyMs',
        label: 'Read Latency',
        type: 'number',
        unit: 'ms',
        min: 0.5,
        max: 60000,
        step: 5,
        helpText: 'Mean execution latency for read operations.',
      },
      {
        key: 'writeLatencyMs',
        label: 'Write Latency',
        type: 'number',
        unit: 'ms',
        min: 0.5,
        max: 60000,
        step: 5,
        helpText: 'Mean execution latency for write operations.',
      },
      {
        key: 'distribution',
        label: 'Latency Distribution',
        type: 'select',
        options: [
          { label: 'Fixed', value: 'fixed' },
          { label: 'Exponential', value: 'exponential' },
          { label: 'Lognormal', value: 'lognormal' },
        ],
        helpText: 'Service time distribution for queries.',
      },
      {
        key: 'failureProbability',
        label: 'Failure Probability',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        helpText: 'Probability of query failure (0 to 1).',
      },
    ],
    education: {
      whatItIs:
        'Durable primary data store serving read and write queries behind a bounded connection pool.',
      whyItExists:
        'Databases are commonly the most constrained stateful bottleneck in distributed architectures.',
      howModeled:
        'Separate read and write latencies executed across a bounded maxConnections pool and wait queue, tracking read/write counters and pool saturation.',
      keyParameters: ['maxConnections', 'readLatencyMs', 'writeLatencyMs', 'queueCapacity'],
      failureModes: [
        'Connection pool saturation causing cascading latency and timeouts upstream.',
        'High write ratios starving read latency without read replicas.',
      ],
      tradeoffs: [
        'Increasing maxConnections beyond hardware I/O limits cannot sustainably raise throughput and increases contention in real systems.',
      ],
      simplifications: [
        'Models pooled query latency without row/table lock contention graphs, WAL fsync batching, or disk IOPS curves.',
      ],
      furtherReading: ['Designing Data-Intensive Applications — Martin Kleppmann'],
    },
  },

  message_queue: {
    type: 'message_queue',
    displayName: 'Message Queue',
    shortLabel: 'Message Queue',
    category: 'messaging',
    accentVar: 'var(--sl-accent-messaging)',
    defaultLabel: 'Message Queue',
    allowIncoming: true,
    allowOutgoing: true,
    defaultConfig: () => ({
      type: 'message_queue',
      queueCapacity: 200,
      enqueueLatencyMs: 3,
      deliveryMode: 'async_ack',
    }),
    fields: [
      {
        key: 'queueCapacity',
        label: 'Queue Capacity',
        type: 'integer',
        min: 1,
        max: 50000,
        step: 25,
        helpText: 'Maximum buffered jobs before backpressure drops incoming requests.',
      },
      {
        key: 'enqueueLatencyMs',
        label: 'Enqueue Latency',
        type: 'number',
        unit: 'ms',
        min: 0,
        max: 5000,
        step: 1,
        helpText: 'Broker acknowledgement delay.',
      },
      {
        key: 'deliveryMode',
        label: 'Delivery Mode',
        type: 'select',
        options: [
          { label: 'Async Ack (Decoupled)', value: 'async_ack' },
          { label: 'Sync Wait (RPC over Queue)', value: 'sync_wait' },
        ],
        helpText:
          'Async Ack completes HTTP caller on enqueue; Sync Wait blocks until worker finishes.',
      },
    ],
    education: {
      whatItIs:
        'Durable asynchronous buffer decoupling request producers from downstream background workers.',
      whyItExists:
        'Smooths traffic spikes, keeps user-facing response latency fast, and absorbs slow downstream processing.',
      howModeled:
        'Maintains a finite FIFO job buffer. In async_ack mode, logical requests succeed immediately after enqueueLatencyMs while background jobs wait for Worker consumption.',
      keyParameters: ['queueCapacity', 'enqueueLatencyMs', 'deliveryMode'],
      failureModes: [
        'Unchecked queue depth growth when producer rate exceeds consumer throughput.',
        'Queue overflow rejecting new requests under sustained backpressure.',
      ],
      tradeoffs: [
        'Decoupling improves user-facing latency and spike resilience at the expense of eventual consistency / background completion delay.',
      ],
      simplifications: [
        'Single logical FIFO queue without consumer group partitions, visibility timeouts, or dead-letter routing.',
      ],
      furtherReading: ['Enterprise Integration Patterns', 'AWS SQS Architecture Concepts'],
    },
  },

  worker: {
    type: 'worker',
    displayName: 'Background Worker',
    shortLabel: 'Worker',
    category: 'messaging',
    accentVar: 'var(--sl-accent-messaging)',
    defaultLabel: 'Background Worker',
    allowIncoming: true,
    allowOutgoing: true,
    defaultConfig: () => ({
      type: 'worker',
      concurrency: 4,
      processingTimeMs: 80,
      distribution: 'fixed',
      cv: 0.4,
      failureProbability: 0,
    }),
    fields: [
      {
        key: 'concurrency',
        label: 'Consumer Concurrency',
        type: 'integer',
        min: 1,
        max: 512,
        step: 1,
        helpText: 'Parallel background jobs this worker pool consumes simultaneously.',
      },
      {
        key: 'processingTimeMs',
        label: 'Job Processing Time',
        type: 'number',
        unit: 'ms',
        min: 0.5,
        max: 60000,
        step: 5,
        helpText: 'Time to process one dequeued background job.',
      },
      {
        key: 'distribution',
        label: 'Latency Distribution',
        type: 'select',
        options: [
          { label: 'Fixed', value: 'fixed' },
          { label: 'Exponential', value: 'exponential' },
          { label: 'Lognormal', value: 'lognormal' },
        ],
        helpText: 'Job duration distribution.',
      },
      {
        key: 'failureProbability',
        label: 'Job Failure Probability',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        helpText: 'Probability of background job failure.',
      },
    ],
    education: {
      whatItIs: 'Asynchronous consumer pool pulling queued tasks from an upstream Message Queue.',
      whyItExists:
        'Executes heavy work (emails, video transcoding, billing, webhooks) off the critical request path.',
      howModeled:
        'Pulls jobs whenever capacity is free, runs processingTimeMs across concurrency slots, and optionally calls downstream databases using background-tagged hops.',
      keyParameters: ['concurrency', 'processingTimeMs', 'failureProbability'],
      failureModes: [
        'Consumer lag rising linearly whenever job arrival rate exceeds concurrency / processingTime.',
      ],
      tradeoffs: [
        'Adding workers drains queues faster, but can shift the bottleneck downstream if workers write to a primary DB.',
      ],
      simplifications: ['Models pull-based single-job execution without batch prefetching.'],
      furtherReading: ['Google SRE Workbook — Managing Load'],
    },
  },

  circuit_breaker: {
    type: 'circuit_breaker',
    displayName: 'Circuit Breaker',
    shortLabel: 'Circuit Breaker',
    category: 'networking',
    accentVar: 'var(--sl-accent-routing)',
    defaultLabel: 'Circuit Breaker',
    allowIncoming: true,
    allowOutgoing: true,
    defaultConfig: () => ({
      type: 'circuit_breaker',
      failureThreshold: 5,
      openDurationMs: 3000,
      halfOpenMaxProbes: 2,
      processingLatencyMs: 1,
    }),
    fields: [
      {
        key: 'failureThreshold',
        label: 'Failure Threshold',
        type: 'integer',
        min: 1,
        max: 500,
        step: 1,
        helpText: 'Consecutive downstream failures before tripping OPEN.',
      },
      {
        key: 'openDurationMs',
        label: 'Open Duration',
        type: 'integer',
        unit: 'ms',
        min: 100,
        max: 120000,
        step: 250,
        helpText: 'Cooldown window before allowing HALF-OPEN probe requests.',
      },
      {
        key: 'halfOpenMaxProbes',
        label: 'Half-Open Probes',
        type: 'integer',
        min: 1,
        max: 50,
        step: 1,
        helpText: 'Successful consecutive probes required to close the circuit again.',
      },
      {
        key: 'processingLatencyMs',
        label: 'Check Latency',
        type: 'number',
        unit: 'ms',
        min: 0,
        max: 1000,
        step: 0.5,
        helpText: 'State check overhead.',
      },
    ],
    education: {
      whatItIs:
        'Resilience pattern implementing a CLOSED / OPEN / HALF-OPEN state machine around unreliable downstream calls.',
      whyItExists:
        'Prevents cascading resource exhaustion by failing fast instead of piling up timeouts against a downed dependency.',
      howModeled:
        'Tracks actual downstream request outcomes. Trips OPEN after consecutive failures, rejects immediately while OPEN, tests recovery with limited probes in HALF-OPEN, and closes once probes succeed.',
      keyParameters: ['failureThreshold', 'openDurationMs', 'halfOpenMaxProbes'],
      failureModes: [
        'Threshold set too low trips prematurely on minor jitter.',
        'Open duration too long delays traffic restoration after dependency recovers.',
      ],
      tradeoffs: [
        'Failing fast preserves upstream threads and latencies while explicitly sacrificing partial availability during outages.',
      ],
      simplifications: [
        'Uses consecutive failure counting rather than sliding time-window error-percentage thresholds.',
      ],
      furtherReading: ['Release It! — Michael Nygard'],
    },
  },

  read_replica: {
    type: 'read_replica',
    displayName: 'Read Replica',
    shortLabel: 'Read Replica',
    category: 'storage',
    accentVar: 'var(--sl-accent-storage)',
    defaultLabel: 'Read Replica',
    allowIncoming: true,
    allowOutgoing: false,
    defaultConfig: () => ({
      type: 'read_replica',
      maxConnections: 8,
      queueCapacity: 40,
      readLatencyMs: 18,
      distribution: 'fixed',
      cv: 0.4,
      failureProbability: 0,
    }),
    fields: [
      {
        key: 'maxConnections',
        label: 'Max Connections',
        type: 'integer',
        min: 1,
        max: 512,
        step: 1,
        helpText: 'Concurrent read queries supported by this replica.',
      },
      {
        key: 'queueCapacity',
        label: 'Queue Capacity',
        type: 'integer',
        min: 0,
        max: 10000,
        step: 5,
        helpText: 'Pending read query queue depth.',
      },
      {
        key: 'readLatencyMs',
        label: 'Read Latency',
        type: 'number',
        unit: 'ms',
        min: 0.5,
        max: 60000,
        step: 2,
        helpText: 'Mean read query execution time.',
      },
      {
        key: 'distribution',
        label: 'Latency Distribution',
        type: 'select',
        options: [
          { label: 'Fixed', value: 'fixed' },
          { label: 'Exponential', value: 'exponential' },
          { label: 'Lognormal', value: 'lognormal' },
        ],
        helpText: 'Service time distribution.',
      },
      {
        key: 'failureProbability',
        label: 'Failure Probability',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        helpText: 'Probability of query failure.',
      },
    ],
    education: {
      whatItIs: 'Read-only database follower dedicated to scaling read-heavy workloads.',
      whyItExists:
        'Offloads read traffic from the primary database so writes and critical transactions stay responsive.',
      howModeled:
        'Executes read requests with its own connection pool and queue; explicitly rejects misrouted write requests (WRITE_TO_READ_REPLICA).',
      keyParameters: ['maxConnections', 'readLatencyMs', 'queueCapacity'],
      failureModes: [
        'Routing writes accidentally to a read replica causes immediate application errors.',
      ],
      tradeoffs: [
        'Scales reads horizontally while introducing asynchronous replication lag in real-world systems.',
      ],
      simplifications: [
        'Does not model replication lag staleness windows or primary-to-replica WAL shipping overhead.',
      ],
      furtherReading: ['PostgreSQL Streaming Replication Architecture'],
    },
  },
};

export const COMPONENT_TYPE_LIST: ComponentType[] = Object.keys(
  COMPONENT_DEFINITIONS,
) as ComponentType[];

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  clients: 'Clients',
  networking: 'Networking',
  compute: 'Compute',
  caching: 'Caching',
  storage: 'Storage',
  messaging: 'Messaging',
};
