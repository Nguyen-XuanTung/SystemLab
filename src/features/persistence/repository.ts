import type { ExperimentRecord, SystemLabProject } from '@/schemas/projectSchema';
import { db } from './db';

export type ThemeMode = 'dark' | 'light';
export type VisualizationMode = 'normal' | 'reduced_motion' | 'high_speed' | 'headless';

export interface UserPreferences {
  theme: ThemeMode;
  visMode: VisualizationMode;
  snapToGrid: boolean;
  tutorialDismissed: boolean;
}

const PREFS_KEY = 'systemlab:prefs:v1';

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  visMode: 'normal',
  snapToGrid: true,
  tutorialDismissed: false,
};

// In-memory fallback used transparently if IndexedDB is blocked (e.g. private browsing)
const memoryProjects = new Map<string, SystemLabProject>();
const memoryExperiments = new Map<string, ExperimentRecord>();
let storageWarningMessage: string | null = null;

function markFallbackWarning(err: unknown): void {
  const msg = err instanceof Error ? err.message : 'IndexedDB unavailable';
  storageWarningMessage = `Local IndexedDB storage is unavailable (${msg}). Changes are held in memory for this session — export JSON to save your work.`;
}

export function getStorageWarning(): string | null {
  return storageWarningMessage;
}

export function clearMemoryFallbackForTests(): void {
  memoryProjects.clear();
  memoryExperiments.clear();
  storageWarningMessage = null;
}

export async function listProjects(): Promise<SystemLabProject[]> {
  try {
    const items = await db.projects.orderBy('updatedAt').reverse().toArray();
    return items;
  } catch (err) {
    markFallbackWarning(err);
    return Array.from(memoryProjects.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
}

export async function getProject(id: string): Promise<SystemLabProject | undefined> {
  try {
    return await db.projects.get(id);
  } catch (err) {
    markFallbackWarning(err);
    return memoryProjects.get(id);
  }
}

export async function saveProject(project: SystemLabProject): Promise<void> {
  const copy = structuredClone(project);
  memoryProjects.set(copy.id, copy);
  try {
    await db.projects.put(copy);
    storageWarningMessage = null;
  } catch (err) {
    markFallbackWarning(err);
  }
}

export async function deleteProject(id: string): Promise<void> {
  memoryProjects.delete(id);
  try {
    await db.projects.delete(id);
  } catch (err) {
    markFallbackWarning(err);
  }
}

export async function listExperiments(): Promise<ExperimentRecord[]> {
  try {
    return await db.experiments.orderBy('createdAt').reverse().toArray();
  } catch (err) {
    markFallbackWarning(err);
    return Array.from(memoryExperiments.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}

export async function saveExperiment(record: ExperimentRecord): Promise<void> {
  const copy = structuredClone(record);
  memoryExperiments.set(copy.id, copy);
  try {
    await db.experiments.put(copy);
    storageWarningMessage = null;
  } catch (err) {
    markFallbackWarning(err);
  }
}

export async function deleteExperiment(id: string): Promise<void> {
  memoryExperiments.delete(id);
  try {
    await db.experiments.delete(id);
  } catch (err) {
    markFallbackWarning(err);
  }
}

export async function clearAllLocalData(): Promise<void> {
  memoryProjects.clear();
  memoryExperiments.clear();
  try {
    await db.projects.clear();
    await db.experiments.clear();
  } catch (err) {
    markFallbackWarning(err);
  }
}

export function loadPreferences(): UserPreferences {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFERENCES };
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      visMode:
        parsed.visMode === 'reduced_motion' ||
        parsed.visMode === 'high_speed' ||
        parsed.visMode === 'headless'
          ? parsed.visMode
          : 'normal',
      snapToGrid: typeof parsed.snapToGrid === 'boolean' ? parsed.snapToGrid : true,
      tutorialDismissed:
        typeof parsed.tutorialDismissed === 'boolean' ? parsed.tutorialDismissed : false,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: UserPreferences): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    }
  } catch {
    // Ignore restricted storage errors gracefully
  }
}
