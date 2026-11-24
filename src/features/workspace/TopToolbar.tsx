import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  FilePlus2,
  Grid,
  HelpCircle,
  LayoutGrid,
  Moon,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Settings,
  Shuffle,
  SkipForward,
  Square,
  Sun,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import type { VisualizationMode } from '@/features/persistence/repository';
import { downloadJsonFile, formatVirtualClock } from '@/lib/format';
import { useSimulationStore } from '@/store/simulationStore';
import { type AppView, useWorkspaceStore } from '@/store/workspaceStore';
import { SettingsDialog } from './SettingsDialog';

const SPEED_OPTIONS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '5x', value: 5 },
  { label: '10x', value: 10 },
  { label: '25x', value: 25 },
  { label: 'Fast-Run', value: 100 },
];

const DURATION_OPTIONS = [
  { label: '5s', value: 5_000 },
  { label: '10s', value: 10_000 },
  { label: '20s', value: 20_000 },
  { label: '30s', value: 30_000 },
  { label: '60s', value: 60_000 },
  { label: '120s', value: 120_000 },
];

export function TopToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const validationMenuRef = useRef<HTMLDivElement>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectMenuOpen && !validationOpen) return;

    const handlePointerDown = (ev: MouseEvent): void => {
      const target = ev.target as Node | null;
      if (projectMenuOpen && projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setProjectMenuOpen(false);
        setConfirmDeleteId(null);
      }
      if (
        validationOpen &&
        validationMenuRef.current &&
        !validationMenuRef.current.contains(target)
      ) {
        setValidationOpen(false);
      }
    };

    const handleKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        setProjectMenuOpen(false);
        setValidationOpen(false);
        setConfirmDeleteId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectMenuOpen, validationOpen]);

  const project = useWorkspaceStore((s) => s.project);
  const projects = useWorkspaceStore((s) => s.projects);
  const validation = useWorkspaceStore((s) => s.validation);
  const saveStatus = useWorkspaceStore((s) => s.saveStatus);
  const pastCount = useWorkspaceStore((s) => s.past.length);
  const futureCount = useWorkspaceStore((s) => s.future.length);
  const activeView = useWorkspaceStore((s) => s.activeView);
  const theme = useWorkspaceStore((s) => s.theme);
  const visMode = useWorkspaceStore((s) => s.visMode);
  const snapToGrid = useWorkspaceStore((s) => s.snapToGrid);

  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const setTheme = useWorkspaceStore((s) => s.setTheme);
  const setVisMode = useWorkspaceStore((s) => s.setVisMode);
  const setSnapToGrid = useWorkspaceStore((s) => s.setSnapToGrid);
  const dismissTutorial = useWorkspaceStore((s) => s.dismissTutorial);
  const setTutorialStep = useWorkspaceStore((s) => s.setTutorialStep);
  const newBlankProject = useWorkspaceStore((s) => s.newBlankProject);
  const openProject = useWorkspaceStore((s) => s.openProject);
  const renameProject = useWorkspaceStore((s) => s.renameProject);
  const duplicateCurrentProject = useWorkspaceStore((s) => s.duplicateCurrentProject);
  const deleteProjectById = useWorkspaceStore((s) => s.deleteProjectById);
  const importProjectJson = useWorkspaceStore((s) => s.importProjectJson);
  const autoLayout = useWorkspaceStore((s) => s.autoLayout);
  const updateSimConfig = useWorkspaceStore((s) => s.updateSimConfig);
  const selectNode = useWorkspaceStore((s) => s.selectNode);
  const selectEdge = useWorkspaceStore((s) => s.selectEdge);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);

  const simStatus = useSimulationStore((s) => s.status);
  const speed = useSimulationStore((s) => s.speed);
  const virtualTimeMs = useSimulationStore((s) => s.snapshot?.virtualTimeMs ?? 0);
  const run = useSimulationStore((s) => s.run);
  const pause = useSimulationStore((s) => s.pause);
  const resume = useSimulationStore((s) => s.resume);
  const step = useSimulationStore((s) => s.step);
  const stop = useSimulationStore((s) => s.stop);
  const reset = useSimulationStore((s) => s.reset);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  const syncVisMode = useSimulationStore((s) => s.syncVisMode);

  const isRunning = simStatus === 'running';
  const isPaused = simStatus === 'paused';
  const locked = isRunning || isPaused;

  const errorCount = validation.issues.filter((i) => i.severity === 'error').length;
  const warningCount = validation.issues.filter((i) => i.severity === 'warning').length;
  const progressPct = Math.min(
    100,
    Math.max(0, (virtualTimeMs / Math.max(1, project.simConfig.durationMs)) * 100),
  );
  const durationOptions = useMemo(() => {
    const hasCurrent = DURATION_OPTIONS.some((d) => d.value === project.simConfig.durationMs);
    if (hasCurrent) return DURATION_OPTIONS;
    return [
      ...DURATION_OPTIONS,
      { label: `${project.simConfig.durationMs / 1000}s`, value: project.simConfig.durationMs },
    ].sort((a, b) => a.value - b.value);
  }, [project.simConfig.durationMs]);

  const handleImportFile = async (ev: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = importProjectJson(text);
      if (!res.ok) {
        setImportError(res.error ?? 'Failed to import project.');
      } else {
        setImportError(null);
        reset();
        setProjectMenuOpen(false);
      }
    } catch {
      setImportError('Could not read the selected file.');
    }
  };

  return (
    <header
      className="relative z-30 border-b"
      style={{
        backgroundColor: 'var(--sl-bg-surface)',
        borderColor: 'var(--sl-border-subtle)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        {/* Left: Brand + Project Menu + View Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('workspace')}
            className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-black/10"
            aria-label="SystemLab Home"
          >
            <img src="./logo.svg" alt="" className="h-6 w-6" />
            <span
              className="text-sm font-bold tracking-tight"
              style={{ color: 'var(--sl-text-primary)' }}
            >
              SystemLab
            </span>
          </button>

          {/* Project Dropdown */}
          <div ref={projectMenuRef} className="relative">
            {renaming ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  renameProject(nameDraft);
                  setRenaming(false);
                }}
              >
                <input
                  type="text"
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => {
                    renameProject(nameDraft);
                    setRenaming(false);
                  }}
                  aria-label="Project name"
                  className="w-44 rounded border px-2 py-1 text-xs"
                  style={{
                    backgroundColor: 'var(--sl-bg-input)',
                    borderColor: 'var(--sl-focus-ring)',
                    color: 'var(--sl-text-primary)',
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                aria-expanded={projectMenuOpen}
                aria-label="Project menu"
                onClick={() => {
                  setProjectMenuOpen((v) => {
                    const next = !v;
                    if (!next) setConfirmDeleteId(null);
                    return next;
                  });
                  setValidationOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--sl-bg-elevated)',
                  borderColor: 'var(--sl-border-default)',
                  color: 'var(--sl-text-primary)',
                }}
              >
                <span className="max-w-[160px] truncate">{project.name}</span>
                <span className="text-[10px]" style={{ color: 'var(--sl-text-muted)' }}>
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'dirty' ? '•' : 'Saved'}
                </span>
                <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--sl-text-muted)' }} />
              </button>
            )}

            {projectMenuOpen && (
              <div
                role="menu"
                className="absolute top-full left-0 z-40 mt-1 w-72 rounded-lg border p-2 text-xs shadow-xl"
                style={{
                  backgroundColor: 'var(--sl-bg-surface)',
                  borderColor: 'var(--sl-border-default)',
                }}
              >
                <div
                  className="grid grid-cols-2 gap-1 pb-2 border-b"
                  style={{ borderColor: 'var(--sl-border-subtle)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      newBlankProject();
                      setProjectMenuOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-black/15"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" /> New Blank
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(project.name);
                      setRenaming(true);
                      setProjectMenuOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-black/15"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await duplicateCurrentProject();
                      setProjectMenuOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-black/15"
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadJsonFile(
                        `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.systemlab.json`,
                        project,
                      );
                      setProjectMenuOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-black/15"
                  >
                    <Download className="h-3.5 w-3.5" /> Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="col-span-2 flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-black/15"
                    style={{ color: 'var(--sl-accent-traffic)' }}
                  >
                    <Upload className="h-3.5 w-3.5" /> Import Architecture JSON…
                  </button>
                </div>

                {importError && (
                  <div
                    role="alert"
                    className="mt-2 rounded border p-2 text-[11px]"
                    style={{
                      borderColor: 'var(--sl-accent-danger)',
                      color: 'var(--sl-accent-danger)',
                    }}
                  >
                    {importError}
                  </div>
                )}

                <div className="mt-2">
                  <div
                    className="px-2 pb-1 text-[11px] font-medium"
                    style={{ color: 'var(--sl-text-muted)' }}
                  >
                    Recent Projects ({projects.length})
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-0.5">
                    {projects.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-1 rounded px-2 py-1 hover:bg-black/10"
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            reset();
                            await openProject(p.id);
                            setProjectMenuOpen(false);
                          }}
                          className="flex-1 truncate text-left"
                          style={{
                            color:
                              p.id === project.id
                                ? 'var(--sl-accent-traffic)'
                                : 'var(--sl-text-primary)',
                            fontWeight: p.id === project.id ? 600 : 400,
                          }}
                        >
                          {p.name}
                        </button>
                        {confirmDeleteId === p.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              reset();
                              await deleteProjectById(p.id);
                              setConfirmDeleteId(null);
                            }}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                            style={{ backgroundColor: 'var(--sl-btn-danger-bg)' }}
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Delete ${p.name}`}
                            onClick={() => setConfirmDeleteId(p.id)}
                            className="rounded p-1 opacity-60 hover:opacity-100"
                            style={{ color: 'var(--sl-accent-danger)' }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import architecture JSON file"
              onChange={handleImportFile}
            />
          </div>

          {/* Primary Navigation */}
          <nav aria-label="Workspace views" className="hidden sm:flex items-center gap-1 pl-1">
            {(
              [
                { id: 'workspace', label: 'Workspace' },
                { id: 'scenarios', label: 'Scenarios' },
                { id: 'glossary', label: 'Glossary' },
                { id: 'about', label: 'About' },
              ] as Array<{ id: AppView; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className="rounded px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: activeView === tab.id ? 'var(--sl-bg-elevated)' : 'transparent',
                  color:
                    activeView === tab.id ? 'var(--sl-text-primary)' : 'var(--sl-text-secondary)',
                  border:
                    activeView === tab.id
                      ? '1px solid var(--sl-border-default)'
                      : '1px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Center/Right: Editor Actions + Simulation Transport */}
        <div className="flex flex-wrap items-center gap-2">
          {activeView === 'workspace' && (
            <>
              <div
                className="hidden lg:flex items-center gap-1 border-r pr-2"
                style={{ borderColor: 'var(--sl-border-subtle)' }}
              >
                <button
                  type="button"
                  disabled={locked || pastCount === 0}
                  onClick={undo}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                  className="rounded p-1.5 hover:bg-black/15 disabled:opacity-40"
                  style={{ color: 'var(--sl-text-secondary)' }}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={locked || futureCount === 0}
                  onClick={redo}
                  title="Redo (Ctrl+Y)"
                  aria-label="Redo"
                  className="rounded p-1.5 hover:bg-black/15 disabled:opacity-40"
                  style={{ color: 'var(--sl-text-secondary)' }}
                >
                  <Redo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={autoLayout}
                  title="Auto-Layout (Dagre LR)"
                  aria-label="Auto-layout architecture"
                  className="rounded p-1.5 hover:bg-black/15 disabled:opacity-40"
                  style={{ color: 'var(--sl-text-secondary)' }}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSnapToGrid(!snapToGrid)}
                  title="Toggle snap-to-grid"
                  aria-label="Toggle snap to grid"
                  aria-pressed={snapToGrid}
                  className="rounded p-1.5 hover:bg-black/15"
                  style={{
                    color: snapToGrid ? 'var(--sl-accent-traffic)' : 'var(--sl-text-muted)',
                  }}
                >
                  <Grid className="h-4 w-4" />
                </button>
              </div>

              {/* Validation Pill */}
              <div ref={validationMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setValidationOpen((v) => !v);
                    setProjectMenuOpen(false);
                    setConfirmDeleteId(null);
                  }}
                  aria-label="Graph validation status"
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium"
                  style={{
                    borderColor:
                      errorCount > 0
                        ? 'var(--sl-accent-danger)'
                        : warningCount > 0
                          ? 'var(--sl-accent-warning)'
                          : 'var(--sl-border-default)',
                    color:
                      errorCount > 0
                        ? 'var(--sl-accent-danger)'
                        : warningCount > 0
                          ? 'var(--sl-accent-warning)'
                          : 'var(--sl-accent-success)',
                  }}
                >
                  {errorCount > 0 ? (
                    <>
                      <AlertCircle className="h-3.5 w-3.5" /> {errorCount} err
                    </>
                  ) : warningCount > 0 ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" /> {warningCount} warn
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" /> Valid
                    </>
                  )}
                </button>

                {validationOpen && (
                  <div
                    className="absolute top-full right-0 z-40 mt-1 w-80 rounded-lg border p-3 text-xs shadow-xl"
                    style={{
                      backgroundColor: 'var(--sl-bg-surface)',
                      borderColor: 'var(--sl-border-default)',
                    }}
                  >
                    <div className="font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
                      Topology Validation ({validation.issues.length})
                    </div>
                    {validation.issues.length === 0 ? (
                      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                        All checks passed. Architecture is a valid simulation DAG.
                      </p>
                    ) : (
                      <div className="mt-2 max-h-56 overflow-y-auto space-y-1.5">
                        {validation.issues.map((issue) => (
                          <button
                            key={issue.id}
                            type="button"
                            onClick={() => {
                              if (issue.nodeId) selectNode(issue.nodeId);
                              else if (issue.edgeId) selectEdge(issue.edgeId);
                              setValidationOpen(false);
                            }}
                            className="flex w-full items-start gap-2 rounded border p-2 text-left text-[11px] hover:bg-black/10"
                            style={{
                              borderColor:
                                issue.severity === 'error'
                                  ? 'var(--sl-accent-danger)'
                                  : 'var(--sl-accent-warning)',
                              color:
                                issue.severity === 'error'
                                  ? 'var(--sl-accent-danger)'
                                  : 'var(--sl-accent-warning)',
                            }}
                          >
                            {issue.severity === 'error' ? (
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            )}
                            <span>{issue.message}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Simulation Transport */}
              <div
                className="flex flex-wrap items-center gap-1 rounded border px-1.5 py-1"
                style={{
                  backgroundColor: 'var(--sl-bg-elevated)',
                  borderColor: 'var(--sl-border-default)',
                }}
              >
                {!isRunning && !isPaused && (
                  <button
                    type="button"
                    disabled={!validation.valid}
                    onClick={() => run(project, visMode)}
                    aria-label="Run simulation"
                    className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    style={{ backgroundColor: 'var(--sl-btn-run-bg)' }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run
                  </button>
                )}
                {isRunning && (
                  <button
                    type="button"
                    onClick={pause}
                    aria-label="Pause simulation"
                    className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: 'var(--sl-btn-pause-bg)' }}
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </button>
                )}
                {isPaused && (
                  <button
                    type="button"
                    onClick={resume}
                    aria-label="Resume simulation"
                    className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: 'var(--sl-btn-run-bg)' }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </button>
                )}
                <button
                  type="button"
                  disabled={!validation.valid || isRunning}
                  onClick={() => step(project, visMode)}
                  title="Step 1 discrete event"
                  aria-label="Step one event"
                  className="rounded p-1.5 hover:bg-black/15 disabled:opacity-40"
                  style={{ color: 'var(--sl-text-primary)' }}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!locked}
                  onClick={stop}
                  title="Stop"
                  aria-label="Stop simulation"
                  className="rounded p-1.5 hover:bg-black/15 disabled:opacity-40"
                  style={{ color: 'var(--sl-accent-danger)' }}
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={reset}
                  title="Reset simulation metrics"
                  aria-label="Reset simulation"
                  className="rounded p-1.5 hover:bg-black/15"
                  style={{ color: 'var(--sl-text-secondary)' }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>

                <select
                  aria-label="Playback speed"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="ml-1 rounded border px-1.5 py-1 text-xs font-mono-tabular"
                  style={{
                    backgroundColor: 'var(--sl-bg-input)',
                    borderColor: 'var(--sl-border-subtle)',
                    color: 'var(--sl-text-primary)',
                  }}
                >
                  {SPEED_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <div
                  className="hidden md:flex flex-col px-2 text-[11px] font-mono-tabular"
                  aria-label="Virtual simulation clock"
                >
                  <span style={{ color: 'var(--sl-text-primary)' }}>
                    {formatVirtualClock(virtualTimeMs)} /{' '}
                    {(project.simConfig.durationMs / 1000).toFixed(0)}s
                  </span>
                  <div
                    className="mt-0.5 h-1 w-24 overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--sl-bg-input)' }}
                  >
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${progressPct}%`,
                        backgroundColor: 'var(--sl-accent-traffic)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Seed & Horizon */}
              <div className="hidden xl:flex items-center gap-1.5 text-xs">
                <label htmlFor="toolbar-seed" style={{ color: 'var(--sl-text-muted)' }}>
                  Seed
                </label>
                <input
                  id="toolbar-seed"
                  type="number"
                  disabled={locked}
                  value={project.simConfig.seed}
                  onChange={(e) =>
                    updateSimConfig({
                      seed: Math.max(0, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="w-16 rounded border px-1.5 py-1 font-mono-tabular text-xs disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--sl-bg-input)',
                    borderColor: 'var(--sl-border-default)',
                    color: 'var(--sl-text-primary)',
                  }}
                />
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => updateSimConfig({ seed: Math.floor(Math.random() * 99999) + 1 })}
                  title="Randomize seed"
                  aria-label="Randomize seed"
                  className="rounded p-1 hover:bg-black/15 disabled:opacity-40"
                  style={{ color: 'var(--sl-text-secondary)' }}
                >
                  <Shuffle className="h-3.5 w-3.5" />
                </button>
                <select
                  aria-label="Simulation duration"
                  disabled={locked}
                  value={project.simConfig.durationMs}
                  onChange={(e) => updateSimConfig({ durationMs: parseInt(e.target.value, 10) })}
                  className="rounded border px-1.5 py-1 text-xs font-mono-tabular disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--sl-bg-input)',
                    borderColor: 'var(--sl-border-default)',
                    color: 'var(--sl-text-primary)',
                  }}
                >
                  {durationOptions.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Utilities: Vis mode, Theme, Tutorial, Settings */}
          <div className="flex items-center gap-1">
            <select
              aria-label="Visualization mode"
              value={visMode}
              onChange={(e) => {
                const mode = e.target.value as VisualizationMode;
                setVisMode(mode);
                syncVisMode(mode);
              }}
              className="hidden 2xl:block rounded border px-2 py-1 text-xs"
              style={{
                backgroundColor: 'var(--sl-bg-input)',
                borderColor: 'var(--sl-border-default)',
                color: 'var(--sl-text-primary)',
              }}
            >
              <option value="normal">Visual: Normal</option>
              <option value="reduced_motion">Visual: Reduced Motion</option>
              <option value="high_speed">Visual: High-Speed</option>
              <option value="headless">Visual: Fast-Run</option>
            </select>

            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title="Toggle theme"
              className="rounded p-1.5 hover:bg-black/15"
              style={{ color: 'var(--sl-text-secondary)' }}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setTutorialStep(0);
                dismissTutorial(false);
                setActiveView('workspace');
              }}
              aria-label="Open guided tutorial"
              title="Guided tutorial"
              className="rounded p-1.5 hover:bg-black/15"
              style={{ color: 'var(--sl-text-secondary)' }}
            >
              <HelpCircle className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Simulation settings"
              title="Settings"
              className="rounded p-1.5 hover:bg-black/15"
              style={{ color: 'var(--sl-text-secondary)' }}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
