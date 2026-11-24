import { DEFAULT_SAFETY_LIMITS } from '@/engine/models/types';
import { SCHEMA_VERSION, type SystemLabProject } from '@/schemas/projectSchema';

export type ScenarioDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface BuiltInScenario {
  id: string;
  number: string;
  title: string;
  difficulty: ScenarioDifficulty;
  category: string;
  educationalObjective: string;
  suggestedExperiment: string;
  explanation: string;
  modelAssumptions: string[];
  expectedBehavior: string;
  createProject: () => SystemLabProject;
}

function nowIso(): string {
  return '2026-01-01T00:00:00.000Z';
}

export const BUILT_IN_SCENARIOS: BuiltInScenario[] = [
  {
    id: 'scenario-01-hello-system-design',
    number: '01',
    title: 'Hello, System Design',
    difficulty: 'Beginner',
    category: 'Foundations',
    educationalObjective:
      'Observe request arrival rate, fixed service time, utilization, and request lifecycle end-to-end.',
    suggestedExperiment:
      'Run the baseline at 15 RPS (utilization ~30%), then raise Client rate to 50 RPS and watch utilization hit 100% as queue wait dominates latency.',
    explanation:
      'A single Client sends traffic over a 5 ms network link to an Application Server with concurrency 2 and 40 ms service time. Sustainable throughput ceiling is 2 / 0.04s = 50 RPS.',
    modelAssumptions: [
      'Fixed 40 ms service latency isolates queueing effects from stochastic variance.',
      'Open-loop arrival model keeps emitting requests regardless of downstream queue depth.',
    ],
    expectedBehavior:
      'At 15 RPS, utilization hovers near 30% with 0 ms queue wait and 45 ms end-to-end latency. Above 50 RPS, queues fill and latencies climb toward timeout.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-01',
      name: '01 — Hello, System Design',
      description: 'Single Client -> Application Server baseline.',
      scenarioId: 'scenario-01-hello-system-design',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 42,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [],
      nodes: [
        {
          id: 'client-1',
          label: 'Web Clients',
          position: { x: 80, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 15,
            workloadPattern: 'constant',
            burstMultiplier: 2,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0.8,
            timeoutMs: 2000,
          },
        },
        {
          id: 'app-1',
          label: 'App Server',
          position: { x: 420, y: 180 },
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 40,
            serviceTimeMs: 40,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [
        {
          id: 'e-c-app',
          source: 'client-1',
          target: 'app-1',
          latencyMs: 5,
          routeType: 'default',
          label: '5 ms',
        },
      ],
    }),
  },

  {
    id: 'scenario-02-horizontal-scaling',
    number: '02',
    title: 'Horizontal Scaling',
    difficulty: 'Beginner',
    category: 'Scaling & Routing',
    educationalObjective:
      'Compare capacity and load distribution across 3 stateless Application Servers behind a Load Balancer.',
    suggestedExperiment:
      'Save a baseline run, then switch Load Balancer from Round-Robin to Least-In-Flight while injecting a 120 ms Latency Spike on App Server 2 in Chaos Lab.',
    explanation:
      'A Load Balancer distributes 90 RPS evenly across three App Servers (each able to sustain ~50 RPS), keeping utilization near ~60% per server with fast responses.',
    modelAssumptions: [
      'App Servers are stateless and share zero contended downstream database locks here.',
      'Health checks instantly detect node_failure faults without probe lag.',
    ],
    expectedBehavior:
      'Load distributes 1/3 to each server under Round-Robin. When one server slows down, Least-In-Flight shifts traffic toward faster healthy nodes.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-02',
      name: '02 — Horizontal Scaling',
      description: 'Client -> Load Balancer -> 3 Application Servers.',
      scenarioId: 'scenario-02-horizontal-scaling',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 101,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [],
      nodes: [
        {
          id: 'client-1',
          label: 'API Traffic',
          position: { x: 60, y: 190 },
          config: {
            type: 'client',
            ratePerSecond: 90,
            workloadPattern: 'poisson',
            burstMultiplier: 2,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0.85,
            timeoutMs: 2000,
          },
        },
        {
          id: 'lb-1',
          label: 'Load Balancer',
          position: { x: 330, y: 190 },
          config: {
            type: 'load_balancer',
            strategy: 'round_robin',
            processingLatencyMs: 2,
            healthCheckEnabled: true,
          },
        },
        {
          id: 'app-1',
          label: 'App Server 1',
          position: { x: 640, y: 50 },
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 40,
            serviceTimeMs: 40,
            distribution: 'exponential',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'app-2',
          label: 'App Server 2',
          position: { x: 640, y: 190 },
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 40,
            serviceTimeMs: 40,
            distribution: 'exponential',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'app-3',
          label: 'App Server 3',
          position: { x: 640, y: 330 },
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 40,
            serviceTimeMs: 40,
            distribution: 'exponential',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [
        { id: 'e-c-lb', source: 'client-1', target: 'lb-1', latencyMs: 3, routeType: 'default', label: '3 ms' },
        { id: 'e-lb-1', source: 'lb-1', target: 'app-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-lb-2', source: 'lb-1', target: 'app-2', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-lb-3', source: 'lb-1', target: 'app-3', latencyMs: 2, routeType: 'default', label: '2 ms' },
      ],
    }),
  },

  {
    id: 'scenario-03-caching-fundamentals',
    number: '03',
    title: 'Caching Fundamentals',
    difficulty: 'Beginner',
    category: 'Caching',
    educationalObjective:
      'Measure how cache hit ratio lowers database utilization and end-to-end tail latency.',
    suggestedExperiment:
      'Run with 85% Cache hit probability and save Baseline. Lower hit probability to 0% (or inject a Cache Cold Start fault), run Candidate, and compare DB utilization and P95 latency.',
    explanation:
      'At 90 RPS (90% reads), an uncached 35 ms Database with 3 connections (max ~85 RPS) saturates quickly. An 85% probabilistic Cache absorbs most reads in 2 ms.',
    modelAssumptions: [
      'Cache uses a probabilistic Bernoulli hit rate rather than key-level LRU eviction.',
      'Write requests (10%) bypass directly to the primary Database.',
    ],
    expectedBehavior:
      'High cache hit probability keeps DB utilization comfortable and P95 latency low. Dropping cache hit probability toward 0% immediately saturates the DB.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-03',
      name: '03 — Caching Fundamentals',
      description: 'Client -> App Server -> Probabilistic Cache -> Database.',
      scenarioId: 'scenario-03-caching-fundamentals',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 202,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [],
      nodes: [
        {
          id: 'client-1',
          label: 'Read-Heavy Clients',
          position: { x: 50, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 90,
            workloadPattern: 'poisson',
            burstMultiplier: 2,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0.9,
            timeoutMs: 2000,
          },
        },
        {
          id: 'app-1',
          label: 'API Service',
          position: { x: 310, y: 180 },
          config: {
            type: 'app_server',
            concurrency: 8,
            queueCapacity: 80,
            serviceTimeMs: 12,
            distribution: 'lognormal',
            cv: 0.4,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'cache-1',
          label: 'Cache (Probabilistic)',
          position: { x: 580, y: 180 },
          config: {
            type: 'cache',
            lookupLatencyMs: 2,
            hitProbability: 0.85,
            writePolicy: 'bypass',
            coldStartWarmupMs: 5000,
          },
        },
        {
          id: 'db-1',
          label: 'Primary Database',
          position: { x: 860, y: 180 },
          config: {
            type: 'database',
            maxConnections: 3,
            queueCapacity: 30,
            readLatencyMs: 35,
            writeLatencyMs: 65,
            distribution: 'lognormal',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'client-1', target: 'app-1', latencyMs: 3, routeType: 'default', label: '3 ms' },
        { id: 'e-2', source: 'app-1', target: 'cache-1', latencyMs: 1, routeType: 'default', label: '1 ms' },
        { id: 'e-3', source: 'cache-1', target: 'db-1', latencyMs: 3, routeType: 'default', label: '3 ms' },
      ],
    }),
  },

  {
    id: 'scenario-04-database-bottleneck',
    number: '04',
    title: 'Database Bottleneck',
    difficulty: 'Intermediate',
    category: 'Storage & Queueing',
    educationalObjective:
      'Observe how a fast stateless tier still suffers queue collapse and tail-latency explosion when a shared database pool saturates.',
    suggestedExperiment:
      'Increase App Server concurrency from 8 to 32 — observe that throughput does NOT improve while Database maxConnections remains 2!',
    explanation:
      'Two Application Servers have plenty of CPU capacity, but both write to a single Primary Database with maxConnections=2 and 45 ms write latency (~44 writes/s ceiling) under 55 RPS.',
    modelAssumptions: [
      'Requests arrive at 55 RPS (70% writes), exceeding steady-state DB pool capacity.',
      'Queue overflow and client timeouts manifest downstream saturation.',
    ],
    expectedBehavior:
      'App servers stay lightly utilized while the Primary Database climbs to ~100% utilization, maxes out its wait queue, and triggers QUEUE_OVERFLOW / timeout spikes.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-04',
      name: '04 — Database Bottleneck',
      description: 'Stateless compute scaling blocked by narrow Database connection pool.',
      scenarioId: 'scenario-04-database-bottleneck',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 303,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [],
      nodes: [
        {
          id: 'client-1',
          label: 'Write-Heavy Load',
          position: { x: 50, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 55,
            workloadPattern: 'poisson',
            burstMultiplier: 2,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0.3,
            timeoutMs: 1200,
          },
        },
        {
          id: 'lb-1',
          label: 'Load Balancer',
          position: { x: 290, y: 180 },
          config: {
            type: 'load_balancer',
            strategy: 'round_robin',
            processingLatencyMs: 1,
            healthCheckEnabled: true,
          },
        },
        {
          id: 'app-1',
          label: 'App Server A',
          position: { x: 540, y: 90 },
          config: {
            type: 'app_server',
            concurrency: 8,
            queueCapacity: 40,
            serviceTimeMs: 15,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'app-2',
          label: 'App Server B',
          position: { x: 540, y: 270 },
          config: {
            type: 'app_server',
            concurrency: 8,
            queueCapacity: 40,
            serviceTimeMs: 15,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'db-1',
          label: 'Constrained DB',
          position: { x: 840, y: 180 },
          config: {
            type: 'database',
            maxConnections: 2,
            queueCapacity: 25,
            readLatencyMs: 20,
            writeLatencyMs: 45,
            distribution: 'exponential',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'client-1', target: 'lb-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-2', source: 'lb-1', target: 'app-1', latencyMs: 1, routeType: 'default', label: '1 ms' },
        { id: 'e-3', source: 'lb-1', target: 'app-2', latencyMs: 1, routeType: 'default', label: '1 ms' },
        { id: 'e-4', source: 'app-1', target: 'db-1', latencyMs: 3, routeType: 'default', label: '3 ms' },
        { id: 'e-5', source: 'app-2', target: 'db-1', latencyMs: 3, routeType: 'default', label: '3 ms' },
      ],
    }),
  },

  {
    id: 'scenario-05-rate-limiting',
    number: '05',
    title: 'Rate Limiting',
    difficulty: 'Intermediate',
    category: 'Load Shedding',
    educationalObjective:
      'Understand the trade-off between rejecting excess requests at the API Gateway versus keeping latency low for admitted traffic.',
    suggestedExperiment:
      'Compare Token Bucket Enabled (Baseline) vs Disabled (Candidate): observe how disabling rate limiting floods the App Server and blows up P95 latency for ALL users.',
    explanation:
      'Bursty clients surge to 120 RPS periodically. The API Gateway enforces a 50 RPS Token Bucket (burst 15), shedding overload early so the downstream server stays responsive.',
    modelAssumptions: [
      'Token Bucket refills continuously against virtual time.',
      'Rejected requests count toward global failed/error metrics cleanly.',
    ],
    expectedBehavior:
      'During burst windows, API Gateway emits RATE_LIMITED rejections while admitted traffic completes with low, stable latency.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-05',
      name: '05 — Rate Limiting',
      description: 'Bursty Client -> Token-Bucket API Gateway -> App Server.',
      scenarioId: 'scenario-05-rate-limiting',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 404,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [],
      nodes: [
        {
          id: 'client-1',
          label: 'Bursty API Clients',
          position: { x: 60, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 40,
            workloadPattern: 'bursty',
            burstMultiplier: 3,
            burstDurationMs: 2500,
            burstPeriodMs: 6000,
            readRatio: 0.75,
            timeoutMs: 1500,
          },
        },
        {
          id: 'gw-1',
          label: 'API Gateway',
          position: { x: 380, y: 180 },
          config: {
            type: 'api_gateway',
            processingLatencyMs: 2,
            rateLimitEnabled: true,
            rateLimitRps: 50,
            burstCapacity: 15,
            routingMode: 'default',
          },
        },
        {
          id: 'app-1',
          label: 'Protected Service',
          position: { x: 700, y: 180 },
          config: {
            type: 'app_server',
            concurrency: 3,
            queueCapacity: 25,
            serviceTimeMs: 45,
            distribution: 'fixed',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'client-1', target: 'gw-1', latencyMs: 3, routeType: 'default', label: '3 ms' },
        { id: 'e-2', source: 'gw-1', target: 'app-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
      ],
    }),
  },

  {
    id: 'scenario-06-async-processing',
    number: '06',
    title: 'Asynchronous Processing',
    difficulty: 'Intermediate',
    category: 'Messaging & Decoupling',
    educationalObjective:
      'Contrast fast HTTP enqueue acknowledgement latency against slower background job completion latency.',
    suggestedExperiment:
      'Switch Message Queue delivery mode from async_ack (Baseline) to sync_wait (Candidate) and compare user-facing P95 latency and timeouts.',
    explanation:
      'Clients trigger heavy 160 ms tasks at 30 RPS. With async_ack, the API acknowledges immediately after enqueuing (~25 ms), while Workers drain the queue asynchronously into the DB.',
    modelAssumptions: [
      'Client HTTP success reflects durable queue admission in async_ack mode.',
      'Background job completion is tracked separately on Message Queue & Worker metrics.',
    ],
    expectedBehavior:
      'HTTP P95 stays around ~30 ms while Background Worker processes jobs at ~160 ms+ with visible queue depth dynamics.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-06',
      name: '06 — Asynchronous Processing',
      description: 'Client -> App Server -> Message Queue -> Background Worker -> Database.',
      scenarioId: 'scenario-06-async-processing',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 505,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 15_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [],
      nodes: [
        {
          id: 'client-1',
          label: 'Webhook Producers',
          position: { x: 40, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 30,
            workloadPattern: 'poisson',
            burstMultiplier: 2,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0,
            timeoutMs: 800,
          },
        },
        {
          id: 'app-1',
          label: 'Ingest API',
          position: { x: 280, y: 180 },
          config: {
            type: 'app_server',
            concurrency: 6,
            queueCapacity: 50,
            serviceTimeMs: 15,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'mq-1',
          label: 'Job Queue',
          position: { x: 530, y: 180 },
          config: {
            type: 'message_queue',
            queueCapacity: 300,
            enqueueLatencyMs: 3,
            deliveryMode: 'async_ack',
          },
        },
        {
          id: 'worker-1',
          label: 'Background Workers',
          position: { x: 780, y: 180 },
          config: {
            type: 'worker',
            concurrency: 5,
            processingTimeMs: 140,
            distribution: 'exponential',
            cv: 0.4,
            failureProbability: 0,
          },
        },
        {
          id: 'db-1',
          label: 'Audit Store',
          position: { x: 1040, y: 180 },
          config: {
            type: 'database',
            maxConnections: 6,
            queueCapacity: 40,
            readLatencyMs: 10,
            writeLatencyMs: 20,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'client-1', target: 'app-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-2', source: 'app-1', target: 'mq-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-3', source: 'mq-1', target: 'worker-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-4', source: 'worker-1', target: 'db-1', latencyMs: 3, routeType: 'default', label: '3 ms' },
      ],
    }),
  },

  {
    id: 'scenario-07-traffic-spike',
    number: '07',
    title: 'Traffic Spike & Backpressure',
    difficulty: 'Intermediate',
    category: 'Capacity Planning',
    educationalObjective:
      'Observe sudden step-load spikes crossing cluster capacity, triggering queue saturation and recovery.',
    suggestedExperiment:
      'Increase App Server queueCapacity from 12 to 200 and notice how larger queues trade QUEUE_OVERFLOW errors for higher tail latency and timeouts.',
    explanation:
      'Traffic steps from 40 RPS to 140 RPS halfway through the run, exceeding total cluster service capacity (~100 RPS across 2 servers).',
    modelAssumptions: [
      'Step workload jumps 3.5x at duration midpoint (t = 10s).',
      'Bounded FIFO queues enforce backpressure drops once full.',
    ],
    expectedBehavior:
      'Smooth operation during [0s, 10s]; sharp jump in queue depth, utilization (100%), and latency/overflows during [10s, 20s].',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-07',
      name: '07 — Traffic Spike',
      description: 'Step-load flash crowd hitting a two-node App Server cluster.',
      scenarioId: 'scenario-07-traffic-spike',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 606,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [],
      nodes: [
        {
          id: 'client-1',
          label: 'Flash Crowd Client',
          position: { x: 60, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 40,
            workloadPattern: 'step',
            burstMultiplier: 3.5,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0.8,
            timeoutMs: 1000,
          },
        },
        {
          id: 'lb-1',
          label: 'Load Balancer',
          position: { x: 330, y: 180 },
          config: {
            type: 'load_balancer',
            strategy: 'least_in_flight',
            processingLatencyMs: 2,
            healthCheckEnabled: true,
          },
        },
        {
          id: 'app-1',
          label: 'App Node 1',
          position: { x: 630, y: 90 },
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 12,
            serviceTimeMs: 40,
            distribution: 'lognormal',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'app-2',
          label: 'App Node 2',
          position: { x: 630, y: 270 },
          config: {
            type: 'app_server',
            concurrency: 2,
            queueCapacity: 12,
            serviceTimeMs: 40,
            distribution: 'lognormal',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'client-1', target: 'lb-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-2', source: 'lb-1', target: 'app-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-3', source: 'lb-1', target: 'app-2', latencyMs: 2, routeType: 'default', label: '2 ms' },
      ],
    }),
  },

  {
    id: 'scenario-08-failure-and-recovery',
    number: '08',
    title: 'Server Failure & Recovery',
    difficulty: 'Intermediate',
    category: 'Fault Tolerance',
    educationalObjective:
      'Observe health-aware failover when one server crashes mid-run, remaining capacity saturates, and recovery restores balance.',
    suggestedExperiment:
      'Disable healthCheckEnabled on the Load Balancer and re-run: observe how routing blindly into a dead node causes ~50% error rates throughout the outage.',
    explanation:
      'A pre-scheduled Chaos fault crashes App Server 2 from t = 5s to t = 12s. The Load Balancer routes all 60 RPS onto App Server 1 during the outage, then rebalances upon recovery.',
    modelAssumptions: [
      'In-flight and queued requests on the crashed node fail immediately with NODE_FAILED.',
      'Health-aware Load Balancer ceases routing new traffic to failed nodes instantly.',
    ],
    expectedBehavior:
      'At t=5s, in-flight requests on App Server 2 fail; App Server 1 absorbs 100% traffic (rising utilization & latency); at t=12s, App Server 2 recovers cleanly.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-08',
      name: '08 — Server Failure & Recovery',
      description: 'Health-aware Load Balancer surviving a scheduled App Server crash.',
      scenarioId: 'scenario-08-failure-and-recovery',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 707,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [
        {
          id: 'fault-s8-crash',
          type: 'node_failure',
          targetId: 'app-2',
          startAtMs: 5000,
          durationMs: 7000,
          value: 1,
          label: 'App Server 2 Crash',
        },
      ],
      nodes: [
        {
          id: 'client-1',
          label: 'Traffic Gen',
          position: { x: 60, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 60,
            workloadPattern: 'constant',
            burstMultiplier: 2,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0.8,
            timeoutMs: 1500,
          },
        },
        {
          id: 'lb-1',
          label: 'Health-Aware LB',
          position: { x: 340, y: 180 },
          config: {
            type: 'load_balancer',
            strategy: 'round_robin',
            processingLatencyMs: 2,
            healthCheckEnabled: true,
          },
        },
        {
          id: 'app-1',
          label: 'App Server 1',
          position: { x: 640, y: 90 },
          config: {
            type: 'app_server',
            concurrency: 3,
            queueCapacity: 40,
            serviceTimeMs: 35,
            distribution: 'exponential',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'app-2',
          label: 'App Server 2',
          position: { x: 640, y: 270 },
          config: {
            type: 'app_server',
            concurrency: 3,
            queueCapacity: 40,
            serviceTimeMs: 35,
            distribution: 'exponential',
            cv: 0.5,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'client-1', target: 'lb-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-2', source: 'lb-1', target: 'app-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-3', source: 'lb-1', target: 'app-2', latencyMs: 2, routeType: 'default', label: '2 ms' },
      ],
    }),
  },

  {
    id: 'scenario-09-circuit-breaker',
    number: '09',
    title: 'Circuit Breaker Protection',
    difficulty: 'Advanced',
    category: 'Resilience Patterns',
    educationalObjective:
      'Watch a Circuit Breaker trip OPEN during a downstream outage, fail fast, probe HALF-OPEN, and CLOSE after recovery.',
    suggestedExperiment:
      'Increase openDurationMs from 2500 ms to 8000 ms and observe the trade-off between probing too infrequently vs. protecting a fragile database.',
    explanation:
      'A scheduled latency/failure outage degrades the Database at t = 4s. After 5 consecutive failures, the Circuit Breaker opens to fail fast instead of waiting for 1500 ms timeouts.',
    modelAssumptions: [
      'Circuit Breaker tracks consecutive downstream outcomes along request paths.',
      'Open state immediately rejects requests with CIRCUIT_OPEN error category.',
    ],
    expectedBehavior:
      'Event Log records CIRCUIT_OPENED shortly after t=4s, then CIRCUIT_HALF_OPEN and CIRCUIT_CLOSED once the Database recovers at t=10s.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-09',
      name: '09 — Circuit Breaker',
      description: 'Client -> App -> Circuit Breaker -> Database under temporary outage.',
      scenarioId: 'scenario-09-circuit-breaker',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 808,
        durationMs: 18_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [
        {
          id: 'fault-s9-db-down',
          type: 'node_failure',
          targetId: 'db-1',
          startAtMs: 4000,
          durationMs: 6000,
          value: 1,
          label: 'Downstream DB Outage',
        },
      ],
      nodes: [
        {
          id: 'client-1',
          label: 'Clients',
          position: { x: 50, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 25,
            workloadPattern: 'constant',
            burstMultiplier: 2,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0.8,
            timeoutMs: 1500,
          },
        },
        {
          id: 'app-1',
          label: 'Checkout Service',
          position: { x: 310, y: 180 },
          config: {
            type: 'app_server',
            concurrency: 6,
            queueCapacity: 30,
            serviceTimeMs: 15,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
            maxRetries: 0,
            retryDelayMs: 50,
          },
        },
        {
          id: 'cb-1',
          label: 'Circuit Breaker',
          position: { x: 580, y: 180 },
          config: {
            type: 'circuit_breaker',
            failureThreshold: 5,
            openDurationMs: 2500,
            halfOpenMaxProbes: 2,
            processingLatencyMs: 1,
          },
        },
        {
          id: 'db-1',
          label: 'Payment DB',
          position: { x: 850, y: 180 },
          config: {
            type: 'database',
            maxConnections: 6,
            queueCapacity: 25,
            readLatencyMs: 20,
            writeLatencyMs: 40,
            distribution: 'fixed',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'client-1', target: 'app-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-2', source: 'app-1', target: 'cb-1', latencyMs: 1, routeType: 'default', label: '1 ms' },
        { id: 'e-3', source: 'cb-1', target: 'db-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
      ],
    }),
  },

  {
    id: 'scenario-10-read-replica-split',
    number: '10',
    title: 'Read / Write Split with Read Replicas',
    difficulty: 'Advanced',
    category: 'Database Scaling',
    educationalObjective:
      'Offload 85% read traffic from Primary DB to a dedicated Read Replica using API Gateway read/write routing.',
    suggestedExperiment:
      'Switch API Gateway Routing Mode back to Default Forward (sending all traffic to the edge listed first) or wire writes accidentally to the Read Replica to observe WRITE_TO_READ_REPLICA protection.',
    explanation:
      'An API Gateway configured for Read/Write Split sends read queries along the READ edge to a fast Read Replica while sending writes exclusively to the Primary Database.',
    modelAssumptions: [
      'Read Replicas immediately fail write operations to mirror read-only permissions.',
      'Asynchronous replication lag between Primary DB and Read Replica is not modeled.',
    ],
    expectedBehavior:
      'Read Replica handles ~85% of traffic while Primary Database stays lightly loaded handling ~15% writes with 0 misrouted errors.',
    createProject: () => ({
      schemaVersion: SCHEMA_VERSION,
      id: 'proj-scenario-10',
      name: '10 — Read / Write Split',
      description: 'API Gateway read/write routing split across Read Replica and Primary DB.',
      scenarioId: 'scenario-10-read-replica-split',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      simConfig: {
        seed: 909,
        durationMs: 20_000,
        drainOnEnd: true,
        maxDrainMs: 10_000,
        safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
      },
      scheduledFaults: [],
      nodes: [
        {
          id: 'client-1',
          label: 'Mixed Clients (85R/15W)',
          position: { x: 60, y: 180 },
          config: {
            type: 'client',
            ratePerSecond: 70,
            workloadPattern: 'poisson',
            burstMultiplier: 2,
            burstDurationMs: 2000,
            burstPeriodMs: 6000,
            readRatio: 0.85,
            timeoutMs: 1500,
          },
        },
        {
          id: 'gw-1',
          label: 'Routing Gateway',
          position: { x: 360, y: 180 },
          config: {
            type: 'api_gateway',
            processingLatencyMs: 2,
            rateLimitEnabled: false,
            rateLimitRps: 200,
            burstCapacity: 50,
            routingMode: 'read_write_split',
          },
        },
        {
          id: 'rr-1',
          label: 'Read Replica',
          position: { x: 690, y: 80 },
          config: {
            type: 'read_replica',
            maxConnections: 6,
            queueCapacity: 30,
            readLatencyMs: 16,
            distribution: 'lognormal',
            cv: 0.4,
            failureProbability: 0,
          },
        },
        {
          id: 'db-1',
          label: 'Primary DB (Writes)',
          position: { x: 690, y: 280 },
          config: {
            type: 'database',
            maxConnections: 4,
            queueCapacity: 25,
            readLatencyMs: 25,
            writeLatencyMs: 55,
            distribution: 'lognormal',
            cv: 0.4,
            failureProbability: 0,
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'client-1', target: 'gw-1', latencyMs: 2, routeType: 'default', label: '2 ms' },
        { id: 'e-read', source: 'gw-1', target: 'rr-1', latencyMs: 2, routeType: 'read', label: 'READ · 2 ms' },
        { id: 'e-write', source: 'gw-1', target: 'db-1', latencyMs: 2, routeType: 'write', label: 'WRITE · 2 ms' },
      ],
    }),
  },
];
