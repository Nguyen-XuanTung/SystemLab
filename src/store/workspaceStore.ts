import { create } from 'zustand';
import type { Edge, Node, NodeChangeset } from '@xyflow/react';
import type {
  ComponentType,
  NodeConfig,
  ScheduledFault,
  SimEdge,
  SimulationConfig,
  ValidationResult,
} from '@/engine/models/types';
import { COMPONENT_DEFINITIONS } from '@/engine/models/nodeRegistry';
import { validateGraph } from '@/engine/validation/validator';
import {
  clearAllLocalData,
  deleteProject as deleteProjectFromDb,
  getStorageWarning,
  listProjects,
  loadPreferences,
  savePreferences,
  saveProject,
  type ThemeMode,
  type VisualizationMode,
} from '@/features/persistence/repository';
import { BUILT_IN_SCENARIOS } from '@/features/scenarios/scenarios';
import { applyDagreLayout } from '@/lib/layout';
import {
  type PersistedNode,
  safeParseProjectJson,
  SCHEMA_VERSION,
  type SystemLabProject,
} from '@/schemas/projectSchema';
import { DEFAULT_SAFETY_LIMITS } from '@/engine/models/types';

export type AppView = 'workspace' | 'scenarios' | 'glossary' | 'about';
export type BottomTab = 'overview' | 'charts' | 'events' | 'experiments' | 'chaos';
export type BottomDockSize = 'collapsed' | 'normal' | 'expanded';

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  config: NodeConfig;
}

export interface FlowEdgeData extends Record<string, unknown> {
  latencyMs: number;
  routeType: SimEdge['routeType'];
  edgeLabel?: string;
}

export type CanvasFlowNode = Node<FlowNodeData, 'systemNode'>;
export type CanvasFlowEdge = Edge<FlowEdgeData, 'trafficEdge'>;

const MAX_UNDO_HISTORY = 50;

function toFlowNodes(nodes: readonly PersistedNode[]): CanvasFlowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'systemNode',
    position: { ...n.position },
    data: {
      label: n.label,
      config: { ...n.config },
    },
  }));
}

function toFlowEdges(edges: readonly SimEdge[]): CanvasFlowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    type: 'trafficEdge',
    source: e.source,
    target: e.target,
    data: {
      latencyMs: e.latencyMs,
      routeType: e.routeType,
      edgeLabel: e.label,
    },
  }));
}

function computeValidation(project: SystemLabProject): ValidationResult {
  return validateGraph(
    {
      nodes: project.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        config: n.config,
      })),
      edges: project.edges,
    },
    project.simConfig,
  );
}

function applyThemeToDom(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  if (theme === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function createInitialProject(): SystemLabProject {
  return BUILT_IN_SCENARIOS[0]!.createProject();
}

const initialPrefs = loadPreferences();
applyThemeToDom(initialPrefs.theme);
const initialProject = createInitialProject();

export interface WorkspaceState {
  project: SystemLabProject;
  projects: SystemLabProject[];
  rfNodes: CanvasFlowNode[];
  rfEdges: CanvasFlowEdge[];
  validation: ValidationResult;
  past: SystemLabProject[];
  future: SystemLabProject[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  saveStatus: 'saved' | 'saving' | 'dirty';
  storageWarning: string | null;
  hydrated: boolean;

  // UI state & preferences
  theme: ThemeMode;
  visMode: VisualizationMode;
  snapToGrid: boolean;
  tutorialDismissed: boolean;
  tutorialStep: number;
  activeView: AppView;
  activeBottomTab: BottomTab;
  bottomDockSize: BottomDockSize;
  leftDockOpen: boolean;
  rightDockOpen: boolean;
  onGraphMutatedCallback: (() => void) | null;

  setOnGraphMutatedCallback: (cb: (() => void) | null) => void;
  hydrate: () => Promise<void>;
  setActiveView: (view: AppView) => void;
  setActiveBottomTab: (tab: BottomTab) => void;
  setBottomDockSize: (size: BottomDockSize) => void;
  toggleLeftDock: () => void;
  toggleRightDock: () => void;
  setTheme: (theme: ThemeMode) => void;
  setVisMode: (mode: VisualizationMode) => void;
  setSnapToGrid: (snap: boolean) => void;
  setTutorialStep: (step: number) => void;
  dismissTutorial: (dismissed: boolean) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;

  // Project management
  newBlankProject: () => void;
  loadScenario: (scenarioId: string) => void;
  openProject: (projectId: string) => Promise<void>;
  renameProject: (name: string) => void;
  duplicateCurrentProject: () => Promise<void>;
  deleteProjectById: (projectId: string) => Promise<void>;
  importProjectJson: (rawText: string) => { ok: boolean; error?: string };
  resetAllLocalStorage: () => Promise<void>;

  // Graph & simulation configuration edits
  addNode: (type: ComponentType, position?: { x: number; y: number }) => string;
  updateNodeLabel: (nodeId: string, label: string) => void;
  updateNodeConfig: (nodeId: string, config: NodeConfig) => void;
  applyRfNodeChanges: (changes: NodeChangeset<CanvasFlowNode>) => void;
  updateNodePositions: (updates: Array<{ id: string; position: { x: number; y: number } }>, recordHistory: boolean) => void;
  duplicateNode: (nodeId: string) => string | null;
  deleteNode: (nodeId: string) => void;
  addEdge: (source: string, target: string) => void;
  updateEdge: (edgeId: string, patch: Partial<Pick<SimEdge, 'latencyMs' | 'routeType' | 'label'>>) => void;
  deleteEdge: (edgeId: string) => void;
  autoLayout: () => void;
  updateSimConfig: (patch: Partial<SimulationConfig>) => void;
  addScheduledFault: (fault: Omit<ScheduledFault, 'id'>) => void;
  removeScheduledFault: (faultId: string) => void;
  undo: () => void;
  redo: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const scheduleAutosave = (proj: SystemLabProject): void => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    set({ saveStatus: 'saving' });
    autosaveTimer = setTimeout(async () => {
      await saveProject(proj);
      const list = await listProjects();
      set({
        projects: list,
        saveStatus: 'saved',
        storageWarning: getStorageWarning(),
      });
    }, 350);
  };

  const applyProjectUpdate = (
    nextProj: SystemLabProject,
    recordHistory: boolean,
    notifyGraphChanged = true,
  ): void => {
    const prev = get().project;
    const stamped: SystemLabProject = {
      ...nextProj,
      updatedAt: new Date().toISOString(),
    };
    const past = recordHistory ? [...get().past.slice(-(MAX_UNDO_HISTORY - 1)), prev] : get().past;
    const future = recordHistory ? [] : get().future;

    set({
      project: stamped,
      rfNodes: toFlowNodes(stamped.nodes),
      rfEdges: toFlowEdges(stamped.edges),
      validation: computeValidation(stamped),
      past,
      future,
      saveStatus: 'dirty',
    });
    if (notifyGraphChanged) {
      get().onGraphMutatedCallback?.();
    }
    scheduleAutosave(stamped);
  };

  const replaceActiveProject = (proj: SystemLabProject, clearHistory = true): void => {
    const clean: SystemLabProject = structuredClone(proj);
    set({
      project: clean,
      rfNodes: toFlowNodes(clean.nodes),
      rfEdges: toFlowEdges(clean.edges),
      validation: computeValidation(clean),
      past: clearHistory ? [] : get().past,
      future: clearHistory ? [] : get().future,
      selectedNodeId: clean.nodes[0]?.id ?? null,
      selectedEdgeId: null,
      activeView: 'workspace',
    });
    get().onGraphMutatedCallback?.();
    scheduleAutosave(clean);
  };

  const persistPrefs = (patch: Partial<ReturnType<typeof loadPreferences>>): void => {
    const s = get();
    savePreferences({
      theme: patch.theme ?? s.theme,
      visMode: patch.visMode ?? s.visMode,
      snapToGrid: patch.snapToGrid ?? s.snapToGrid,
      tutorialDismissed: patch.tutorialDismissed ?? s.tutorialDismissed,
    });
  };

  return {
    project: initialProject,
    projects: [initialProject],
    rfNodes: toFlowNodes(initialProject.nodes),
    rfEdges: toFlowEdges(initialProject.edges),
    validation: computeValidation(initialProject),
    past: [],
    future: [],
    selectedNodeId: initialProject.nodes[0]?.id ?? null,
    selectedEdgeId: null,
    saveStatus: 'saved',
    storageWarning: null,
    hydrated: false,

    theme: initialPrefs.theme,
    visMode: initialPrefs.visMode,
    snapToGrid: initialPrefs.snapToGrid,
    tutorialDismissed: initialPrefs.tutorialDismissed,
    tutorialStep: 0,
    activeView: 'workspace',
    activeBottomTab: 'overview',
    bottomDockSize: 'normal',
    leftDockOpen: true,
    rightDockOpen: true,
    onGraphMutatedCallback: null,

    setOnGraphMutatedCallback: (cb) => set({ onGraphMutatedCallback: cb }),

    hydrate: async () => {
      const stored = await listProjects();
      const canAdoptStored = get().saveStatus === 'saved' && !get().hydrated;
      if (stored.length > 0) {
        const latest = stored[0]!;
        if (canAdoptStored) {
          set({
            projects: stored,
            project: latest,
            rfNodes: toFlowNodes(latest.nodes),
            rfEdges: toFlowEdges(latest.edges),
            validation: computeValidation(latest),
            selectedNodeId: latest.nodes[0]?.id ?? null,
            storageWarning: getStorageWarning(),
            hydrated: true,
          });
        } else {
          set({
            projects: stored,
            storageWarning: getStorageWarning(),
            hydrated: true,
          });
        }
      } else {
        const curProj = get().project;
        await saveProject(curProj);
        const list = await listProjects();
        set({
          projects: list,
          storageWarning: getStorageWarning(),
          hydrated: true,
        });
      }
    },

    setActiveView: (view) => set({ activeView: view }),
    setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),
    setBottomDockSize: (size) => set({ bottomDockSize: size }),
    toggleLeftDock: () => set((s) => ({ leftDockOpen: !s.leftDockOpen })),
    toggleRightDock: () => set((s) => ({ rightDockOpen: !s.rightDockOpen })),

    setTheme: (theme) => {
      applyThemeToDom(theme);
      set({ theme });
      persistPrefs({ theme });
    },

    setVisMode: (visMode) => {
      set({ visMode });
      persistPrefs({ visMode });
    },

    setSnapToGrid: (snapToGrid) => {
      set({ snapToGrid });
      persistPrefs({ snapToGrid });
    },

    setTutorialStep: (tutorialStep) => set({ tutorialStep }),
    dismissTutorial: (tutorialDismissed) => {
      set({ tutorialDismissed });
      persistPrefs({ tutorialDismissed });
    },

    selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),
    selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),

    newBlankProject: () => {
      const now = new Date().toISOString();
      const blank: SystemLabProject = {
        schemaVersion: SCHEMA_VERSION,
        id: `proj-${Date.now()}`,
        name: 'Untitled Architecture',
        description: 'Custom distributed system architecture.',
        createdAt: now,
        updatedAt: now,
        simConfig: {
          seed: 42,
          durationMs: 20_000,
          drainOnEnd: true,
          maxDrainMs: 10_000,
          safetyLimits: { ...DEFAULT_SAFETY_LIMITS },
        },
        scheduledFaults: [],
        nodes: [],
        edges: [],
      };
      replaceActiveProject(blank, true);
    },

    loadScenario: (scenarioId) => {
      const found = BUILT_IN_SCENARIOS.find((s) => s.id === scenarioId);
      if (!found) return;
      const proj = found.createProject();
      proj.id = `proj-${found.id}-${Date.now()}`;
      proj.createdAt = new Date().toISOString();
      proj.updatedAt = proj.createdAt;
      replaceActiveProject(proj, true);
    },

    openProject: async (projectId) => {
      const found = get().projects.find((p) => p.id === projectId);
      if (found) {
        replaceActiveProject(found, true);
      }
    },

    renameProject: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      applyProjectUpdate({ ...get().project, name: trimmed.slice(0, 120) }, false, false);
    },

    duplicateCurrentProject: async () => {
      const cur = get().project;
      const now = new Date().toISOString();
      const copy: SystemLabProject = {
        ...structuredClone(cur),
        id: `proj-copy-${Date.now()}`,
        name: `${cur.name} (Copy)`.slice(0, 120),
        createdAt: now,
        updatedAt: now,
      };
      await saveProject(copy);
      const list = await listProjects();
      set({ projects: list });
      replaceActiveProject(copy, true);
    },

    deleteProjectById: async (projectId) => {
      await deleteProjectFromDb(projectId);
      const remaining = await listProjects();
      if (remaining.length === 0) {
        const fallback = createInitialProject();
        await saveProject(fallback);
        const list = await listProjects();
        set({ projects: list });
        replaceActiveProject(fallback, true);
      } else {
        set({ projects: remaining });
        if (get().project.id === projectId) {
          replaceActiveProject(remaining[0]!, true);
        }
      }
    },

    importProjectJson: (rawText) => {
      const res = safeParseProjectJson(rawText);
      if (!res.ok || !res.data) {
        return { ok: false, error: res.error };
      }
      const imported: SystemLabProject = {
        ...res.data,
        id: `proj-import-${Date.now()}`,
        updatedAt: new Date().toISOString(),
      };
      replaceActiveProject(imported, true);
      return { ok: true };
    },

    resetAllLocalStorage: async () => {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      await clearAllLocalData();
      const fresh = createInitialProject();
      await saveProject(fresh);
      const list = await listProjects();
      set({ projects: list, tutorialDismissed: false, tutorialStep: 0, hydrated: true });
      persistPrefs({ tutorialDismissed: false });
      replaceActiveProject(fresh, true);
    },

    addNode: (type, position) => {
      const def = COMPONENT_DEFINITIONS[type];
      const cur = get().project;
      const existingIds = new Set(cur.nodes.map((n) => n.id));
      let idx = cur.nodes.filter((n) => n.config.type === type).length + 1;
      let id = `${type}-${idx}`;
      while (existingIds.has(id)) {
        idx += 1;
        id = `${type}-${idx}`;
      }
      const pos = position ?? {
        x: 160 + (cur.nodes.length % 4) * 220,
        y: 120 + Math.floor(cur.nodes.length / 4) * 140,
      };
      const newNode: PersistedNode = {
        id,
        label: `${def.defaultLabel} ${idx}`,
        position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        config: def.defaultConfig(),
      };
      applyProjectUpdate({ ...cur, nodes: [...cur.nodes, newNode] }, true);
      set({ selectedNodeId: id, selectedEdgeId: null });
      return id;
    },

    updateNodeLabel: (nodeId, label) => {
      const cur = get().project;
      const nodes = cur.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n));
      applyProjectUpdate({ ...cur, nodes }, true, false);
    },

    updateNodeConfig: (nodeId, config) => {
      const cur = get().project;
      const nodes = cur.nodes.map((n) => (n.id === nodeId ? { ...n, config } : n));
      applyProjectUpdate({ ...cur, nodes }, true);
    },

    applyRfNodeChanges: (changes) => {
      set((s) => ({
        rfNodes: changes.applyTo(s.rfNodes),
      }));
    },

    updateNodePositions: (updates, recordHistory) => {
      const map = new Map(updates.map((u) => [u.id, u.position]));
      const cur = get().project;
      const nodes = cur.nodes.map((n) => {
        const nextPos = map.get(n.id);
        return nextPos ? { ...n, position: nextPos } : n;
      });
      applyProjectUpdate({ ...cur, nodes }, recordHistory, false);
    },

    duplicateNode: (nodeId) => {
      const cur = get().project;
      const source = cur.nodes.find((n) => n.id === nodeId);
      if (!source) return null;
      const existingIds = new Set(cur.nodes.map((n) => n.id));
      let idx = cur.nodes.length + 1;
      let nextId = `${source.config.type}-${idx}`;
      while (existingIds.has(nextId)) {
        idx += 1;
        nextId = `${source.config.type}-${idx}`;
      }
      const copy: PersistedNode = {
        id: nextId,
        label: `${source.label} Copy`,
        position: { x: source.position.x + 40, y: source.position.y + 40 },
        config: structuredClone(source.config),
      };
      applyProjectUpdate({ ...cur, nodes: [...cur.nodes, copy] }, true);
      set({ selectedNodeId: nextId, selectedEdgeId: null });
      return nextId;
    },

    deleteNode: (nodeId) => {
      const cur = get().project;
      const nodes = cur.nodes.filter((n) => n.id !== nodeId);
      const edges = cur.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      const scheduledFaults = cur.scheduledFaults.filter((f) => f.targetId !== nodeId);
      applyProjectUpdate({ ...cur, nodes, edges, scheduledFaults }, true);
      if (get().selectedNodeId === nodeId) {
        set({ selectedNodeId: null });
      }
    },

    addEdge: (source, target) => {
      if (source === target) return;
      const cur = get().project;
      const duplicate = cur.edges.some((e) => e.source === source && e.target === target);
      if (duplicate) return;

      let idx = cur.edges.length + 1;
      let id = `e-${source}-${target}-${idx}`;
      const existing = new Set(cur.edges.map((e) => e.id));
      while (existing.has(id)) {
        idx += 1;
        id = `e-${source}-${target}-${idx}`;
      }
      const edge: SimEdge = {
        id,
        source,
        target,
        latencyMs: 2,
        routeType: 'default',
        label: '2 ms',
      };
      applyProjectUpdate({ ...cur, edges: [...cur.edges, edge] }, true);
      set({ selectedEdgeId: id, selectedNodeId: null });
    },

    updateEdge: (edgeId, patch) => {
      const cur = get().project;
      const edges = cur.edges.map((e) => {
        if (e.id !== edgeId) return e;
        const nextLatency = patch.latencyMs ?? e.latencyMs;
        const nextRoute = patch.routeType ?? e.routeType;
        const autoLabel =
          nextRoute === 'default'
            ? `${nextLatency} ms`
            : `${nextRoute.toUpperCase()} · ${nextLatency} ms`;
        return {
          ...e,
          ...patch,
          label: patch.label !== undefined ? patch.label : autoLabel,
        };
      });
      applyProjectUpdate({ ...cur, edges }, true);
    },

    deleteEdge: (edgeId) => {
      const cur = get().project;
      const edges = cur.edges.filter((e) => e.id !== edgeId);
      const scheduledFaults = cur.scheduledFaults.filter((f) => f.targetId !== edgeId);
      applyProjectUpdate({ ...cur, edges, scheduledFaults }, true);
      if (get().selectedEdgeId === edgeId) {
        set({ selectedEdgeId: null });
      }
    },

    autoLayout: () => {
      const cur = get().project;
      if (cur.nodes.length === 0) return;
      const laidOut = applyDagreLayout(cur.nodes, cur.edges);
      applyProjectUpdate({ ...cur, nodes: laidOut }, true, false);
    },

    updateSimConfig: (patch) => {
      const cur = get().project;
      applyProjectUpdate(
        {
          ...cur,
          simConfig: { ...cur.simConfig, ...patch },
        },
        false,
      );
    },

    addScheduledFault: (fault) => {
      const cur = get().project;
      const id = `fault-${Date.now()}-${cur.scheduledFaults.length + 1}`;
      applyProjectUpdate(
        {
          ...cur,
          scheduledFaults: [...cur.scheduledFaults, { ...fault, id }],
        },
        true,
      );
    },

    removeScheduledFault: (faultId) => {
      const cur = get().project;
      applyProjectUpdate(
        {
          ...cur,
          scheduledFaults: cur.scheduledFaults.filter((f) => f.id !== faultId),
        },
        true,
      );
    },

    undo: () => {
      const { past, future, project } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1]!;
      set({
        project: previous,
        rfNodes: toFlowNodes(previous.nodes),
        rfEdges: toFlowEdges(previous.edges),
        validation: computeValidation(previous),
        past: past.slice(0, -1),
        future: [project, ...future.slice(0, MAX_UNDO_HISTORY - 1)],
      });
      get().onGraphMutatedCallback?.();
      scheduleAutosave(previous);
    },

    redo: () => {
      const { past, future, project } = get();
      if (future.length === 0) return;
      const next = future[0]!;
      set({
        project: next,
        rfNodes: toFlowNodes(next.nodes),
        rfEdges: toFlowEdges(next.edges),
        validation: computeValidation(next),
        past: [...past, project],
        future: future.slice(1),
      });
      get().onGraphMutatedCallback?.();
      scheduleAutosave(next);
    },
  };
});
