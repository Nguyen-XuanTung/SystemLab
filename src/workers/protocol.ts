import type {
  ActiveFault,
  ArchitectureGraph,
  FaultType,
  ScheduledFault,
  SimulationConfig,
  SimulationSnapshot,
} from '@/engine/models/types';
import type { VisualizationMode } from '@/features/persistence/repository';

export type WorkerCommand =
  | {
      type: 'INIT';
      runId: number;
      graph: ArchitectureGraph;
      config: SimulationConfig;
      scheduledFaults: ScheduledFault[];
      speed: number;
      visMode: VisualizationMode;
    }
  | { type: 'START'; runId: number }
  | { type: 'PAUSE'; runId: number }
  | { type: 'RESUME'; runId: number }
  | { type: 'STEP'; runId: number }
  | { type: 'STOP'; runId: number }
  | { type: 'RESET'; runId: number }
  | { type: 'SET_SPEED'; runId: number; speed: number }
  | { type: 'SET_VIS_MODE'; runId: number; visMode: VisualizationMode }
  | {
      type: 'INJECT_FAULT';
      runId: number;
      faultType: FaultType;
      targetId: string;
      value: number;
      durationMs: number | null;
      label?: string;
    }
  | { type: 'RECOVER_FAULT'; runId: number; faultId: string }
  | { type: 'REQUEST_SNAPSHOT'; runId: number };

export type WorkerResponse =
  | { type: 'READY'; runId: number; snapshot: SimulationSnapshot }
  | { type: 'SNAPSHOT'; runId: number; snapshot: SimulationSnapshot }
  | { type: 'PAUSED'; runId: number; snapshot: SimulationSnapshot }
  | { type: 'STOPPED'; runId: number; snapshot: SimulationSnapshot }
  | { type: 'COMPLETED'; runId: number; snapshot: SimulationSnapshot }
  | { type: 'FAULT_INJECTED'; runId: number; fault: ActiveFault; snapshot: SimulationSnapshot }
  | { type: 'ERROR'; runId: number; message: string };
