import type {
  ArchitectureGraph,
  FaultType,
  ScheduledFault,
  SimulationConfig,
} from '@/engine/models/types';
import type { VisualizationMode } from '@/features/persistence/repository';
import type { WorkerCommand, WorkerResponse } from './protocol';
import { WorkerSessionRunner } from './runner';

export type WorkerListener = (response: WorkerResponse) => void;

/**
 * Manages the simulation Web Worker lifecycle, enforces monotonic runId
 * isolation against stale messages, and transparently falls back to an
 * in-process runner when Web Workers are unavailable.
 */
export class SimulationWorkerClient {
  private worker: Worker | null = null;
  private fallbackRunner: WorkerSessionRunner | null = null;
  private fallbackMode = false;
  private currentRunId = 0;
  private listener: WorkerListener | null = null;

  constructor(forceFallback = false) {
    this.initBackend(forceFallback);
  }

  get isFallback(): boolean {
    return this.fallbackMode;
  }

  get activeRunId(): number {
    return this.currentRunId;
  }

  subscribe(listener: WorkerListener): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  private initBackend(forceFallback: boolean): void {
    if (!forceFallback && typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
          type: 'module',
        });
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
          this.handleIncoming(ev.data);
        };
        worker.onerror = (err) => {
          this.listener?.({
            type: 'ERROR',
            runId: this.currentRunId,
            message: err.message || 'Web Worker encountered a runtime error.',
          });
        };
        this.worker = worker;
        this.fallbackMode = false;
        return;
      } catch {
        // Fall through cleanly to main-thread fallback
      }
    }

    this.fallbackMode = true;
    this.fallbackRunner = new WorkerSessionRunner((msg) => {
      this.handleIncoming(msg);
    });
  }

  private handleIncoming(msg: WorkerResponse): void {
    if (msg.runId !== this.currentRunId) {
      return; // Discard stale responses from superseded runs
    }
    this.listener?.(msg);
  }

  private post(cmd: WorkerCommand): void {
    if (this.worker) {
      this.worker.postMessage(cmd);
    } else if (this.fallbackRunner) {
      this.fallbackRunner.handleCommand(cmd);
    }
  }

  initRun(params: {
    graph: ArchitectureGraph;
    config: SimulationConfig;
    scheduledFaults: ScheduledFault[];
    speed: number;
    visMode: VisualizationMode;
  }): number {
    this.currentRunId += 1;
    this.post({
      type: 'INIT',
      runId: this.currentRunId,
      graph: params.graph,
      config: params.config,
      scheduledFaults: params.scheduledFaults,
      speed: params.speed,
      visMode: params.visMode,
    });
    return this.currentRunId;
  }

  start(): void {
    this.post({ type: 'START', runId: this.currentRunId });
  }

  pause(): void {
    this.post({ type: 'PAUSE', runId: this.currentRunId });
  }

  resume(): void {
    this.post({ type: 'RESUME', runId: this.currentRunId });
  }

  step(): void {
    this.post({ type: 'STEP', runId: this.currentRunId });
  }

  stop(): void {
    this.post({ type: 'STOP', runId: this.currentRunId });
  }

  reset(): number {
    this.currentRunId += 1;
    this.post({ type: 'RESET', runId: this.currentRunId });
    return this.currentRunId;
  }

  setSpeed(speed: number): void {
    this.post({ type: 'SET_SPEED', runId: this.currentRunId, speed });
  }

  setVisMode(visMode: VisualizationMode): void {
    this.post({ type: 'SET_VIS_MODE', runId: this.currentRunId, visMode });
  }

  injectFault(
    faultType: FaultType,
    targetId: string,
    value: number,
    durationMs: number | null,
    label?: string,
  ): void {
    this.post({
      type: 'INJECT_FAULT',
      runId: this.currentRunId,
      faultType,
      targetId,
      value,
      durationMs,
      label,
    });
  }

  recoverFault(faultId: string): void {
    this.post({ type: 'RECOVER_FAULT', runId: this.currentRunId, faultId });
  }

  dispose(): void {
    this.currentRunId += 1;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.fallbackRunner) {
      this.fallbackRunner.dispose();
      this.fallbackRunner = null;
    }
  }
}
