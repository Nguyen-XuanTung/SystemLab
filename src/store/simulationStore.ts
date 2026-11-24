import { create } from 'zustand';
import type {
  ArchitectureGraph,
  EdgeTrafficDelta,
  FaultType,
  SimulationSnapshot,
} from '@/engine/models/types';
import type { VisualizationMode } from '@/features/persistence/repository';
import type { SystemLabProject } from '@/schemas/projectSchema';
import type { WorkerResponse } from '@/workers/protocol';
import { SimulationWorkerClient } from '@/workers/workerClient';

export type SimLifecycleStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'halted_safety'
  | 'error';

export interface EdgePulseSummary {
  count: number;
  errorCount: number;
  cacheHitCount: number;
  seq: number;
}

function toArchitectureGraph(project: SystemLabProject): ArchitectureGraph {
  return {
    nodes: project.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      config: { ...n.config },
    })),
    edges: project.edges.map((e) => ({ ...e })),
  };
}

function buildPulseMap(
  prev: Record<string, EdgePulseSummary>,
  deltas: readonly EdgeTrafficDelta[],
): Record<string, EdgePulseSummary> {
  if (deltas.length === 0) return {};
  const next: Record<string, EdgePulseSummary> = {};
  for (const d of deltas) {
    const priorSeq = prev[d.edgeId]?.seq ?? 0;
    next[d.edgeId] = {
      count: d.count,
      errorCount: d.errorCount,
      cacheHitCount: d.cacheHitCount,
      seq: priorSeq + 1,
    };
  }
  return next;
}

export interface SimulationState {
  status: SimLifecycleStatus;
  speed: number;
  snapshot: SimulationSnapshot | null;
  edgePulseMap: Record<string, EdgePulseSummary>;
  workerFallbackActive: boolean;
  errorMessage: string | null;
  selectedTraceId: string | null;

  run: (project: SystemLabProject, visMode: VisualizationMode) => void;
  pause: () => void;
  resume: () => void;
  step: (project: SystemLabProject, visMode: VisualizationMode) => void;
  stop: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  syncVisMode: (visMode: VisualizationMode) => void;
  injectLiveFault: (
    faultType: FaultType,
    targetId: string,
    value: number,
    durationMs: number | null,
    label?: string,
  ) => void;
  recoverLiveFault: (faultId: string) => void;
  setSelectedTraceId: (traceId: string | null) => void;
}

let clientSingleton: SimulationWorkerClient | null = null;

function getClient(onMessage: (msg: WorkerResponse) => void): SimulationWorkerClient {
  if (!clientSingleton) {
    clientSingleton = new SimulationWorkerClient();
    clientSingleton.subscribe(onMessage);
  }
  return clientSingleton;
}

export const useSimulationStore = create<SimulationState>((set, get) => {
  const handleWorkerMessage = (msg: WorkerResponse): void => {
    switch (msg.type) {
      case 'READY':
        set({
          snapshot: msg.snapshot,
          edgePulseMap: {},
          errorMessage: null,
        });
        break;
      case 'SNAPSHOT':
        set((state) => ({
          status: 'running',
          snapshot: msg.snapshot,
          edgePulseMap: buildPulseMap(state.edgePulseMap, msg.snapshot.edgeDeltas),
        }));
        break;
      case 'PAUSED':
        set({
          status: 'paused',
          snapshot: msg.snapshot,
          edgePulseMap: {},
        });
        break;
      case 'STOPPED':
        set({
          status: 'idle',
          snapshot: msg.snapshot,
          edgePulseMap: {},
        });
        break;
      case 'COMPLETED':
        set({
          status: msg.snapshot.status === 'halted_safety' ? 'halted_safety' : 'completed',
          snapshot: msg.snapshot,
          edgePulseMap: {},
          errorMessage: msg.snapshot.haltReason ?? null,
        });
        break;
      case 'FAULT_INJECTED':
        set({
          snapshot: msg.snapshot,
        });
        break;
      case 'ERROR':
        set({
          status: 'error',
          errorMessage: msg.message,
          edgePulseMap: {},
        });
        break;
    }
  };

  return {
    status: 'idle',
    speed: 1,
    snapshot: null,
    edgePulseMap: {},
    workerFallbackActive: typeof Worker === 'undefined',
    errorMessage: null,
    selectedTraceId: null,

    run: (project, visMode) => {
      const client = getClient(handleWorkerMessage);
      set({
        status: 'running',
        errorMessage: null,
        workerFallbackActive: client.isFallback,
      });
      client.initRun({
        graph: toArchitectureGraph(project),
        config: { ...project.simConfig },
        scheduledFaults: [...project.scheduledFaults],
        speed: get().speed,
        visMode,
      });
      client.start();
    },

    pause: () => {
      const client = getClient(handleWorkerMessage);
      client.pause();
    },

    resume: () => {
      const client = getClient(handleWorkerMessage);
      set({ status: 'running' });
      client.resume();
    },

    step: (project, visMode) => {
      const client = getClient(handleWorkerMessage);
      const curStatus = get().status;
      if (curStatus === 'idle' || curStatus === 'completed' || curStatus === 'error') {
        client.initRun({
          graph: toArchitectureGraph(project),
          config: { ...project.simConfig },
          scheduledFaults: [...project.scheduledFaults],
          speed: get().speed,
          visMode,
        });
      }
      client.step();
    },

    stop: () => {
      const client = getClient(handleWorkerMessage);
      client.stop();
      set({ status: 'idle', edgePulseMap: {} });
    },

    reset: () => {
      const client = getClient(handleWorkerMessage);
      client.reset();
      set({
        status: 'idle',
        snapshot: null,
        edgePulseMap: {},
        errorMessage: null,
        selectedTraceId: null,
      });
    },

    setSpeed: (speed) => {
      set({ speed });
      const client = getClient(handleWorkerMessage);
      client.setSpeed(speed);
    },

    syncVisMode: (visMode) => {
      const client = getClient(handleWorkerMessage);
      client.setVisMode(visMode);
    },

    injectLiveFault: (faultType, targetId, value, durationMs, label) => {
      const client = getClient(handleWorkerMessage);
      client.injectFault(faultType, targetId, value, durationMs, label);
    },

    recoverLiveFault: (faultId) => {
      const client = getClient(handleWorkerMessage);
      client.recoverFault(faultId);
    },

    setSelectedTraceId: (selectedTraceId) => set({ selectedTraceId }),
  };
});
