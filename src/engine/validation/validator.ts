import type {
  ArchitectureGraph,
  NodeConfig,
  SimulationConfig,
  ValidationIssue,
  ValidationResult,
} from '../models/types';

export const MAX_NODES = 100;
export const MAX_EDGES = 300;

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function isFiniteNonNegative(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function isProbability(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function validateNodeConfig(nodeId: string, label: string, config: NodeConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pushErr = (code: string, message: string): void => {
    issues.push({ id: `${nodeId}-${code}`, severity: 'error', code, message, nodeId });
  };

  switch (config.type) {
    case 'client':
      if (!isFinitePositive(config.ratePerSecond) || config.ratePerSecond > 50_000) {
        pushErr('INVALID_RATE', `${label}: request rate must be between 0.01 and 50,000 RPS.`);
      }
      if (!isFinitePositive(config.timeoutMs)) {
        pushErr('INVALID_TIMEOUT', `${label}: request timeout must be greater than 0 ms.`);
      }
      if (!isProbability(config.readRatio)) {
        pushErr('INVALID_READ_RATIO', `${label}: read ratio must be between 0 and 1.`);
      }
      if (!Number.isFinite(config.burstMultiplier) || config.burstMultiplier < 1) {
        pushErr('INVALID_BURST_MULT', `${label}: burst multiplier must be >= 1.`);
      }
      if (
        !isFinitePositive(config.burstDurationMs) ||
        config.burstPeriodMs <= config.burstDurationMs
      ) {
        pushErr('INVALID_BURST_WINDOW', `${label}: burst period must exceed burst duration.`);
      }
      break;
    case 'load_balancer':
      if (!isFiniteNonNegative(config.processingLatencyMs)) {
        pushErr('INVALID_LATENCY', `${label}: processing latency cannot be negative.`);
      }
      break;
    case 'api_gateway':
      if (!isFiniteNonNegative(config.processingLatencyMs)) {
        pushErr('INVALID_LATENCY', `${label}: processing latency cannot be negative.`);
      }
      if (config.rateLimitEnabled) {
        if (!isFinitePositive(config.rateLimitRps)) {
          pushErr('INVALID_RATE_LIMIT', `${label}: rate limit RPS must be > 0.`);
        }
        if (!Number.isFinite(config.burstCapacity) || config.burstCapacity < 1) {
          pushErr('INVALID_BURST_CAP', `${label}: burst capacity must be >= 1.`);
        }
      }
      break;
    case 'app_server':
      if (!Number.isInteger(config.concurrency) || config.concurrency < 1) {
        pushErr('INVALID_CONCURRENCY', `${label}: concurrency must be an integer >= 1.`);
      }
      if (!Number.isInteger(config.queueCapacity) || config.queueCapacity < 0) {
        pushErr('INVALID_QUEUE_CAP', `${label}: queue capacity must be an integer >= 0.`);
      }
      if (!isFinitePositive(config.serviceTimeMs)) {
        pushErr('INVALID_SERVICE_TIME', `${label}: service time must be > 0 ms.`);
      }
      if (!isProbability(config.failureProbability)) {
        pushErr('INVALID_FAIL_PROB', `${label}: failure probability must be between 0 and 1.`);
      }
      if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0 || config.maxRetries > 5) {
        pushErr('INVALID_RETRIES', `${label}: max retries must be an integer between 0 and 5.`);
      }
      if (!isFiniteNonNegative(config.retryDelayMs)) {
        pushErr('INVALID_RETRY_DELAY', `${label}: retry delay cannot be negative.`);
      }
      break;
    case 'cache':
      if (!isFiniteNonNegative(config.lookupLatencyMs)) {
        pushErr('INVALID_LATENCY', `${label}: lookup latency cannot be negative.`);
      }
      if (!isProbability(config.hitProbability)) {
        pushErr('INVALID_HIT_PROB', `${label}: hit probability must be between 0 and 1.`);
      }
      if (!isFiniteNonNegative(config.coldStartWarmupMs)) {
        pushErr('INVALID_WARMUP', `${label}: cold-start warmup duration cannot be negative.`);
      }
      break;
    case 'database':
      if (!Number.isInteger(config.maxConnections) || config.maxConnections < 1) {
        pushErr('INVALID_CONNECTIONS', `${label}: max connections must be an integer >= 1.`);
      }
      if (!Number.isInteger(config.queueCapacity) || config.queueCapacity < 0) {
        pushErr('INVALID_QUEUE_CAP', `${label}: queue capacity must be an integer >= 0.`);
      }
      if (!isFinitePositive(config.readLatencyMs) || !isFinitePositive(config.writeLatencyMs)) {
        pushErr('INVALID_DB_LATENCY', `${label}: read and write latencies must be > 0 ms.`);
      }
      if (!isProbability(config.failureProbability)) {
        pushErr('INVALID_FAIL_PROB', `${label}: failure probability must be between 0 and 1.`);
      }
      break;
    case 'message_queue':
      if (!Number.isInteger(config.queueCapacity) || config.queueCapacity < 1) {
        pushErr('INVALID_QUEUE_CAP', `${label}: queue capacity must be an integer >= 1.`);
      }
      if (!isFiniteNonNegative(config.enqueueLatencyMs)) {
        pushErr('INVALID_LATENCY', `${label}: enqueue latency cannot be negative.`);
      }
      break;
    case 'worker':
      if (!Number.isInteger(config.concurrency) || config.concurrency < 1) {
        pushErr('INVALID_CONCURRENCY', `${label}: worker concurrency must be an integer >= 1.`);
      }
      if (!isFinitePositive(config.processingTimeMs)) {
        pushErr('INVALID_PROCESSING_TIME', `${label}: processing time must be > 0 ms.`);
      }
      if (!isProbability(config.failureProbability)) {
        pushErr('INVALID_FAIL_PROB', `${label}: failure probability must be between 0 and 1.`);
      }
      break;
    case 'circuit_breaker':
      if (!Number.isInteger(config.failureThreshold) || config.failureThreshold < 1) {
        pushErr('INVALID_CB_THRESHOLD', `${label}: failure threshold must be >= 1.`);
      }
      if (!isFinitePositive(config.openDurationMs)) {
        pushErr('INVALID_CB_OPEN_MS', `${label}: open duration must be > 0 ms.`);
      }
      if (!Number.isInteger(config.halfOpenMaxProbes) || config.halfOpenMaxProbes < 1) {
        pushErr('INVALID_CB_PROBES', `${label}: half-open max probes must be >= 1.`);
      }
      if (!isFiniteNonNegative(config.processingLatencyMs)) {
        pushErr('INVALID_LATENCY', `${label}: processing latency cannot be negative.`);
      }
      break;
    case 'read_replica':
      if (!Number.isInteger(config.maxConnections) || config.maxConnections < 1) {
        pushErr('INVALID_CONNECTIONS', `${label}: max connections must be an integer >= 1.`);
      }
      if (!Number.isInteger(config.queueCapacity) || config.queueCapacity < 0) {
        pushErr('INVALID_QUEUE_CAP', `${label}: queue capacity must be an integer >= 0.`);
      }
      if (!isFinitePositive(config.readLatencyMs)) {
        pushErr('INVALID_READ_LATENCY', `${label}: read latency must be > 0 ms.`);
      }
      if (!isProbability(config.failureProbability)) {
        pushErr('INVALID_FAIL_PROB', `${label}: failure probability must be between 0 and 1.`);
      }
      break;
  }

  return issues;
}

export function validateGraph(
  graph: ArchitectureGraph,
  simConfig?: SimulationConfig,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (graph.nodes.length === 0) {
    issues.push({
      id: 'empty-graph',
      severity: 'error',
      code: 'EMPTY_GRAPH',
      message: 'Architecture canvas is empty. Add at least a Client and a downstream component.',
    });
    return { valid: false, issues };
  }

  if (graph.nodes.length > MAX_NODES) {
    issues.push({
      id: 'too-many-nodes',
      severity: 'error',
      code: 'MAX_NODES_EXCEEDED',
      message: `Graph exceeds the ${MAX_NODES}-node safety limit (${graph.nodes.length} nodes).`,
    });
  }
  if (graph.edges.length > MAX_EDGES) {
    issues.push({
      id: 'too-many-edges',
      severity: 'error',
      code: 'MAX_EDGES_EXCEEDED',
      message: `Graph exceeds the ${MAX_EDGES}-edge safety limit (${graph.edges.length} edges).`,
    });
  }

  if (simConfig) {
    if (
      !Number.isFinite(simConfig.durationMs) ||
      simConfig.durationMs <= 0 ||
      simConfig.durationMs > 3_600_000
    ) {
      issues.push({
        id: 'invalid-duration',
        severity: 'error',
        code: 'INVALID_SIM_DURATION',
        message: 'Simulation duration must be between 1 ms and 3,600,000 ms (1 hour).',
      });
    }
    if (!Number.isFinite(simConfig.seed)) {
      issues.push({
        id: 'invalid-seed',
        severity: 'error',
        code: 'INVALID_SEED',
        message: 'Simulation seed must be a finite integer.',
      });
    }
  }

  // Node ID uniqueness & per-node config checks
  const nodeMap = new Map<string, (typeof graph.nodes)[number]>();
  const clients: string[] = [];

  for (const node of graph.nodes) {
    if (nodeMap.has(node.id)) {
      issues.push({
        id: `dup-node-${node.id}`,
        severity: 'error',
        code: 'DUPLICATE_NODE_ID',
        message: `Duplicate node ID detected: "${node.id}".`,
        nodeId: node.id,
      });
    } else {
      nodeMap.set(node.id, node);
    }
    if (node.config.type === 'client') {
      clients.push(node.id);
    }
    issues.push(...validateNodeConfig(node.id, node.label, node.config));
  }

  if (clients.length === 0) {
    issues.push({
      id: 'missing-client',
      severity: 'error',
      code: 'MISSING_TRAFFIC_SOURCE',
      message: 'At least one Client / Traffic Generator node is required to produce requests.',
    });
  }

  // Edge validation & adjacency lists
  const edgeIds = new Set<string>();
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeMap.keys()) {
    outgoing.set(id, []);
    incoming.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({
        id: `dup-edge-${edge.id}`,
        severity: 'error',
        code: 'DUPLICATE_EDGE_ID',
        message: `Duplicate edge ID detected: "${edge.id}".`,
        edgeId: edge.id,
      });
    } else {
      edgeIds.add(edge.id);
    }

    if (!isFiniteNonNegative(edge.latencyMs)) {
      issues.push({
        id: `edge-neg-lat-${edge.id}`,
        severity: 'error',
        code: 'NEGATIVE_EDGE_LATENCY',
        message: `Connection "${edge.id}" has invalid negative latency (${edge.latencyMs} ms).`,
        edgeId: edge.id,
      });
    }

    const srcExists = nodeMap.has(edge.source);
    const dstExists = nodeMap.has(edge.target);
    if (!srcExists || !dstExists) {
      issues.push({
        id: `dangling-${edge.id}`,
        severity: 'error',
        code: 'DANGLING_EDGE',
        message: `Connection "${edge.id}" references a missing source or target node.`,
        edgeId: edge.id,
      });
      continue;
    }

    if (edge.source === edge.target) {
      issues.push({
        id: `self-loop-${edge.id}`,
        severity: 'error',
        code: 'SELF_LOOP',
        message: `Self-loop connection on "${nodeMap.get(edge.source)?.label ?? edge.source}" is not supported.`,
        edgeId: edge.id,
        nodeId: edge.source,
      });
      continue;
    }

    outgoing.get(edge.source)?.push(edge.target);
    incoming.get(edge.target)?.push(edge.source);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // DAG cycle check via Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  let visitedCount = 0;
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (!current) continue;
    visitedCount += 1;
    for (const next of outgoing.get(current) ?? []) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
      }
    }
  }

  if (visitedCount < nodeMap.size) {
    const cycleNodes = Array.from(inDegree.entries())
      .filter(([, deg]) => deg > 0)
      .map(([id]) => id);
    const firstCycleNode = cycleNodes[0];
    issues.push({
      id: 'graph-cycle',
      severity: 'error',
      code: 'DIRECTED_CYCLE',
      message: `Primary topology must be a DAG. Directed cycle detected involving ${cycleNodes
        .map((id) => nodeMap.get(id)?.label ?? id)
        .join(', ')}. Use Application Server retry config for bounded retries.`,
      nodeId: firstCycleNode,
    });
  }

  // Non-terminal components that require downstream connections
  for (const [id, node] of nodeMap.entries()) {
    const out = outgoing.get(id) ?? [];
    if (
      (node.config.type === 'client' ||
        node.config.type === 'load_balancer' ||
        node.config.type === 'api_gateway' ||
        node.config.type === 'circuit_breaker') &&
      out.length === 0
    ) {
      issues.push({
        id: `missing-downstream-${id}`,
        severity: 'error',
        code: 'MISSING_DOWNSTREAM',
        message: `${node.label} requires at least one outgoing connection to forward traffic.`,
        nodeId: id,
      });
    }
    if (node.config.type === 'client' && out.length > 1) {
      issues.push({
        id: `client-multi-edge-${id}`,
        severity: 'warning',
        code: 'MULTIPLE_OUTGOING_EDGES',
        message: `${node.label} has multiple outgoing connections: traffic forwards along the first live edge. Insert a Load Balancer to distribute traffic across targets.`,
        nodeId: id,
      });
    }
    if (node.config.type === 'cache' && node.config.hitProbability < 1 && out.length === 0) {
      issues.push({
        id: `cache-no-miss-target-${id}`,
        severity: 'error',
        code: 'CACHE_MISSING_ORIGIN',
        message: `${node.label} has hit probability < 100% and needs a downstream origin (e.g. Database) for cache misses.`,
        nodeId: id,
      });
    }
    if (
      node.config.type === 'cache' &&
      node.config.writePolicy === 'write_through' &&
      out.length === 0
    ) {
      issues.push({
        id: `cache-write-origin-${id}`,
        severity: 'error',
        code: 'CACHE_MISSING_ORIGIN',
        message: `${node.label} uses write-through policy and needs a downstream origin node.`,
        nodeId: id,
      });
    }
    if (node.config.type === 'worker' && (incoming.get(id)?.length ?? 0) === 0) {
      issues.push({
        id: `worker-unconnected-${id}`,
        severity: 'warning',
        code: 'DISCONNECTED_WORKER',
        message: `${node.label} has no upstream Message Queue or caller and will stay idle.`,
        nodeId: id,
      });
    }
    if (node.config.type === 'message_queue') {
      const workerTargets = out.filter(
        (targetId) => nodeMap.get(targetId)?.config.type === 'worker',
      );
      if (workerTargets.length === 0) {
        issues.push({
          id: `mq-no-worker-${id}`,
          severity: 'warning',
          code: 'MQ_WITHOUT_WORKER',
          message: `${node.label} has no downstream Background Worker; queued jobs will accumulate without draining.`,
          nodeId: id,
        });
      }
    }
  }

  // Reachability warnings from client nodes
  const reachable = new Set<string>();
  const bfs = [...clients];
  let bfsIdx = 0;
  while (bfsIdx < bfs.length) {
    const cur = bfs[bfsIdx++];
    if (!cur || reachable.has(cur)) continue;
    reachable.add(cur);
    for (const next of outgoing.get(cur) ?? []) {
      if (!reachable.has(next)) {
        bfs.push(next);
      }
    }
  }

  for (const [id, node] of nodeMap.entries()) {
    if (!reachable.has(id)) {
      issues.push({
        id: `unreachable-${id}`,
        severity: 'warning',
        code: 'UNREACHABLE_NODE',
        message: `${node.label} is unreachable from any Client / Traffic Generator.`,
        nodeId: id,
      });
    }
  }

  const hasError = issues.some((issue) => issue.severity === 'error');
  return { valid: !hasError, issues };
}
