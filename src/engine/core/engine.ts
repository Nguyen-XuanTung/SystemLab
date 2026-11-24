import { VirtualClock } from './clock';
import { MinHeap } from './minHeap';
import {
  compareSimEvents,
  EVENT_PRIORITY,
  type SimEvent,
  type SimEventPayload,
  type SimulationEventType,
} from '../events/types';
import { MetricsCollector, type NodeMetricInput } from '../metrics/collector';
import {
  DEFAULT_SAFETY_LIMITS,
  ENGINE_VERSION,
  type ActiveFault,
  type ArchitectureGraph,
  type CircuitState,
  type EngineRunStatus,
  type FaultType,
  type LogicalRequest,
  type NodeRuntimeStatus,
  type RequestMethod,
  type ScheduledFault,
  type SimEdge,
  type SimNode,
  type SimulationConfig,
  type SimulationSnapshot,
  type ValidationIssue,
} from '../models/types';
import { FaultManager } from '../policies/faults';
import { SeededRng } from '../random/prng';
import { validateGraph } from '../validation/validator';

export class GraphValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues[0]?.message ?? 'Invalid architecture graph.');
    this.name = 'GraphValidationError';
    this.issues = issues;
  }
}

interface QueuedRequestItem {
  requestId: string;
  enqueuedAtMs: number;
}

interface QueuedJobItem {
  jobId: string;
  enqueuedAtMs: number;
  linkedRequestId?: string;
}

interface ActiveJobEntry {
  jobId: string;
  mqNodeId: string;
  nodeEpoch: number;
  enqueuedAtMs: number;
  startedAtMs: number;
  serviceMs: number;
  linkedRequestId?: string;
}

interface NodeRuntime {
  node: SimNode;
  nodeEpoch: number;
  generationEpoch: number;
  activeCount: number;
  activeRequestIds: Set<string>;
  queue: QueuedRequestItem[];
  // Load balancer state
  rrCursor: number;
  // API Gateway token bucket state
  tokens: number;
  lastTokenRefillMs: number;
  // Message Queue state
  mqJobs: QueuedJobItem[];
  mqReservedSlots: number;
  // Worker state
  activeJobs: Map<string, ActiveJobEntry>;
  // Circuit Breaker state
  circuitState: CircuitState;
  cbConsecutiveFailures: number;
  cbOpenUntilMs: number;
  cbHalfOpenInFlight: number;
  cbHalfOpenSuccesses: number;
  cbEpoch: number;
}

interface QueuedLocation {
  nodeId: string;
}

interface RequestCbContext {
  cbId: string;
  cbEpoch: number;
  isHalfOpenProbe: boolean;
}

export interface RunSliceResult {
  processedEvents: number;
  virtualTimeMs: number;
  status: EngineRunStatus;
  haltReason?: string;
}

export class SimulationEngine {
  readonly graph: ArchitectureGraph;
  readonly config: SimulationConfig;

  private readonly clock = new VirtualClock();
  private readonly rng: SeededRng;
  private readonly heap = new MinHeap<SimEvent>(compareSimEvents);
  private readonly faultManager: FaultManager;
  private readonly collector: MetricsCollector;

  private readonly nodeRuntimes = new Map<string, NodeRuntime>();
  private readonly outgoingEdges = new Map<string, SimEdge[]>();
  private readonly incomingEdges = new Map<string, SimEdge[]>();

  private readonly requests = new Map<string, LogicalRequest>();
  private readonly queuedLocation = new Map<string, QueuedLocation>();
  private readonly requestParentAppNode = new Map<string, string>();
  private readonly requestCbContexts = new Map<string, RequestCbContext[]>();

  private eventSeq = 0;
  private requestSeq = 0;
  private jobSeq = 0;
  private manualFaultSeq = 0;
  private status: EngineRunStatus = 'ready';
  private haltReason: string | undefined;

  private zeroTimeTimestamp = 0;
  private zeroTimeRunCount = 0;

  constructor(
    graph: ArchitectureGraph,
    config: Partial<SimulationConfig> & Pick<SimulationConfig, 'seed' | 'durationMs'>,
    scheduledFaults: readonly ScheduledFault[] = [],
  ) {
    const fullConfig: SimulationConfig = {
      seed: config.seed,
      durationMs: config.durationMs,
      drainOnEnd: config.drainOnEnd ?? true,
      maxDrainMs: config.maxDrainMs ?? 15_000,
      safetyLimits: {
        ...DEFAULT_SAFETY_LIMITS,
        ...config.safetyLimits,
      },
    };

    const validation = validateGraph(graph, fullConfig);
    if (!validation.valid) {
      throw new GraphValidationError(validation.issues.filter((i) => i.severity === 'error'));
    }

    this.graph = {
      nodes: graph.nodes.map((n) => ({ ...n, config: { ...n.config } })),
      edges: graph.edges.map((e) => ({ ...e })),
    };
    this.config = fullConfig;
    this.rng = new SeededRng(fullConfig.seed);
    this.faultManager = new FaultManager(scheduledFaults);
    this.collector = new MetricsCollector(fullConfig.durationMs, this.rng);

    this.initializeTopology();
    this.scheduleInitialEvents();
  }

  private initializeTopology(): void {
    for (const node of this.graph.nodes) {
      this.outgoingEdges.set(node.id, []);
      this.incomingEdges.set(node.id, []);
      const baseCap = this.getBaseCapacity(node);
      this.collector.registerNode(node.id, node.label, node.config.type, baseCap);
      this.nodeRuntimes.set(node.id, {
        node,
        nodeEpoch: 0,
        generationEpoch: 0,
        activeCount: 0,
        activeRequestIds: new Set(),
        queue: [],
        rrCursor: 0,
        tokens: node.config.type === 'api_gateway' ? node.config.burstCapacity : 0,
        lastTokenRefillMs: 0,
        mqJobs: [],
        mqReservedSlots: 0,
        activeJobs: new Map(),
        circuitState: 'closed',
        cbConsecutiveFailures: 0,
        cbOpenUntilMs: 0,
        cbHalfOpenInFlight: 0,
        cbHalfOpenSuccesses: 0,
        cbEpoch: 0,
      });
    }

    for (const edge of this.graph.edges) {
      this.outgoingEdges.get(edge.source)?.push(edge);
      this.incomingEdges.get(edge.target)?.push(edge);
    }
  }

  private scheduleInitialEvents(): void {
    // Schedule traffic arrivals from all client nodes
    for (const node of this.graph.nodes) {
      if (node.config.type === 'client') {
        const firstOffset =
          node.config.workloadPattern === 'poisson'
            ? this.rng.nextExponentialMs(node.config.ratePerSecond)
            : 0;
        if (firstOffset < this.config.durationMs) {
          this.scheduleEvent(firstOffset, 'REQUEST_CREATED', node.id, {
            nodeEpoch: 0,
          });
        }
      }
    }

    // Schedule Chaos Lab faults
    for (const fault of this.faultManager.getFaultTimeline()) {
      const startMs = Math.max(0, fault.startAtMs);
      if (
        startMs <=
        this.config.durationMs + (this.config.drainOnEnd ? this.config.maxDrainMs : 0)
      ) {
        this.scheduleEvent(startMs, 'FAULT_ACTIVATED', fault.targetId, {
          faultId: fault.id,
        });
      }
    }

    // Schedule initial periodic telemetry tick
    this.scheduleNextMetricsTick(this.collector.bucketMs);
  }

  private scheduleNextMetricsTick(atMs: number): void {
    const horizon = this.getHardHorizonMs();
    if (atMs <= horizon) {
      this.scheduleEvent(atMs, 'METRICS_TICK', '__metrics__', {});
    }
  }

  private getHardHorizonMs(): number {
    return this.config.durationMs + (this.config.drainOnEnd ? this.config.maxDrainMs : 0);
  }

  private getBaseCapacity(node: SimNode): number {
    switch (node.config.type) {
      case 'app_server':
      case 'worker':
        return node.config.concurrency;
      case 'database':
      case 'read_replica':
        return node.config.maxConnections;
      case 'message_queue':
        return node.config.queueCapacity;
      default:
        return 0;
    }
  }

  private getEffectiveCapacity(rt: NodeRuntime): number {
    if (this.faultManager.isNodeFailed(rt.node.id)) return 0;
    const base = this.getBaseCapacity(rt.node);
    if (base <= 0) return 0;
    const mult = this.faultManager.getCapacityMultiplier(rt.node.id);
    if (mult <= 0) return 0;
    return Math.max(1, Math.floor(base * mult));
  }

  private scheduleEvent(
    timestampMs: number,
    type: SimulationEventType,
    nodeId: string,
    payload: SimEventPayload = {},
  ): void {
    this.eventSeq += 1;
    this.heap.push({
      id: `ev-${this.eventSeq}`,
      timestampMs,
      type,
      priority: EVENT_PRIORITY[type],
      sequence: this.eventSeq,
      nodeId,
      payload,
    });
  }

  get virtualTimeMs(): number {
    return this.clock.nowMs;
  }

  get currentStatus(): EngineRunStatus {
    return this.status;
  }

  /**
   * Injects a live fault at current virtual time during a paused or active run.
   */
  injectFault(
    type: FaultType,
    targetId: string,
    value: number,
    durationMs: number | null = null,
    label?: string,
  ): ActiveFault {
    this.manualFaultSeq += 1;
    const faultId = `manual-fault-${this.manualFaultSeq}`;
    const nowMs = this.clock.nowMs;
    const fault: ActiveFault = {
      id: faultId,
      type,
      targetId,
      activatedAtMs: nowMs,
      expiresAtMs: durationMs !== null ? nowMs + Math.max(0, durationMs) : null,
      value,
      origin: 'manual',
      label,
    };
    this.applyFaultActivation(fault, nowMs);
    if (fault.expiresAtMs !== null) {
      this.scheduleEvent(fault.expiresAtMs, 'FAULT_EXPIRED', targetId, { faultId });
    }
    return fault;
  }

  /**
   * Recovers an active fault manually at current virtual time.
   */
  recoverFault(faultId: string): boolean {
    const expired = this.faultManager.expireFault(faultId, this.clock.nowMs);
    if (!expired) return false;
    this.applyFaultExpiration(expired, this.clock.nowMs);
    return true;
  }

  private isHalted(): boolean {
    return this.status === 'halted_safety';
  }

  private hasActiveWork(): boolean {
    if (this.requests.size > 0) return true;
    for (const rt of this.nodeRuntimes.values()) {
      if (rt.mqJobs.length > 0 || rt.mqReservedSlots > 0 || rt.activeJobs.size > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Executes exactly one discrete event from the priority queue.
   */
  step(): boolean {
    if (this.status === 'completed' || this.status === 'halted_safety') {
      return false;
    }

    const next = this.heap.pop();
    if (!next) {
      this.finishSimulation();
      return false;
    }

    // Stop cleanly at durationMs when drainOnEnd is false, or at maxDrainMs
    const hardStopMs = this.getHardHorizonMs();
    if (next.timestampMs > hardStopMs) {
      this.clock.advanceTo(hardStopMs);
      this.finishSimulation();
      return false;
    }

    // If past durationMs with no active work (or drain disabled), stop cleanly at durationMs
    if (
      next.timestampMs > this.config.durationMs &&
      (!this.config.drainOnEnd || !this.hasActiveWork())
    ) {
      if (this.clock.nowMs < this.config.durationMs) {
        this.clock.advanceTo(this.config.durationMs);
      }
      this.finishSimulation();
      return false;
    }

    // Avoid dangling trailing METRICS_TICK events when no simulation work remains
    if (
      next.type === 'METRICS_TICK' &&
      this.heap.isEmpty() &&
      next.timestampMs > this.config.durationMs
    ) {
      this.finishSimulation();
      return false;
    }

    this.status = 'running';

    // Enforce safety limits: maxEvents
    const nextProcessed = this.collector.getProcessedEventCount() + 1;
    if (nextProcessed > this.config.safetyLimits.maxEvents) {
      this.haltSafety(
        `Safety ceiling reached: processed events exceeded ${this.config.safetyLimits.maxEvents}.`,
      );
      return false;
    }

    // Enforce safety limits: zero-time event loop guard
    if (Math.abs(next.timestampMs - this.zeroTimeTimestamp) < 1e-9) {
      this.zeroTimeRunCount += 1;
      if (this.zeroTimeRunCount > this.config.safetyLimits.maxZeroTimeEvents) {
        this.haltSafety(
          `Safety ceiling reached: >${this.config.safetyLimits.maxZeroTimeEvents} events at timestamp ${next.timestampMs.toFixed(2)} ms (possible zero-time loop).`,
        );
        return false;
      }
    } else {
      this.zeroTimeTimestamp = next.timestampMs;
      this.zeroTimeRunCount = 1;
    }

    this.clock.advanceTo(next.timestampMs);
    this.collector.incrementProcessedEvents();
    this.dispatchEvent(next);

    if (this.isHalted()) {
      return false;
    }

    if (this.heap.isEmpty() && this.clock.nowMs >= this.config.durationMs) {
      this.finishSimulation();
      return false;
    }

    return true;
  }

  /**
   * Advances simulation up to targetMs or maxEventsBudget, whichever happens first.
   */
  runUntil(targetMs: number, maxEventsBudget = Number.POSITIVE_INFINITY): RunSliceResult {
    let processed = 0;
    const clampedTarget = Math.min(targetMs, this.getHardHorizonMs());

    while (processed < maxEventsBudget) {
      const peek = this.heap.peek();
      if (!peek) {
        this.finishSimulation();
        break;
      }
      if (
        peek.timestampMs > this.config.durationMs &&
        (!this.config.drainOnEnd || !this.hasActiveWork())
      ) {
        if (this.clock.nowMs < this.config.durationMs) {
          this.clock.advanceTo(this.config.durationMs);
        }
        this.finishSimulation();
        break;
      }
      if (peek.timestampMs > clampedTarget) {
        if (
          clampedTarget > this.config.durationMs &&
          (!this.config.drainOnEnd || !this.hasActiveWork())
        ) {
          if (this.clock.nowMs < this.config.durationMs) {
            this.clock.advanceTo(this.config.durationMs);
          }
          this.finishSimulation();
          break;
        }
        this.clock.advanceTo(clampedTarget);
        if (clampedTarget >= this.getHardHorizonMs()) {
          this.finishSimulation();
        }
        break;
      }
      const didStep = this.step();
      processed += 1;
      if (!didStep) break;
    }

    return {
      processedEvents: processed,
      virtualTimeMs: this.clock.nowMs,
      status: this.status,
      haltReason: this.haltReason,
    };
  }

  /**
   * Runs headless until simulation horizon (and drain if enabled) finishes.
   */
  runToCompletion(): SimulationSnapshot {
    while (this.status !== 'completed' && this.status !== 'halted_safety') {
      const hasMore = this.step();
      if (!hasMore) break;
    }
    return this.getSnapshot(false);
  }

  private finishSimulation(): void {
    if (this.status === 'completed' || this.status === 'halted_safety') return;
    const finalMs = Math.max(this.clock.nowMs, this.config.durationMs);
    const boundedFinalMs = Math.min(finalMs, this.getHardHorizonMs());
    if (boundedFinalMs > this.clock.nowMs) {
      this.clock.advanceTo(boundedFinalMs);
    }
    this.collector.recordTimeSeriesBucket(this.clock.nowMs, this.collectNodeInputs());
    this.status = 'completed';
  }

  private haltSafety(reason: string): void {
    this.status = 'halted_safety';
    this.haltReason = reason;
    this.collector.logEvent(this.clock.nowMs, 'error', 'NODE_FAILED', '__engine__', reason);
  }

  private dispatchEvent(ev: SimEvent): void {
    switch (ev.type) {
      case 'REQUEST_CREATED':
        this.handleRequestCreated(ev);
        break;
      case 'REQUEST_ARRIVED':
        this.handleRequestArrived(ev);
        break;
      case 'SERVICE_COMPLETED':
        this.handleServiceCompleted(ev);
        break;
      case 'RETRY_SCHEDULED':
        this.handleRetryScheduled(ev);
        break;
      case 'REQUEST_SUCCEEDED':
        this.handleScheduledRequestSucceeded(ev);
        break;
      case 'REQUEST_TIMEOUT':
        this.handleRequestTimeout(ev);
        break;
      case 'JOB_ENQUEUED':
        this.handleJobEnqueued(ev);
        break;
      case 'JOB_COMPLETED':
        this.handleJobCompleted(ev);
        break;
      case 'FAULT_ACTIVATED':
        this.handleFaultActivated(ev);
        break;
      case 'FAULT_EXPIRED':
        this.handleFaultExpired(ev);
        break;
      case 'CIRCUIT_HALF_OPEN':
        this.handleCircuitHalfOpen(ev);
        break;
      case 'METRICS_TICK':
        this.handleMetricsTick(ev);
        break;
      default:
        break;
    }
  }

  private handleMetricsTick(ev: SimEvent): void {
    this.collector.recordTimeSeriesBucket(ev.timestampMs, this.collectNodeInputs());
    const nextTick = ev.timestampMs + this.collector.bucketMs;
    // Keep ticking through durationMs or while requests remain in flight during drain
    if (
      nextTick <= this.config.durationMs ||
      (this.config.drainOnEnd && this.collector.getInFlightCount() > 0)
    ) {
      this.scheduleNextMetricsTick(nextTick);
    }
  }

  private getClientEffectiveRate(rt: NodeRuntime, nowMs: number): number {
    if (rt.node.config.type !== 'client') return 0;
    const cfg = rt.node.config;
    const faultMult = this.faultManager.getTrafficMultiplier(rt.node.id);
    let baseRate = cfg.ratePerSecond;

    if (cfg.workloadPattern === 'bursty') {
      const phase = nowMs % cfg.burstPeriodMs;
      if (phase < cfg.burstDurationMs) {
        baseRate = cfg.ratePerSecond * cfg.burstMultiplier;
      }
    } else if (cfg.workloadPattern === 'ramp') {
      const progress = Math.min(1, Math.max(0, nowMs / Math.max(1, this.config.durationMs)));
      baseRate = cfg.ratePerSecond * (0.25 + 0.75 * progress);
    } else if (cfg.workloadPattern === 'step') {
      const halfDuration = Math.max(1, this.config.durationMs / 2);
      if (nowMs >= halfDuration) {
        baseRate = cfg.ratePerSecond * cfg.burstMultiplier;
      }
    }

    return Math.max(0.01, baseRate * faultMult);
  }

  private handleRequestCreated(ev: SimEvent): void {
    const rt = this.nodeRuntimes.get(ev.nodeId);
    if (!rt || rt.node.config.type !== 'client') return;
    if ((ev.payload.nodeEpoch ?? 0) !== rt.generationEpoch) return;
    if (ev.timestampMs >= this.config.durationMs - 1e-6) return;

    const cfg = rt.node.config;
    if (this.collector.getInFlightCount() >= this.config.safetyLimits.maxInFlight) {
      this.haltSafety(
        `Safety ceiling reached: in-flight requests exceeded ${this.config.safetyLimits.maxInFlight}.`,
      );
      return;
    }

    this.requestSeq += 1;
    const reqId = `req-${this.requestSeq}`;
    const method: RequestMethod = this.rng.nextBool(cfg.readRatio) ? 'read' : 'write';

    const request: LogicalRequest = {
      id: reqId,
      method,
      sourceClientId: rt.node.id,
      createdAtMs: ev.timestampMs,
      deadlineMs: ev.timestampMs + cfg.timeoutMs,
      terminalState: null,
      completedAtMs: null,
      errorCategory: null,
      hopCount: 0,
      retriesAttemptedOnNode: {},
      circuitBreakerIds: [],
      isBackgroundJob: false,
      hops: [],
    };
    this.requests.set(reqId, request);
    this.collector.recordGenerated(false);
    this.collector.recordArrival(rt.node.id, 0);

    // Schedule deadline timeout
    this.scheduleEvent(request.deadlineMs, 'REQUEST_TIMEOUT', rt.node.id, {
      requestId: reqId,
    });

    // Forward to downstream target
    if (this.faultManager.isNodeFailed(rt.node.id)) {
      this.finalizeRequest(request, 'failed', 'CLIENT_FAILED', ev.timestampMs, rt.node.id);
    } else {
      const out = this.outgoingEdges.get(rt.node.id) ?? [];
      const edge = this.pickRoutingEdge(out, request.method, false) ?? out[0];
      if (!edge) {
        this.finalizeRequest(request, 'failed', 'NO_DOWNSTREAM', ev.timestampMs, rt.node.id);
      } else {
        request.hops.push({
          nodeId: rt.node.id,
          nodeLabel: rt.node.label,
          nodeType: 'client',
          arrivedAtMs: ev.timestampMs,
          queueWaitMs: 0,
          serviceMs: 0,
          departedAtMs: ev.timestampMs,
          outcome: 'forwarded',
        });
        this.forwardAlongEdge(request, edge, ev.timestampMs);
      }
    }

    // Schedule next arrival from this client
    const rate = this.getClientEffectiveRate(rt, ev.timestampMs);
    const interArrivalMs =
      cfg.workloadPattern === 'poisson' ? this.rng.nextExponentialMs(rate) : 1000 / rate;
    const nextAtMs = ev.timestampMs + Math.max(0.001, interArrivalMs);
    if (nextAtMs < this.config.durationMs - 1e-6) {
      this.scheduleEvent(nextAtMs, 'REQUEST_CREATED', rt.node.id, {
        nodeEpoch: rt.generationEpoch,
      });
    }
  }

  private forwardAlongEdge(request: LogicalRequest, edge: SimEdge, nowMs: number): void {
    if (request.terminalState !== null) return;

    if (this.faultManager.isEdgeFailed(edge.id)) {
      this.collector.recordEdgeTraffic(edge.id, true, false);
      this.handleDownstreamFailure(request, edge.source, 'EDGE_FAILED', this.clock.nowMs);
      return;
    }

    request.hopCount += 1;
    if (request.hopCount > this.config.safetyLimits.maxHops) {
      this.finalizeRequest(request, 'failed', 'MAX_HOPS_EXCEEDED', this.clock.nowMs, edge.source);
      return;
    }

    const edgeDelay = Math.max(
      0,
      edge.latencyMs + this.faultManager.getEdgeLatencyDeltaMs(edge.id),
    );
    this.collector.recordEdgeTraffic(edge.id, false, false);
    this.scheduleEvent(nowMs + edgeDelay, 'REQUEST_ARRIVED', edge.target, {
      requestId: request.id,
      edgeId: edge.id,
      sourceNodeId: edge.source,
    });
  }

  private handleRequestArrived(ev: SimEvent): void {
    const reqId = ev.payload.requestId;
    if (!reqId) return;
    const request = this.requests.get(reqId);
    if (!request || request.terminalState !== null) return;

    const rt = this.nodeRuntimes.get(ev.nodeId);
    if (!rt) return;

    const nowMs = ev.timestampMs;
    this.collector.recordArrival(rt.node.id, rt.queue.length);

    if (this.faultManager.isNodeFailed(rt.node.id)) {
      this.collector.recordNodeFailure(rt.node.id);
      this.recordFailHop(request, rt.node, nowMs, 0, 0, 'NODE_FAILED');
      this.handleDownstreamFailure(request, rt.node.id, 'NODE_FAILED', nowMs);
      return;
    }

    const extraDrop = this.faultManager.getExtraDropProbability(rt.node.id);
    if (extraDrop > 0 && this.rng.nextBool(extraDrop)) {
      this.collector.recordDrop(rt.node.id);
      this.recordFailHop(request, rt.node, nowMs, 0, 0, 'PACKET_DROP');
      this.handleDownstreamFailure(request, rt.node.id, 'PACKET_DROP', nowMs);
      return;
    }

    switch (rt.node.config.type) {
      case 'load_balancer':
        this.processLoadBalancer(rt, request, nowMs);
        break;
      case 'api_gateway':
        this.processApiGateway(rt, request, nowMs);
        break;
      case 'circuit_breaker':
        this.processCircuitBreaker(rt, request, nowMs);
        break;
      case 'cache':
        this.processCache(rt, request, nowMs, ev.payload.edgeId);
        break;
      case 'app_server':
      case 'database':
      case 'read_replica':
        this.enqueueOrStartService(rt, request, nowMs, nowMs);
        break;
      case 'message_queue':
        this.processMessageQueueArrival(rt, request, nowMs);
        break;
      case 'worker':
        // Direct edge into worker (without MQ): treat as bounded worker pool
        this.enqueueOrStartService(rt, request, nowMs, nowMs);
        break;
      case 'client':
        break;
    }
  }

  private processLoadBalancer(rt: NodeRuntime, request: LogicalRequest, nowMs: number): void {
    if (rt.node.config.type !== 'load_balancer') return;
    const cfg = rt.node.config;
    const edges = this.outgoingEdges.get(rt.node.id) ?? [];

    const candidates = edges.filter((edge) => {
      if (this.faultManager.isEdgeFailed(edge.id)) return false;
      if (!cfg.healthCheckEnabled) return true;
      return !this.faultManager.isNodeFailed(edge.target);
    });

    if (candidates.length === 0) {
      this.collector.recordDrop(rt.node.id);
      this.recordFailHop(request, rt.node, nowMs, 0, 0, 'NO_HEALTHY_TARGETS');
      this.handleDownstreamFailure(request, rt.node.id, 'NO_HEALTHY_TARGETS', nowMs);
      return;
    }

    let chosenEdge: SimEdge | undefined;
    if (cfg.strategy === 'round_robin') {
      chosenEdge = candidates[rt.rrCursor % candidates.length];
      rt.rrCursor += 1;
    } else if (cfg.strategy === 'random') {
      chosenEdge = this.rng.pick(candidates);
    } else {
      // least_in_flight: lowest (activeCount + queue.length) at target, tie-break by candidate order
      let bestScore = Number.POSITIVE_INFINITY;
      for (const edge of candidates) {
        const targetRt = this.nodeRuntimes.get(edge.target);
        const load = targetRt ? targetRt.activeCount + targetRt.queue.length : 0;
        if (load < bestScore) {
          bestScore = load;
          chosenEdge = edge;
        }
      }
    }

    if (!chosenEdge) return;

    const procMs = cfg.processingLatencyMs + this.faultManager.getNodeLatencyDeltaMs(rt.node.id);
    this.collector.recordServiceCompletion(rt.node.id, 0, procMs);
    this.collector.recordRoutedTarget(rt.node.id, chosenEdge.target);

    request.hops.push({
      nodeId: rt.node.id,
      nodeLabel: rt.node.label,
      nodeType: 'load_balancer',
      arrivedAtMs: nowMs,
      queueWaitMs: 0,
      serviceMs: procMs,
      departedAtMs: nowMs + procMs,
      outcome: 'forwarded',
      note: `strategy=${cfg.strategy} -> ${chosenEdge.target}`,
    });

    this.forwardAlongEdge(request, chosenEdge, nowMs + procMs);
  }

  private processApiGateway(rt: NodeRuntime, request: LogicalRequest, nowMs: number): void {
    if (rt.node.config.type !== 'api_gateway') return;
    const cfg = rt.node.config;

    if (cfg.rateLimitEnabled) {
      const elapsedSec = Math.max(0, (nowMs - rt.lastTokenRefillMs) / 1000);
      rt.tokens = Math.min(cfg.burstCapacity, rt.tokens + elapsedSec * cfg.rateLimitRps);
      rt.lastTokenRefillMs = nowMs;

      if (rt.tokens < 1) {
        this.collector.recordRateLimited(rt.node.id);
        this.collector.logEvent(
          nowMs,
          'warn',
          'RATE_LIMITED',
          rt.node.id,
          `${rt.node.label} rate-limited ${request.id} (token bucket empty).`,
          request.id,
        );
        this.recordFailHop(request, rt.node, nowMs, 0, 0, 'RATE_LIMITED');
        this.handleDownstreamFailure(request, rt.node.id, 'RATE_LIMITED', nowMs);
        return;
      }
      rt.tokens -= 1;
    }

    const edges = this.outgoingEdges.get(rt.node.id) ?? [];
    const chosenEdge = this.pickRoutingEdge(
      edges,
      request.method,
      cfg.routingMode === 'read_write_split',
    );
    if (!chosenEdge) {
      this.collector.recordDrop(rt.node.id);
      this.recordFailHop(request, rt.node, nowMs, 0, 0, 'NO_ROUTING_TARGET');
      this.handleDownstreamFailure(request, rt.node.id, 'NO_ROUTING_TARGET', nowMs);
      return;
    }

    const procMs = cfg.processingLatencyMs + this.faultManager.getNodeLatencyDeltaMs(rt.node.id);
    this.collector.recordServiceCompletion(rt.node.id, 0, procMs);
    this.collector.recordRoutedTarget(rt.node.id, chosenEdge.target);

    request.hops.push({
      nodeId: rt.node.id,
      nodeLabel: rt.node.label,
      nodeType: 'api_gateway',
      arrivedAtMs: nowMs,
      queueWaitMs: 0,
      serviceMs: procMs,
      departedAtMs: nowMs + procMs,
      outcome: 'forwarded',
    });

    this.forwardAlongEdge(request, chosenEdge, nowMs + procMs);
  }

  private pickRoutingEdge(
    edges: readonly SimEdge[],
    method: RequestMethod,
    readWriteSplit: boolean,
  ): SimEdge | undefined {
    const liveEdges = edges.filter((e) => !this.faultManager.isEdgeFailed(e.id));
    if (liveEdges.length === 0) return undefined;
    if (readWriteSplit) {
      const exactMatch = liveEdges.find((e) => e.routeType === method);
      if (exactMatch) return exactMatch;
    }
    const defaultMatch = liveEdges.find((e) => e.routeType === 'default');
    return defaultMatch ?? liveEdges[0];
  }

  private processCircuitBreaker(rt: NodeRuntime, request: LogicalRequest, nowMs: number): void {
    if (rt.node.config.type !== 'circuit_breaker') return;
    const cfg = rt.node.config;

    if (rt.circuitState === 'open' && nowMs >= rt.cbOpenUntilMs) {
      this.transitionCircuitHalfOpen(rt, nowMs);
    }

    if (rt.circuitState === 'open') {
      this.collector.recordCircuitRejection(rt.node.id);
      this.recordFailHop(request, rt.node, nowMs, 0, 0, 'CIRCUIT_OPEN');
      this.finalizeRequest(request, 'failed', 'CIRCUIT_OPEN', nowMs, rt.node.id, rt.node.id);
      return;
    }

    let isHalfOpenProbe = false;
    if (rt.circuitState === 'half_open') {
      if (rt.cbHalfOpenInFlight >= cfg.halfOpenMaxProbes) {
        this.collector.recordCircuitRejection(rt.node.id);
        this.recordFailHop(request, rt.node, nowMs, 0, 0, 'CIRCUIT_OPEN');
        this.finalizeRequest(request, 'failed', 'CIRCUIT_OPEN', nowMs, rt.node.id, rt.node.id);
        return;
      }
      rt.cbHalfOpenInFlight += 1;
      isHalfOpenProbe = true;
    }

    const edges = this.outgoingEdges.get(rt.node.id) ?? [];
    const chosenEdge = this.pickRoutingEdge(edges, request.method, false);
    if (!chosenEdge) {
      if (isHalfOpenProbe) {
        rt.cbHalfOpenInFlight = Math.max(0, rt.cbHalfOpenInFlight - 1);
      }
      this.collector.recordDrop(rt.node.id);
      this.finalizeRequest(request, 'failed', 'NO_DOWNSTREAM', nowMs, rt.node.id, rt.node.id);
      return;
    }

    if (!request.circuitBreakerIds.includes(rt.node.id)) {
      request.circuitBreakerIds.push(rt.node.id);
    }
    const cbContexts = this.requestCbContexts.get(request.id) ?? [];
    if (!cbContexts.some((c) => c.cbId === rt.node.id)) {
      cbContexts.push({ cbId: rt.node.id, cbEpoch: rt.cbEpoch, isHalfOpenProbe });
      this.requestCbContexts.set(request.id, cbContexts);
    }

    const procMs = cfg.processingLatencyMs + this.faultManager.getNodeLatencyDeltaMs(rt.node.id);
    this.collector.recordServiceCompletion(rt.node.id, 0, procMs);

    request.hops.push({
      nodeId: rt.node.id,
      nodeLabel: rt.node.label,
      nodeType: 'circuit_breaker',
      arrivedAtMs: nowMs,
      queueWaitMs: 0,
      serviceMs: procMs,
      departedAtMs: nowMs + procMs,
      outcome: 'forwarded',
      note: `state=${rt.circuitState}`,
    });

    this.forwardAlongEdge(request, chosenEdge, nowMs + procMs);
  }

  private transitionCircuitHalfOpen(rt: NodeRuntime, nowMs: number): void {
    if (rt.circuitState !== 'open') return;
    rt.circuitState = 'half_open';
    rt.cbHalfOpenInFlight = 0;
    rt.cbHalfOpenSuccesses = 0;
    this.collector.logEvent(
      nowMs,
      'info',
      'CIRCUIT_HALF_OPEN',
      rt.node.id,
      `${rt.node.label} transitioned to HALF-OPEN to probe downstream recovery.`,
    );
  }

  private handleCircuitHalfOpen(ev: SimEvent): void {
    const rt = this.nodeRuntimes.get(ev.nodeId);
    if (!rt || rt.node.config.type !== 'circuit_breaker') return;
    if ((ev.payload.nodeEpoch ?? 0) !== rt.cbEpoch) return;
    this.transitionCircuitHalfOpen(rt, ev.timestampMs);
  }

  private notifyCircuitBreakers(
    request: LogicalRequest,
    succeeded: boolean,
    nowMs: number,
    excludeCbId?: string,
  ): void {
    const cbContexts = this.requestCbContexts.get(request.id);
    this.requestCbContexts.delete(request.id);
    if (request.isBackgroundJob || !cbContexts || cbContexts.length === 0) {
      return;
    }

    for (const ctx of cbContexts) {
      if (ctx.cbId === excludeCbId) continue;
      const rt = this.nodeRuntimes.get(ctx.cbId);
      if (!rt || rt.node.config.type !== 'circuit_breaker') continue;
      if (ctx.cbEpoch !== rt.cbEpoch) continue;
      const cfg = rt.node.config;

      if (succeeded) {
        if (rt.circuitState === 'closed') {
          rt.cbConsecutiveFailures = 0;
        } else if (rt.circuitState === 'half_open' && ctx.isHalfOpenProbe) {
          rt.cbHalfOpenInFlight = Math.max(0, rt.cbHalfOpenInFlight - 1);
          rt.cbHalfOpenSuccesses += 1;
          if (rt.cbHalfOpenSuccesses >= cfg.halfOpenMaxProbes) {
            rt.circuitState = 'closed';
            rt.cbConsecutiveFailures = 0;
            rt.cbEpoch += 1;
            this.collector.logEvent(
              nowMs,
              'info',
              'CIRCUIT_CLOSED',
              ctx.cbId,
              `${rt.node.label} probe succeeded; circuit CLOSED.`,
              request.id,
            );
          }
        }
      } else {
        if (rt.circuitState === 'half_open' && ctx.isHalfOpenProbe) {
          rt.cbHalfOpenInFlight = Math.max(0, rt.cbHalfOpenInFlight - 1);
          this.tripCircuitOpen(rt, cfg.openDurationMs, nowMs, request.id);
        } else if (rt.circuitState === 'closed') {
          rt.cbConsecutiveFailures += 1;
          if (rt.cbConsecutiveFailures >= cfg.failureThreshold) {
            this.tripCircuitOpen(rt, cfg.openDurationMs, nowMs, request.id);
          }
        }
      }
    }
  }

  private tripCircuitOpen(
    rt: NodeRuntime,
    openDurationMs: number,
    nowMs: number,
    requestId?: string,
  ): void {
    rt.circuitState = 'open';
    rt.cbOpenUntilMs = nowMs + openDurationMs;
    rt.cbEpoch += 1;
    this.collector.logEvent(
      nowMs,
      'warn',
      'CIRCUIT_OPENED',
      rt.node.id,
      `${rt.node.label} tripped OPEN for ${openDurationMs} ms after consecutive failures.`,
      requestId,
    );
    this.scheduleEvent(rt.cbOpenUntilMs, 'CIRCUIT_HALF_OPEN', rt.node.id, {
      nodeEpoch: rt.cbEpoch,
    });
  }

  private processCache(
    rt: NodeRuntime,
    request: LogicalRequest,
    nowMs: number,
    incomingEdgeId?: string,
  ): void {
    if (rt.node.config.type !== 'cache') return;
    const cfg = rt.node.config;
    const lookupMs = cfg.lookupLatencyMs + this.faultManager.getNodeLatencyDeltaMs(rt.node.id);

    if (request.method === 'read') {
      const effectiveHitRatio = this.faultManager.getEffectiveCacheHitRatio(
        rt.node.id,
        cfg.hitProbability,
        cfg.coldStartWarmupMs,
        nowMs,
      );
      const isHit = this.rng.nextBool(effectiveHitRatio);

      if (isHit) {
        this.collector.recordCacheHit(rt.node.id);
        this.collector.recordServiceCompletion(rt.node.id, 0, lookupMs);
        request.hops.push({
          nodeId: rt.node.id,
          nodeLabel: rt.node.label,
          nodeType: 'cache',
          arrivedAtMs: nowMs,
          queueWaitMs: 0,
          serviceMs: lookupMs,
          departedAtMs: nowMs + lookupMs,
          outcome: 'cache_hit',
        });

        // Mark incoming edge cache hit pulse without double-counting edge traffic count
        if (incomingEdgeId) {
          this.collector.recordEdgeCacheHit(incomingEdgeId);
        }

        if (lookupMs === 0) {
          this.finalizeRequest(request, 'succeeded', null, nowMs, rt.node.id);
        } else {
          rt.activeRequestIds.add(request.id);
          this.scheduleEvent(nowMs + lookupMs, 'REQUEST_SUCCEEDED', rt.node.id, {
            requestId: request.id,
            nodeEpoch: rt.nodeEpoch,
          });
        }
        return;
      }

      // Cache miss -> forward to downstream origin
      this.collector.recordCacheMiss(rt.node.id);
      this.collector.recordServiceCompletion(rt.node.id, 0, lookupMs);
      const edges = this.outgoingEdges.get(rt.node.id) ?? [];
      const originEdge = this.pickRoutingEdge(edges, request.method, false);
      if (!originEdge) {
        this.collector.recordDrop(rt.node.id);
        this.recordFailHop(request, rt.node, nowMs, 0, 0, 'CACHE_ORIGIN_MISSING');
        this.handleDownstreamFailure(request, rt.node.id, 'CACHE_ORIGIN_MISSING', nowMs);
        return;
      }

      request.hops.push({
        nodeId: rt.node.id,
        nodeLabel: rt.node.label,
        nodeType: 'cache',
        arrivedAtMs: nowMs,
        queueWaitMs: 0,
        serviceMs: lookupMs,
        departedAtMs: nowMs + lookupMs,
        outcome: 'cache_miss',
      });
      this.forwardAlongEdge(request, originEdge, nowMs + lookupMs);
      return;
    }

    // Write path
    const delayMs = cfg.writePolicy === 'write_through' ? lookupMs : 0;
    const edges = this.outgoingEdges.get(rt.node.id) ?? [];
    const originEdge = this.pickRoutingEdge(edges, request.method, false);
    if (!originEdge) {
      this.collector.recordDrop(rt.node.id);
      this.recordFailHop(request, rt.node, nowMs, 0, 0, 'CACHE_ORIGIN_MISSING');
      this.handleDownstreamFailure(request, rt.node.id, 'CACHE_ORIGIN_MISSING', nowMs);
      return;
    }
    this.collector.recordServiceCompletion(rt.node.id, 0, delayMs);
    request.hops.push({
      nodeId: rt.node.id,
      nodeLabel: rt.node.label,
      nodeType: 'cache',
      arrivedAtMs: nowMs,
      queueWaitMs: 0,
      serviceMs: delayMs,
      departedAtMs: nowMs + delayMs,
      outcome: 'forwarded',
      note: `write_policy=${cfg.writePolicy}`,
    });
    this.forwardAlongEdge(request, originEdge, nowMs + delayMs);
  }

  private handleScheduledRequestSucceeded(ev: SimEvent): void {
    const reqId = ev.payload.requestId;
    if (!reqId) return;
    const rt = this.nodeRuntimes.get(ev.nodeId);
    if (rt) {
      if ((ev.payload.nodeEpoch ?? 0) !== rt.nodeEpoch) return;
      rt.activeRequestIds.delete(reqId);
    }
    if (this.faultManager.isNodeFailed(ev.nodeId)) return;
    const request = this.requests.get(reqId);
    if (!request || request.terminalState !== null) return;
    this.finalizeRequest(request, 'succeeded', null, ev.timestampMs, ev.nodeId);
  }

  private enqueueOrStartService(
    rt: NodeRuntime,
    request: LogicalRequest,
    enqueuedAtMs: number,
    nowMs: number,
  ): void {
    const effectiveCap = this.getEffectiveCapacity(rt);

    if (rt.activeCount < effectiveCap) {
      this.startService(rt, request, enqueuedAtMs, nowMs);
      return;
    }

    const queueCap = this.getQueueCapacity(rt.node);
    if (rt.queue.length < queueCap) {
      rt.queue.push({ requestId: request.id, enqueuedAtMs });
      this.queuedLocation.set(request.id, { nodeId: rt.node.id });
      this.collector.recordQueueDepth(rt.node.id, rt.queue.length);
      return;
    }

    this.collector.recordDrop(rt.node.id);
    this.collector.logEvent(
      nowMs,
      'warn',
      'QUEUE_OVERFLOW',
      rt.node.id,
      `${rt.node.label} dropped ${request.id} (queue full: ${queueCap}).`,
      request.id,
    );
    this.recordFailHop(request, rt.node, nowMs, 0, 0, 'QUEUE_OVERFLOW');
    this.handleDownstreamFailure(request, rt.node.id, 'QUEUE_OVERFLOW', nowMs);
  }

  private getQueueCapacity(node: SimNode): number {
    switch (node.config.type) {
      case 'app_server':
      case 'database':
      case 'read_replica':
        return node.config.queueCapacity;
      case 'message_queue':
        return node.config.queueCapacity;
      default:
        return 0;
    }
  }

  private sampleNodeServiceMs(rt: NodeRuntime, method: RequestMethod): number {
    const delta = this.faultManager.getNodeLatencyDeltaMs(rt.node.id);
    const cfg = rt.node.config;
    if (cfg.type === 'app_server') {
      return this.rng.nextServiceTimeMs(cfg.serviceTimeMs, cfg.distribution, cfg.cv) + delta;
    }
    if (cfg.type === 'database') {
      const mean = method === 'read' ? cfg.readLatencyMs : cfg.writeLatencyMs;
      return this.rng.nextServiceTimeMs(mean, cfg.distribution, cfg.cv) + delta;
    }
    if (cfg.type === 'read_replica') {
      return this.rng.nextServiceTimeMs(cfg.readLatencyMs, cfg.distribution, cfg.cv) + delta;
    }
    if (cfg.type === 'worker') {
      return this.rng.nextServiceTimeMs(cfg.processingTimeMs, cfg.distribution, cfg.cv) + delta;
    }
    return delta;
  }

  private startService(
    rt: NodeRuntime,
    request: LogicalRequest,
    enqueuedAtMs: number,
    nowMs: number,
  ): void {
    const effectiveCap = this.getEffectiveCapacity(rt);
    this.collector.flushNodeUtilization(rt.node.id, nowMs, rt.activeCount, effectiveCap);
    rt.activeCount += 1;
    rt.activeRequestIds.add(request.id);
    this.collector.flushNodeUtilization(rt.node.id, nowMs, rt.activeCount, effectiveCap);

    // Reject misrouted writes at read replica after acquiring connection slot briefly or upfront
    const serviceMs = this.sampleNodeServiceMs(rt, request.method);
    const waitMs = Math.max(0, nowMs - enqueuedAtMs);

    request.hops.push({
      nodeId: rt.node.id,
      nodeLabel: rt.node.label,
      nodeType: rt.node.config.type,
      arrivedAtMs: enqueuedAtMs,
      queueWaitMs: waitMs,
      serviceMs,
      departedAtMs: nowMs + serviceMs,
      outcome: 'completed',
    });

    this.scheduleEvent(nowMs + serviceMs, 'SERVICE_COMPLETED', rt.node.id, {
      requestId: request.id,
      nodeEpoch: rt.nodeEpoch,
    });
  }

  private handleServiceCompleted(ev: SimEvent): void {
    const rt = this.nodeRuntimes.get(ev.nodeId);
    if (!rt) return;

    // Ignore stale completion from before a node crash / reset
    if ((ev.payload.nodeEpoch ?? 0) !== rt.nodeEpoch) {
      return;
    }

    const nowMs = ev.timestampMs;
    const effectiveCap = this.getEffectiveCapacity(rt);
    this.collector.flushNodeUtilization(rt.node.id, nowMs, rt.activeCount, effectiveCap);
    rt.activeCount = Math.max(0, rt.activeCount - 1);
    const reqId = ev.payload.requestId;
    if (reqId) {
      rt.activeRequestIds.delete(reqId);
    }
    this.collector.flushNodeUtilization(rt.node.id, nowMs, rt.activeCount, effectiveCap);
    const request = reqId ? this.requests.get(reqId) : undefined;

    if (request && request.terminalState === null) {
      const lastHop = request.hops[request.hops.length - 1];
      const waitMs = lastHop?.nodeId === rt.node.id ? lastHop.queueWaitMs : 0;
      const serviceMs = lastHop?.nodeId === rt.node.id ? lastHop.serviceMs : 0;

      // Record DB read/write counters
      if (rt.node.config.type === 'database') {
        this.collector.recordDbOp(rt.node.id, request.method);
      } else if (rt.node.config.type === 'read_replica') {
        if (request.method === 'write') {
          this.collector.recordNodeFailure(rt.node.id);
          if (lastHop) {
            lastHop.outcome = 'failed';
            lastHop.note = 'WRITE_TO_READ_REPLICA';
          }
          this.handleDownstreamFailure(request, rt.node.id, 'WRITE_TO_READ_REPLICA', nowMs);
          this.drainNextFromQueue(rt, nowMs);
          return;
        }
        this.collector.recordDbOp(rt.node.id, 'read');
      }

      // Evaluate probabilistic failure on compute / storage nodes
      const failProb =
        'failureProbability' in rt.node.config ? rt.node.config.failureProbability : 0;
      if (failProb > 0 && this.rng.nextBool(failProb)) {
        this.collector.recordNodeFailure(rt.node.id);
        if (lastHop) {
          lastHop.outcome = 'failed';
          lastHop.note = 'INTERNAL_ERROR';
        }
        this.handleServiceNodeFailureOrRetry(rt, request, 'INTERNAL_ERROR', nowMs);
        this.drainNextFromQueue(rt, nowMs);
        return;
      }

      this.collector.recordServiceCompletion(rt.node.id, waitMs, serviceMs);

      if (rt.node.config.type === 'app_server') {
        this.requestParentAppNode.set(request.id, rt.node.id);
      }

      // Forward downstream or complete if terminal node
      const edges = this.outgoingEdges.get(rt.node.id) ?? [];
      if (edges.length === 0) {
        this.finalizeRequest(request, 'succeeded', null, nowMs, rt.node.id);
      } else {
        const chosenEdge = this.pickRoutingEdge(edges, request.method, false);
        if (!chosenEdge) {
          this.handleDownstreamFailure(request, rt.node.id, 'EDGE_FAILED', nowMs);
        } else {
          if (lastHop) {
            lastHop.outcome = 'forwarded';
          }
          this.forwardAlongEdge(request, chosenEdge, nowMs);
        }
      }
    }

    // Always free worker slot to start next queued request even if previous request timed out
    this.drainNextFromQueue(rt, nowMs);

    if (rt.node.config.type === 'worker') {
      for (const inEdge of this.incomingEdges.get(rt.node.id) ?? []) {
        const mqRt = this.nodeRuntimes.get(inEdge.source);
        if (mqRt && mqRt.node.config.type === 'message_queue' && mqRt.mqJobs.length > 0) {
          this.dispatchJobsFromMq(mqRt, nowMs);
        }
      }
    }
  }

  private drainNextFromQueue(rt: NodeRuntime, nowMs: number): void {
    if (this.faultManager.isNodeFailed(rt.node.id)) return;
    const effectiveCap = this.getEffectiveCapacity(rt);

    while (rt.activeCount < effectiveCap && rt.queue.length > 0) {
      const nextQueued = rt.queue.shift();
      if (!nextQueued) break;
      this.queuedLocation.delete(nextQueued.requestId);
      const queuedReq = this.requests.get(nextQueued.requestId);
      if (!queuedReq || queuedReq.terminalState !== null) {
        continue;
      }
      this.startService(rt, queuedReq, nextQueued.enqueuedAtMs, nowMs);
    }
  }

  private handleServiceNodeFailureOrRetry(
    rt: NodeRuntime,
    request: LogicalRequest,
    reason: string,
    nowMs: number,
  ): void {
    if (rt.node.config.type === 'app_server' && !request.isBackgroundJob) {
      const attempted = request.retriesAttemptedOnNode[rt.node.id] ?? 0;
      if (
        attempted < rt.node.config.maxRetries &&
        nowMs + rt.node.config.retryDelayMs < request.deadlineMs
      ) {
        request.retriesAttemptedOnNode[rt.node.id] = attempted + 1;
        this.collector.logEvent(
          nowMs,
          'warn',
          'RETRY_SCHEDULED',
          rt.node.id,
          `${rt.node.label} scheduling retry ${attempted + 1}/${rt.node.config.maxRetries} for ${request.id}.`,
          request.id,
        );
        this.scheduleEvent(nowMs + rt.node.config.retryDelayMs, 'RETRY_SCHEDULED', rt.node.id, {
          requestId: request.id,
        });
        return;
      }
    }
    this.handleDownstreamFailure(request, rt.node.id, reason, nowMs);
  }

  private handleDownstreamFailure(
    request: LogicalRequest,
    failedAtNodeId: string,
    reason: string,
    nowMs: number,
  ): void {
    if (request.terminalState !== null) return;

    const appId = this.requestParentAppNode.get(request.id);
    if (appId && appId !== failedAtNodeId && !request.isBackgroundJob) {
      const appRt = this.nodeRuntimes.get(appId);
      if (
        appRt &&
        appRt.node.config.type === 'app_server' &&
        !this.faultManager.isNodeFailed(appId)
      ) {
        const attempted = request.retriesAttemptedOnNode[appId] ?? 0;
        if (
          attempted < appRt.node.config.maxRetries &&
          nowMs + appRt.node.config.retryDelayMs < request.deadlineMs
        ) {
          request.retriesAttemptedOnNode[appId] = attempted + 1;
          this.collector.logEvent(
            nowMs,
            'warn',
            'RETRY_SCHEDULED',
            appId,
            `${appRt.node.label} retrying ${request.id} (${attempted + 1}/${appRt.node.config.maxRetries}) after ${reason}.`,
            request.id,
          );
          this.scheduleEvent(nowMs + appRt.node.config.retryDelayMs, 'RETRY_SCHEDULED', appId, {
            requestId: request.id,
          });
          return;
        }
      }
    }

    this.finalizeRequest(request, 'failed', reason, nowMs, failedAtNodeId);
  }

  private handleRetryScheduled(ev: SimEvent): void {
    const reqId = ev.payload.requestId;
    if (!reqId) return;
    const request = this.requests.get(reqId);
    if (!request || request.terminalState !== null) return;

    const rt = this.nodeRuntimes.get(ev.nodeId);
    if (!rt || this.faultManager.isNodeFailed(rt.node.id)) {
      this.finalizeRequest(request, 'failed', 'NODE_FAILED', ev.timestampMs, ev.nodeId);
      return;
    }

    this.enqueueOrStartService(rt, request, ev.timestampMs, ev.timestampMs);
  }

  private processMessageQueueArrival(
    rt: NodeRuntime,
    request: LogicalRequest,
    nowMs: number,
  ): void {
    if (rt.node.config.type !== 'message_queue') return;
    const cfg = rt.node.config;

    if (rt.mqJobs.length + rt.mqReservedSlots >= cfg.queueCapacity) {
      this.collector.recordDrop(rt.node.id);
      this.collector.logEvent(
        nowMs,
        'warn',
        'QUEUE_OVERFLOW',
        rt.node.id,
        `${rt.node.label} rejected ${request.id} (queue capacity ${cfg.queueCapacity} full).`,
        request.id,
      );
      this.recordFailHop(request, rt.node, nowMs, 0, 0, 'QUEUE_OVERFLOW');
      this.handleDownstreamFailure(request, rt.node.id, 'QUEUE_OVERFLOW', nowMs);
      return;
    }

    rt.mqReservedSlots += 1;
    const enqDelay = cfg.enqueueLatencyMs + this.faultManager.getNodeLatencyDeltaMs(rt.node.id);
    this.jobSeq += 1;
    const jobId = `job-${this.jobSeq}`;

    request.hops.push({
      nodeId: rt.node.id,
      nodeLabel: rt.node.label,
      nodeType: 'message_queue',
      arrivedAtMs: nowMs,
      queueWaitMs: 0,
      serviceMs: enqDelay,
      departedAtMs: nowMs + enqDelay,
      outcome: 'enqueued',
      note: `job=${jobId} (${cfg.deliveryMode})`,
    });

    rt.activeRequestIds.add(request.id);
    this.scheduleEvent(nowMs + enqDelay, 'JOB_ENQUEUED', rt.node.id, {
      jobId,
      requestId: request.id,
      nodeEpoch: rt.nodeEpoch,
    });
  }

  private handleJobEnqueued(ev: SimEvent): void {
    const rt = this.nodeRuntimes.get(ev.nodeId);
    if (!rt || rt.node.config.type !== 'message_queue') return;
    if ((ev.payload.nodeEpoch ?? 0) !== rt.nodeEpoch) return;
    const nowMs = ev.timestampMs;

    rt.mqReservedSlots = Math.max(0, rt.mqReservedSlots - 1);
    const reqId = ev.payload.requestId;
    if (reqId) {
      rt.activeRequestIds.delete(reqId);
    }
    if (this.faultManager.isNodeFailed(rt.node.id)) {
      const req = reqId ? this.requests.get(reqId) : undefined;
      if (req && req.terminalState === null) {
        this.handleDownstreamFailure(req, rt.node.id, 'NODE_FAILED', nowMs);
      }
      return;
    }

    const jobId = ev.payload.jobId ?? `job-${this.jobSeq}`;
    const req = reqId ? this.requests.get(reqId) : undefined;

    this.collector.recordJobEnqueued(rt.node.id);
    this.collector.recordServiceCompletion(rt.node.id, 0, rt.node.config.enqueueLatencyMs);

    if (rt.node.config.deliveryMode === 'async_ack') {
      if (req && req.terminalState === null) {
        this.finalizeRequest(req, 'succeeded', null, nowMs, rt.node.id);
      }
      rt.mqJobs.push({ jobId, enqueuedAtMs: nowMs });
    } else {
      // sync_wait: keep caller in flight until worker completes
      rt.mqJobs.push({ jobId, enqueuedAtMs: nowMs, linkedRequestId: reqId });
    }

    this.collector.recordQueueDepth(rt.node.id, rt.mqJobs.length);
    this.dispatchJobsFromMq(rt, nowMs);
  }

  private dispatchJobsFromMq(mqRt: NodeRuntime, nowMs: number): void {
    if (this.faultManager.isNodeFailed(mqRt.node.id)) return;
    if (mqRt.mqJobs.length === 0) return;

    const edges = this.outgoingEdges.get(mqRt.node.id) ?? [];
    const workerEdges = edges.filter((e) => {
      if (this.faultManager.isEdgeFailed(e.id)) return false;
      const target = this.nodeRuntimes.get(e.target);
      return (
        target && target.node.config.type === 'worker' && !this.faultManager.isNodeFailed(e.target)
      );
    });

    if (workerEdges.length === 0) return;

    let attemptsWithoutProgress = 0;
    while (mqRt.mqJobs.length > 0 && attemptsWithoutProgress < workerEdges.length) {
      const edge = workerEdges[mqRt.rrCursor % workerEdges.length];
      mqRt.rrCursor += 1;
      if (!edge) break;
      const workerRt = this.nodeRuntimes.get(edge.target);
      if (!workerRt) {
        attemptsWithoutProgress += 1;
        continue;
      }

      const workerCap = this.getEffectiveCapacity(workerRt);
      if (workerRt.activeCount < workerCap) {
        const job = mqRt.mqJobs.shift();
        if (!job) break;
        attemptsWithoutProgress = 0;

        this.collector.flushNodeUtilization(
          workerRt.node.id,
          nowMs,
          workerRt.activeCount,
          workerCap,
        );
        workerRt.activeCount += 1;
        this.collector.flushNodeUtilization(
          workerRt.node.id,
          nowMs,
          workerRt.activeCount,
          workerCap,
        );

        const serviceMs = this.sampleNodeServiceMs(workerRt, 'write');
        const edgeDelay = Math.max(
          0,
          edge.latencyMs + this.faultManager.getEdgeLatencyDeltaMs(edge.id),
        );
        const totalWorkerMs = edgeDelay + serviceMs;
        this.collector.recordEdgeTraffic(edge.id, false, false);
        this.collector.recordArrival(workerRt.node.id, 0);

        workerRt.activeJobs.set(job.jobId, {
          jobId: job.jobId,
          mqNodeId: mqRt.node.id,
          nodeEpoch: workerRt.nodeEpoch,
          enqueuedAtMs: job.enqueuedAtMs,
          startedAtMs: nowMs,
          serviceMs: totalWorkerMs,
          linkedRequestId: job.linkedRequestId,
        });

        this.scheduleEvent(nowMs + totalWorkerMs, 'JOB_COMPLETED', workerRt.node.id, {
          jobId: job.jobId,
          nodeEpoch: workerRt.nodeEpoch,
        });
      } else {
        attemptsWithoutProgress += 1;
      }
    }
  }

  private handleJobCompleted(ev: SimEvent): void {
    const workerRt = this.nodeRuntimes.get(ev.nodeId);
    if (!workerRt || workerRt.node.config.type !== 'worker') return;
    if ((ev.payload.nodeEpoch ?? 0) !== workerRt.nodeEpoch) return;

    const nowMs = ev.timestampMs;
    const jobId = ev.payload.jobId;
    const job = jobId ? workerRt.activeJobs.get(jobId) : undefined;
    if (jobId) {
      workerRt.activeJobs.delete(jobId);
    }

    const workerCap = this.getEffectiveCapacity(workerRt);
    this.collector.flushNodeUtilization(workerRt.node.id, nowMs, workerRt.activeCount, workerCap);
    workerRt.activeCount = Math.max(0, workerRt.activeCount - 1);
    this.collector.flushNodeUtilization(workerRt.node.id, nowMs, workerRt.activeCount, workerCap);

    if (job) {
      const failProb =
        workerRt.node.config.failureProbability +
        this.faultManager.getExtraDropProbability(workerRt.node.id);
      const jobFailed = failProb > 0 && this.rng.nextBool(Math.min(1, failProb));

      if (jobFailed) {
        this.collector.recordJobFailed(job.mqNodeId, workerRt.node.id);
        if (job.linkedRequestId) {
          const linked = this.requests.get(job.linkedRequestId);
          if (linked && linked.terminalState === null) {
            this.finalizeRequest(linked, 'failed', 'WORKER_JOB_FAILED', nowMs, workerRt.node.id);
          }
        }
      } else {
        this.collector.recordServiceCompletion(
          workerRt.node.id,
          Math.max(0, job.startedAtMs - job.enqueuedAtMs),
          job.serviceMs,
        );
        this.collector.recordJobCompleted(
          job.mqNodeId,
          workerRt.node.id,
          Math.max(0, nowMs - job.enqueuedAtMs),
        );

        // If worker connects downstream (e.g. Database), send background request or linked sync_wait request
        const outEdges = this.outgoingEdges.get(workerRt.node.id) ?? [];
        const downstream = this.pickRoutingEdge(outEdges, 'write', false);
        if (downstream) {
          if (job.linkedRequestId) {
            const linked = this.requests.get(job.linkedRequestId);
            if (linked && linked.terminalState === null) {
              this.forwardAlongEdge(linked, downstream, nowMs);
            }
          } else {
            // Spawn background-tagged request so DB sees real load without inflating HTTP Generated/Succeeded
            const bgId = `bg-${job.jobId}`;
            const bgReq: LogicalRequest = {
              id: bgId,
              method: 'write',
              sourceClientId: workerRt.node.id,
              createdAtMs: nowMs,
              deadlineMs: this.getHardHorizonMs() + 10_000,
              terminalState: null,
              completedAtMs: null,
              errorCategory: null,
              hopCount: 0,
              retriesAttemptedOnNode: {},
              circuitBreakerIds: [],
              isBackgroundJob: true,
              hops: [],
            };
            this.requests.set(bgId, bgReq);
            this.forwardAlongEdge(bgReq, downstream, nowMs);
          }
        } else if (job.linkedRequestId) {
          const linked = this.requests.get(job.linkedRequestId);
          if (linked && linked.terminalState === null) {
            this.finalizeRequest(linked, 'succeeded', null, nowMs, workerRt.node.id);
          }
        }
      }
    }

    // Pull next job from any upstream Message Queue
    for (const inEdge of this.incomingEdges.get(workerRt.node.id) ?? []) {
      const mqRt = this.nodeRuntimes.get(inEdge.source);
      if (mqRt && mqRt.node.config.type === 'message_queue' && mqRt.mqJobs.length > 0) {
        this.dispatchJobsFromMq(mqRt, nowMs);
      }
    }
  }

  private handleRequestTimeout(ev: SimEvent): void {
    const reqId = ev.payload.requestId;
    if (!reqId) return;
    const request = this.requests.get(reqId);
    if (!request || request.terminalState !== null) return;

    // If queued at a server/DB, remove from queue cleanly so queueDepth remains exact
    const loc = this.queuedLocation.get(reqId);
    if (loc) {
      const rt = this.nodeRuntimes.get(loc.nodeId);
      if (rt) {
        rt.queue = rt.queue.filter((item) => item.requestId !== reqId);
      }
      this.queuedLocation.delete(reqId);
    }

    this.finalizeRequest(request, 'timed_out', 'REQUEST_TIMEOUT', ev.timestampMs, ev.nodeId);
  }

  private handleFaultActivated(ev: SimEvent): void {
    const faultId = ev.payload.faultId;
    if (!faultId) return;
    const scheduled = this.faultManager.getFaultTimeline().find((item) => item.id === faultId);
    if (!scheduled) return;

    const fault: ActiveFault = {
      id: scheduled.id,
      type: scheduled.type,
      targetId: scheduled.targetId,
      activatedAtMs: ev.timestampMs,
      expiresAtMs:
        scheduled.durationMs !== null ? ev.timestampMs + Math.max(0, scheduled.durationMs) : null,
      value: scheduled.value,
      origin: 'scheduled',
      label: scheduled.label,
    };

    this.applyFaultActivation(fault, ev.timestampMs);
    if (fault.expiresAtMs !== null) {
      this.scheduleEvent(fault.expiresAtMs, 'FAULT_EXPIRED', fault.targetId, {
        faultId: fault.id,
      });
    }
  }

  private applyFaultActivation(fault: ActiveFault, nowMs: number): void {
    this.faultManager.activateFault(fault);
    this.collector.logEvent(
      nowMs,
      'error',
      fault.type === 'node_failure' ? 'NODE_FAILED' : 'FAULT_ACTIVATED',
      fault.targetId,
      `Fault activated: ${fault.type} on ${fault.targetId} (value=${fault.value}).`,
    );

    if (fault.type === 'node_failure') {
      const rt = this.nodeRuntimes.get(fault.targetId);
      if (rt) {
        this.collector.flushNodeUtilization(rt.node.id, nowMs, 0, 0);
        rt.nodeEpoch += 1;
        rt.activeCount = 0;

        // Fail all queued requests on this node immediately
        const queuedItems = rt.queue.splice(0);
        for (const item of queuedItems) {
          this.queuedLocation.delete(item.requestId);
          const req = this.requests.get(item.requestId);
          if (req && req.terminalState === null) {
            this.collector.recordNodeFailure(rt.node.id);
            this.recordFailHop(req, rt.node, nowMs, nowMs - item.enqueuedAtMs, 0, 'NODE_FAILED');
            this.handleDownstreamFailure(req, rt.node.id, 'NODE_FAILED', nowMs);
          }
        }

        // Fail active in-service requests running on this node immediately
        const activeIds = Array.from(rt.activeRequestIds);
        rt.activeRequestIds.clear();
        for (const reqId of activeIds) {
          const req = this.requests.get(reqId);
          if (req && req.terminalState === null) {
            this.collector.recordNodeFailure(rt.node.id);
            const lastHop = req.hops[req.hops.length - 1];
            if (lastHop && lastHop.nodeId === rt.node.id) {
              lastHop.outcome = 'failed';
              lastHop.departedAtMs = nowMs;
              lastHop.note = 'NODE_FAILED_IN_FLIGHT';
            }
            this.handleDownstreamFailure(req, rt.node.id, 'NODE_FAILED', nowMs);
          }
        }

        // Fail queued jobs if message queue crashed
        if (rt.node.config.type === 'message_queue') {
          rt.mqReservedSlots = 0;
          const queuedJobs = rt.mqJobs.splice(0);
          for (const job of queuedJobs) {
            this.collector.recordNodeFailure(rt.node.id);
            this.collector.recordJobFailed(rt.node.id, '');
            if (job.linkedRequestId) {
              const linked = this.requests.get(job.linkedRequestId);
              if (linked && linked.terminalState === null) {
                this.handleDownstreamFailure(linked, rt.node.id, 'NODE_FAILED', nowMs);
              }
            }
          }
        }

        // Fail active worker jobs if worker crashed
        for (const job of rt.activeJobs.values()) {
          this.collector.recordJobFailed(job.mqNodeId, rt.node.id);
          if (job.linkedRequestId) {
            const linked = this.requests.get(job.linkedRequestId);
            if (linked && linked.terminalState === null) {
              this.handleDownstreamFailure(linked, rt.node.id, 'NODE_FAILED', nowMs);
            }
          }
        }
        rt.activeJobs.clear();
      }
    } else if (fault.type === 'capacity_drop') {
      const rt = this.nodeRuntimes.get(fault.targetId);
      if (rt) {
        const cap = this.getEffectiveCapacity(rt);
        this.collector.flushNodeUtilization(rt.node.id, nowMs, rt.activeCount, cap);
      }
    } else if (fault.type === 'traffic_spike') {
      this.rescheduleAffectedClients(fault.targetId, nowMs, true);
    }
  }

  private handleFaultExpired(ev: SimEvent): void {
    const faultId = ev.payload.faultId;
    if (!faultId) return;
    const expired = this.faultManager.expireFault(faultId, ev.timestampMs);
    if (!expired) return;
    this.applyFaultExpiration(expired, ev.timestampMs);
  }

  private applyFaultExpiration(fault: ActiveFault, nowMs: number): void {
    const isRecovered =
      fault.type === 'node_failure' && !this.faultManager.isNodeFailed(fault.targetId);
    this.collector.logEvent(
      nowMs,
      'info',
      isRecovered ? 'NODE_RECOVERED' : 'FAULT_EXPIRED',
      fault.targetId,
      `Fault cleared: ${fault.type} on ${fault.targetId}.`,
    );

    if (fault.type === 'node_failure' || fault.type === 'capacity_drop') {
      const rt = this.nodeRuntimes.get(fault.targetId);
      if (rt) {
        const cap = this.getEffectiveCapacity(rt);
        this.collector.flushNodeUtilization(rt.node.id, nowMs, rt.activeCount, cap);
        this.drainNextFromQueue(rt, nowMs);
        if (rt.node.config.type === 'worker') {
          for (const inEdge of this.incomingEdges.get(rt.node.id) ?? []) {
            const mqRt = this.nodeRuntimes.get(inEdge.source);
            if (mqRt && mqRt.node.config.type === 'message_queue' && mqRt.mqJobs.length > 0) {
              this.dispatchJobsFromMq(mqRt, nowMs);
            }
          }
        } else if (rt.node.config.type === 'message_queue') {
          this.dispatchJobsFromMq(rt, nowMs);
        }
      }
    } else if (fault.type === 'edge_failure') {
      const edge = this.graph.edges.find((e) => e.id === fault.targetId);
      if (edge) {
        const sourceRt = this.nodeRuntimes.get(edge.source);
        if (
          sourceRt &&
          sourceRt.node.config.type === 'message_queue' &&
          sourceRt.mqJobs.length > 0
        ) {
          this.dispatchJobsFromMq(sourceRt, nowMs);
        }
      }
    } else if (fault.type === 'traffic_spike') {
      this.rescheduleAffectedClients(fault.targetId, nowMs, false);
    }
  }

  private rescheduleAffectedClients(targetId: string, nowMs: number, isActivation: boolean): void {
    for (const rt of this.nodeRuntimes.values()) {
      if (rt.node.config.type !== 'client') continue;
      if (targetId !== '*' && targetId !== rt.node.id) continue;
      rt.generationEpoch += 1;
      if (nowMs >= this.config.durationMs - 1e-6) continue;

      const cfg = rt.node.config;
      const rate = this.getClientEffectiveRate(rt, nowMs);
      let nextAtMs: number;
      if (cfg.workloadPattern === 'poisson') {
        nextAtMs = nowMs + Math.max(0.001, this.rng.nextExponentialMs(rate));
      } else if (isActivation) {
        nextAtMs = nowMs;
      } else {
        nextAtMs = nowMs + Math.max(0.001, 1000 / rate);
      }

      if (nextAtMs < this.config.durationMs - 1e-6) {
        this.scheduleEvent(nextAtMs, 'REQUEST_CREATED', rt.node.id, {
          nodeEpoch: rt.generationEpoch,
        });
      }
    }
  }

  private recordFailHop(
    request: LogicalRequest,
    node: SimNode,
    nowMs: number,
    queueWaitMs: number,
    serviceMs: number,
    reason: string,
  ): void {
    request.hops.push({
      nodeId: node.id,
      nodeLabel: node.label,
      nodeType: node.config.type,
      arrivedAtMs: nowMs,
      queueWaitMs,
      serviceMs,
      departedAtMs: nowMs + serviceMs,
      outcome: 'failed',
      note: reason,
    });
  }

  private finalizeRequest(
    request: LogicalRequest,
    terminalState: 'succeeded' | 'failed' | 'timed_out',
    errorCategory: string | null,
    nowMs: number,
    nodeId: string,
    excludeCbId?: string,
  ): void {
    if (request.terminalState !== null) return;
    request.terminalState = terminalState;
    request.completedAtMs = nowMs;
    request.errorCategory = errorCategory;

    this.queuedLocation.delete(request.id);
    this.requestParentAppNode.delete(request.id);
    this.collector.recordTerminal(request, nowMs);
    this.requests.delete(request.id);

    if (!request.isBackgroundJob && terminalState !== 'succeeded') {
      const eventType: SimulationEventType =
        terminalState === 'timed_out' ? 'REQUEST_TIMEOUT' : 'REQUEST_FAILED';
      this.collector.logEvent(
        nowMs,
        terminalState === 'timed_out' ? 'warn' : 'error',
        eventType,
        nodeId,
        `${request.id} ${terminalState}${errorCategory ? ` (${errorCategory})` : ''}.`,
        request.id,
      );
    }

    this.notifyCircuitBreakers(request, terminalState === 'succeeded', nowMs, excludeCbId);
  }

  private computeNodeStatus(rt: NodeRuntime, effectiveCap: number): NodeRuntimeStatus {
    if (this.faultManager.isNodeFailed(rt.node.id)) return 'failed';
    if (rt.node.config.type === 'circuit_breaker' && rt.circuitState === 'open') return 'open';

    const queueCap = this.getQueueCapacity(rt.node);
    const currentQueue =
      rt.node.config.type === 'message_queue' ? rt.mqJobs.length : rt.queue.length;

    if (
      effectiveCap > 0 &&
      rt.activeCount >= effectiveCap &&
      queueCap > 0 &&
      currentQueue >= queueCap * 0.8
    ) {
      return 'saturated';
    }
    if (
      (effectiveCap > 0 && rt.activeCount >= effectiveCap && currentQueue > 0) ||
      this.faultManager.getNodeLatencyDeltaMs(rt.node.id) > 0 ||
      this.faultManager.getCapacityMultiplier(rt.node.id) < 1 ||
      this.faultManager.getExtraDropProbability(rt.node.id) > 0 ||
      (rt.node.config.type === 'circuit_breaker' && rt.circuitState === 'half_open')
    ) {
      return 'degraded';
    }
    return 'healthy';
  }

  private collectNodeInputs(): NodeMetricInput[] {
    const list: NodeMetricInput[] = [];
    for (const rt of this.nodeRuntimes.values()) {
      const effectiveCap = this.getEffectiveCapacity(rt);
      const queueDepth =
        rt.node.config.type === 'message_queue' ? rt.mqJobs.length : rt.queue.length;
      list.push({
        nodeId: rt.node.id,
        label: rt.node.label,
        type: rt.node.config.type,
        status: this.computeNodeStatus(rt, effectiveCap),
        activeRequests: rt.activeCount,
        queueDepth,
        effectiveCapacity: effectiveCap,
        queueCapacity:
          rt.node.config.type === 'message_queue' ? rt.node.config.queueCapacity : undefined,
        circuitState: rt.node.config.type === 'circuit_breaker' ? rt.circuitState : undefined,
      });
    }
    return list;
  }

  getSnapshot(drainEdgeDeltas = true): SimulationSnapshot {
    const nowMs = this.clock.nowMs;
    const nodeInputs = this.collectNodeInputs();
    return {
      engineVersion: ENGINE_VERSION,
      seed: this.config.seed,
      virtualTimeMs: nowMs,
      durationMs: this.config.durationMs,
      status: this.status,
      haltReason: this.haltReason,
      global: this.collector.getGlobalMetrics(nowMs),
      nodeMetrics: this.collector.buildNodeMetrics(nowMs, nodeInputs),
      timeSeries: this.collector.getTimeSeries(),
      eventLog: this.collector.getEventLog(),
      recentTraces: this.collector.getRecentTraces(),
      activeFaults: this.faultManager.getActiveFaults(),
      faultTimeline: this.faultManager.getFaultTimeline(),
      edgeDeltas: this.collector.drainEdgeDeltas(drainEdgeDeltas),
    };
  }
}
