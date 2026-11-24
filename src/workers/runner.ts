import { GraphValidationError, SimulationEngine } from '@/engine/core/engine';
import type {
  ArchitectureGraph,
  ScheduledFault,
  SimulationConfig,
} from '@/engine/models/types';
import type { VisualizationMode } from '@/features/persistence/repository';
import type { WorkerCommand, WorkerResponse } from './protocol';

const TELEMETRY_FRAME_MS = 50;
const LIVE_SLICE_MAX_EVENTS = 5_000;
const HEADLESS_SLICE_MAX_EVENTS = 25_000;

export class WorkerSessionRunner {
  private engine: SimulationEngine | null = null;
  private activeRunId = 0;
  private isPlaying = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private speed = 1;
  private visMode: VisualizationMode = 'normal';

  private lastInitParams: {
    graph: ArchitectureGraph;
    config: SimulationConfig;
    scheduledFaults: ScheduledFault[];
  } | null = null;

  private readonly emit: (msg: WorkerResponse) => void;

  constructor(emit: (msg: WorkerResponse) => void) {
    this.emit = emit;
  }

  handleCommand(cmd: WorkerCommand): void {
    switch (cmd.type) {
      case 'INIT':
        this.clearTimer();
        this.isPlaying = false;
        this.activeRunId = cmd.runId;
        this.speed = cmd.speed;
        this.visMode = cmd.visMode;
        this.lastInitParams = {
          graph: cmd.graph,
          config: cmd.config,
          scheduledFaults: cmd.scheduledFaults,
        };
        try {
          this.engine = new SimulationEngine(cmd.graph, cmd.config, cmd.scheduledFaults);
          this.emit({
            type: 'READY',
            runId: this.activeRunId,
            snapshot: this.engine.getSnapshot(false),
          });
        } catch (err) {
          this.engine = null;
          this.emit({
            type: 'ERROR',
            runId: this.activeRunId,
            message:
              err instanceof GraphValidationError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : 'Failed to initialize simulation engine.',
          });
        }
        break;

      case 'START':
      case 'RESUME':
        if (cmd.runId !== this.activeRunId || !this.engine) return;
        if (
          this.engine.currentStatus === 'completed' ||
          this.engine.currentStatus === 'halted_safety'
        ) {
          this.emit({
            type: 'COMPLETED',
            runId: this.activeRunId,
            snapshot: this.engine.getSnapshot(false),
          });
          return;
        }
        this.isPlaying = true;
        this.scheduleTick(0);
        break;

      case 'PAUSE':
        if (cmd.runId !== this.activeRunId || !this.engine) return;
        this.isPlaying = false;
        this.clearTimer();
        this.emit({
          type: 'PAUSED',
          runId: this.activeRunId,
          snapshot: this.engine.getSnapshot(false),
        });
        break;

      case 'STEP':
        if (cmd.runId !== this.activeRunId || !this.engine) return;
        this.isPlaying = false;
        this.clearTimer();
        this.engine.step();
        if (
          this.engine.currentStatus === 'completed' ||
          this.engine.currentStatus === 'halted_safety'
        ) {
          this.emit({
            type: 'COMPLETED',
            runId: this.activeRunId,
            snapshot: this.engine.getSnapshot(false),
          });
        } else {
          this.emit({
            type: 'PAUSED',
            runId: this.activeRunId,
            snapshot: this.engine.getSnapshot(true),
          });
        }
        break;

      case 'STOP':
        if (cmd.runId !== this.activeRunId) return;
        this.isPlaying = false;
        this.clearTimer();
        if (this.engine) {
          this.emit({
            type: 'STOPPED',
            runId: this.activeRunId,
            snapshot: this.engine.getSnapshot(false),
          });
        }
        break;

      case 'RESET':
        this.isPlaying = false;
        this.clearTimer();
        this.activeRunId = cmd.runId;
        if (this.lastInitParams) {
          try {
            this.engine = new SimulationEngine(
              this.lastInitParams.graph,
              this.lastInitParams.config,
              this.lastInitParams.scheduledFaults,
            );
            this.emit({
              type: 'READY',
              runId: this.activeRunId,
              snapshot: this.engine.getSnapshot(false),
            });
          } catch (err) {
            this.emit({
              type: 'ERROR',
              runId: this.activeRunId,
              message: err instanceof Error ? err.message : 'Reset failed.',
            });
          }
        }
        break;

      case 'SET_SPEED':
        if (cmd.runId !== this.activeRunId) return;
        this.speed = Math.max(0.1, cmd.speed);
        break;

      case 'SET_VIS_MODE':
        if (cmd.runId !== this.activeRunId) return;
        this.visMode = cmd.visMode;
        break;

      case 'INJECT_FAULT':
        if (cmd.runId !== this.activeRunId || !this.engine) return;
        {
          const fault = this.engine.injectFault(
            cmd.faultType,
            cmd.targetId,
            cmd.value,
            cmd.durationMs,
            cmd.label,
          );
          this.emit({
            type: 'FAULT_INJECTED',
            runId: this.activeRunId,
            fault,
            snapshot: this.engine.getSnapshot(false),
          });
        }
        break;

      case 'RECOVER_FAULT':
        if (cmd.runId !== this.activeRunId || !this.engine) return;
        this.engine.recoverFault(cmd.faultId);
        this.emit({
          type: 'SNAPSHOT',
          runId: this.activeRunId,
          snapshot: this.engine.getSnapshot(false),
        });
        break;

      case 'REQUEST_SNAPSHOT':
        if (cmd.runId !== this.activeRunId || !this.engine) return;
        this.emit({
          type: 'SNAPSHOT',
          runId: this.activeRunId,
          snapshot: this.engine.getSnapshot(false),
        });
        break;
    }
  }

  dispose(): void {
    this.isPlaying = false;
    this.clearTimer();
    this.engine = null;
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private scheduleTick(delayMs: number): void {
    this.clearTimer();
    this.timerId = setTimeout(() => {
      this.runSlice();
    }, delayMs);
  }

  private runSlice(): void {
    if (!this.isPlaying || !this.engine) return;

    const isFastRun = this.visMode === 'headless' || this.speed >= 100;
    const hardHorizon =
      this.engine.config.durationMs +
      (this.engine.config.drainOnEnd ? this.engine.config.maxDrainMs : 0);

    const targetMs = isFastRun
      ? hardHorizon
      : this.engine.virtualTimeMs + TELEMETRY_FRAME_MS * this.speed;

    const budget = isFastRun ? HEADLESS_SLICE_MAX_EVENTS : LIVE_SLICE_MAX_EVENTS;
    const res = this.engine.runUntil(targetMs, budget);

    if (res.status === 'completed' || res.status === 'halted_safety') {
      this.isPlaying = false;
      this.clearTimer();
      this.emit({
        type: 'COMPLETED',
        runId: this.activeRunId,
        snapshot: this.engine.getSnapshot(false),
      });
      return;
    }

    this.emit({
      type: 'SNAPSHOT',
      runId: this.activeRunId,
      snapshot: this.engine.getSnapshot(!isFastRun),
    });

    if (this.isPlaying) {
      this.scheduleTick(isFastRun ? 0 : TELEMETRY_FRAME_MS);
    }
  }
}
