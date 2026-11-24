export interface GlossaryEntry {
  id: string;
  term: string;
  category: 'Performance' | 'Scaling' | 'Resilience' | 'Queueing';
  summary: string;
  formula?: string;
  intuition: string;
  relatedScenarioId?: string;
}

export const SYSTEM_DESIGN_GLOSSARY: GlossaryEntry[] = [
  {
    id: 'throughput',
    term: 'Throughput (RPS)',
    category: 'Performance',
    summary:
      'Rate at which a system successfully completes requests per unit of virtual time (requests per second).',
    formula: 'Throughput = Succeeded Requests / Simulated Horizon (s)',
    intuition:
      'Adding concurrency increases throughput only up to the bottleneck resource’s service capacity (c / E[S]).',
    relatedScenarioId: 'scenario-01-hello-system-design',
  },
  {
    id: 'latency',
    term: 'End-to-End Latency',
    category: 'Performance',
    summary:
      'Total elapsed virtual time from request creation at the client until terminal success completion.',
    formula: 'Latency = Sum(Network Delay + Queue Wait + Service Time)',
    intuition:
      'Under high load, queue waiting time often dwarfs actual processing time.',
    relatedScenarioId: 'scenario-01-hello-system-design',
  },
  {
    id: 'tail-latency',
    term: 'Tail Latency (P95 / P99)',
    category: 'Performance',
    summary:
      'High-percentile latencies (95th and 99th percentiles) showing what the slowest 5% or 1% of successful requests experience.',
    formula: 'R-7 Interpolation on sorted reservoir samples at h = p * (n - 1)',
    intuition:
      'Mean latency hides queueing spikes; P95/P99 reveals saturation and jitter long before averages look alarming.',
    relatedScenarioId: 'scenario-04-database-bottleneck',
  },
  {
    id: 'utilization',
    term: 'Utilization',
    category: 'Queueing',
    summary:
      'Fraction of available worker capacity spent actively executing requests rather than sitting idle.',
    formula: 'rho = Busy Worker Time / (Effective Capacity * Elapsed Time)',
    intuition:
      'In stochastic queues (Poisson/Exponential), pushing utilization above ~80–85% causes steep non-linear latency growth.',
    relatedScenarioId: 'scenario-04-database-bottleneck',
  },
  {
    id: 'littles-law',
    term: "Little's Law",
    category: 'Queueing',
    summary:
      'Fundamental queueing theorem relating average in-flight items (L), arrival rate (lambda), and average residence time (W).',
    formula: 'L = lambda * W',
    intuition:
      'Even without knowing the exact latency distribution, higher arrival rate or slower processing raises concurrent in-flight pressure.',
    relatedScenarioId: 'scenario-01-hello-system-design',
  },
  {
    id: 'bottleneck',
    term: 'System Bottleneck',
    category: 'Scaling',
    summary:
      'The single resource or stage with the lowest maximum sustainable throughput in a request pipeline.',
    intuition:
      'Scaling stateless Application Servers cannot raise end-to-end throughput if a downstream Database pool is saturated.',
    relatedScenarioId: 'scenario-04-database-bottleneck',
  },
  {
    id: 'backpressure',
    term: 'Backpressure',
    category: 'Resilience',
    summary:
      'Bounded queue or rate-limit rejection signaling that prevents unbounded memory growth and runaway latency when downstream capacity saturates.',
    intuition:
      'Fast rejection (429 / QUEUE_OVERFLOW) lets healthy traffic finish on time instead of letting all requests time out together.',
    relatedScenarioId: 'scenario-07-traffic-spike',
  },
  {
    id: 'availability',
    term: 'Availability',
    category: 'Resilience',
    summary:
      'Proportion of requests handled successfully rather than failing or timing out during normal operation or partial outages.',
    formula: 'Availability = Succeeded / (Succeeded + Failed + Timed Out)',
    intuition:
      'Redundancy plus health-aware routing preserves availability when single nodes fail.',
    relatedScenarioId: 'scenario-08-failure-and-recovery',
  },
  {
    id: 'saturation',
    term: 'Saturation',
    category: 'Queueing',
    summary:
      'Operating regime where incoming request rate equals or exceeds service capacity, causing queues to stay persistently full.',
    intuition:
      'Once saturated, added load increases waiting time and drops without adding throughput.',
    relatedScenarioId: 'scenario-04-database-bottleneck',
  },
  {
    id: 'load-balancing',
    term: 'Load Balancing',
    category: 'Scaling',
    summary:
      'Distributing incoming requests across multiple backend instances using policies like Round-Robin, Random, or Least-In-Flight.',
    intuition:
      'Least-In-Flight adapts automatically when one instance suffers degraded latency, whereas Round-Robin keeps sending equal share.',
    relatedScenarioId: 'scenario-02-horizontal-scaling',
  },
  {
    id: 'cache-hit-ratio',
    term: 'Cache Hit Ratio',
    category: 'Performance',
    summary:
      'Fraction of read requests served directly from fast in-memory cache without querying the origin database.',
    formula: 'Hit Ratio = Cache Hits / (Cache Hits + Cache Misses)',
    intuition:
      'Moving from 80% to 90% hit ratio halves the read load reaching the database (20% miss -> 10% miss)!',
    relatedScenarioId: 'scenario-03-caching-fundamentals',
  },
  {
    id: 'horizontal-scaling',
    term: 'Horizontal Scaling',
    category: 'Scaling',
    summary:
      'Adding more independent stateless server instances behind a Load Balancer rather than sizing up a single machine.',
    intuition:
      'Also provides fault isolation: losing one of three servers leaves 67% capacity instead of 0%.',
    relatedScenarioId: 'scenario-02-horizontal-scaling',
  },
  {
    id: 'fault-tolerance',
    term: 'Fault Tolerance',
    category: 'Resilience',
    summary:
      'Ability of an architecture to continue fulfilling requests cleanly despite crashes, latency spikes, or partial link failures.',
    intuition:
      'Tested deliberately in Chaos Lab before outages occur unexpectedly.',
    relatedScenarioId: 'scenario-08-failure-and-recovery',
  },
  {
    id: 'rate-limiting',
    term: 'Rate Limiting (Token Bucket)',
    category: 'Resilience',
    summary:
      'Admission control algorithm that allows short bursts up to bucket capacity while capping long-term average rate.',
    intuition:
      'Protects downstream compute and databases during flash crowds or retry storms.',
    relatedScenarioId: 'scenario-05-rate-limiting',
  },
  {
    id: 'circuit-breaker',
    term: 'Circuit Breaker',
    category: 'Resilience',
    summary:
      'State machine (CLOSED / OPEN / HALF-OPEN) that stops calling a failing downstream dependency immediately rather than waiting for timeouts.',
    intuition:
      'Gives struggling dependencies breathing room to recover and protects upstream threads.',
    relatedScenarioId: 'scenario-09-circuit-breaker',
  },
  {
    id: 'async-queueing',
    term: 'Asynchronous Queue Decoupling',
    category: 'Scaling',
    summary:
      'Separating user-facing request acknowledgement from heavy downstream work via a durable Message Queue and Background Workers.',
    intuition:
      'Absorbs traffic spikes smoothly as long as average worker throughput exceeds long-term arrival rate.',
    relatedScenarioId: 'scenario-06-async-processing',
  },
];
