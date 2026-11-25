import { create } from 'zustand';
import type { SimulationSnapshot } from '@/engine/models/types';
import {
  deleteExperiment as deleteExpFromDb,
  listExperiments,
  saveExperiment as saveExpToDb,
} from '@/features/persistence/repository';
import {
  buildExperimentRecordFromSnapshot,
  type ExperimentRecord,
  safeParseExperimentJson,
  type SystemLabProject,
} from '@/schemas/projectSchema';

export function computeFairnessWarnings(
  baseline: ExperimentRecord,
  candidate: ExperimentRecord,
): string[] {
  const warnings: string[] = [];
  if (baseline.seed !== candidate.seed) {
    warnings.push(`Random seeds differ (${baseline.seed} vs ${candidate.seed}).`);
  }
  if (baseline.durationMs !== candidate.durationMs) {
    warnings.push(
      `Simulation horizons differ (${baseline.durationMs / 1000}s vs ${candidate.durationMs / 1000}s).`,
    );
  }
  if (baseline.drainOnEnd !== candidate.drainOnEnd) {
    warnings.push('End-of-run drain mode differs between Baseline and Candidate.');
  }

  const baseClients = baseline.graphSnapshot.nodes
    .filter((n) => n.config.type === 'client')
    .map((n) =>
      n.config.type === 'client'
        ? `${n.config.ratePerSecond}:${n.config.workloadPattern}:${n.config.readRatio}`
        : '',
    )
    .sort()
    .join('|');
  const candClients = candidate.graphSnapshot.nodes
    .filter((n) => n.config.type === 'client')
    .map((n) =>
      n.config.type === 'client'
        ? `${n.config.ratePerSecond}:${n.config.workloadPattern}:${n.config.readRatio}`
        : '',
    )
    .sort()
    .join('|');
  if (baseClients !== candClients) {
    warnings.push(
      'Client traffic rates, patterns, or read ratios differ between runs (expected if comparing traffic spikes, otherwise compare cautiously).',
    );
  }

  const baseSpikes = baseline.faultTimeline
    .filter((f) => f.type === 'traffic_spike')
    .map((f) => `${f.targetId}:${f.startAtMs}:${f.durationMs ?? 'null'}:${f.value}`)
    .sort()
    .join('|');
  const candSpikes = candidate.faultTimeline
    .filter((f) => f.type === 'traffic_spike')
    .map((f) => `${f.targetId}:${f.startAtMs}:${f.durationMs ?? 'null'}:${f.value}`)
    .sort()
    .join('|');
  if (baseSpikes !== candSpikes) {
    warnings.push(
      'Scheduled traffic spike faults differ between runs (expected when comparing normal vs. peak traffic).',
    );
  }
  return warnings;
}

export interface ExperimentState {
  experiments: ExperimentRecord[];
  baselineId: string | null;
  candidateId: string | null;

  hydrate: () => Promise<void>;
  saveSnapshot: (
    name: string,
    project: SystemLabProject,
    snapshot: SimulationSnapshot,
  ) => Promise<ExperimentRecord>;
  removeExperiment: (id: string) => Promise<void>;
  importExperimentJson: (rawText: string) => Promise<{ ok: boolean; error?: string }>;
  setBaseline: (id: string | null) => void;
  setCandidate: (id: string | null) => void;
}

let expIdCounter = 0;

function nextExpId(prefix: string): string {
  expIdCounter += 1;
  return `${prefix}-${Date.now()}-${expIdCounter}`;
}

export const useExperimentStore = create<ExperimentState>((set, get) => ({
  experiments: [],
  baselineId: null,
  candidateId: null,

  hydrate: async () => {
    const list = await listExperiments();
    set({
      experiments: list,
      baselineId: list[1]?.id ?? list[0]?.id ?? null,
      candidateId: list.length >= 2 ? list[0]!.id : null,
    });
  },

  saveSnapshot: async (name, project, snapshot) => {
    const trimmed = name.trim() || `${project.name} Run`;
    const record = buildExperimentRecordFromSnapshot({
      id: nextExpId('exp'),
      name: trimmed.slice(0, 120),
      project,
      config: project.simConfig,
      snapshot,
    });
    await saveExpToDb(record);
    const list = await listExperiments();
    const curBase = get().baselineId;
    set({
      experiments: list,
      baselineId: curBase ?? record.id,
      candidateId: curBase && curBase !== record.id ? record.id : get().candidateId,
    });
    return record;
  },

  removeExperiment: async (id) => {
    await deleteExpFromDb(id);
    const list = await listExperiments();
    set((s) => ({
      experiments: list,
      baselineId: s.baselineId === id ? (list[0]?.id ?? null) : s.baselineId,
      candidateId: s.candidateId === id ? null : s.candidateId,
    }));
  },

  importExperimentJson: async (rawText) => {
    const res = safeParseExperimentJson(rawText);
    if (!res.ok || !res.data) {
      return { ok: false, error: res.error };
    }
    const imported: ExperimentRecord = {
      ...res.data,
      id: nextExpId('exp-imp'),
    };
    await saveExpToDb(imported);
    const list = await listExperiments();
    set({ experiments: list });
    return { ok: true };
  },

  setBaseline: (baselineId) => set({ baselineId }),
  setCandidate: (candidateId) => set({ candidateId }),
}));
