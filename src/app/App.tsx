import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Flame,
  FlaskConical,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  ScrollText,
} from 'lucide-react';
import { ArchitectureCanvas } from '@/features/canvas/ArchitectureCanvas';
import { ExperimentsPanel } from '@/features/experiments/ExperimentsPanel';
import { ChaosLabPanel } from '@/features/fault-injection/ChaosLabPanel';
import { ChartsPanel } from '@/features/monitoring/ChartsPanel';
import { EventLogPanel } from '@/features/monitoring/EventLogPanel';
import { OverviewPanel } from '@/features/monitoring/OverviewPanel';
import { RequestTraceModal } from '@/features/monitoring/RequestTraceModal';
import { ComponentPalette } from '@/features/node-library/ComponentPalette';
import { GlossaryView } from '@/features/scenarios/GlossaryView';
import { ScenarioLibraryView } from '@/features/scenarios/ScenarioLibraryView';
import { AboutView } from '@/features/workspace/AboutView';
import { GuidedTutorial } from '@/features/workspace/GuidedTutorial';
import { PropertiesInspector } from '@/features/workspace/PropertiesInspector';
import { TopToolbar } from '@/features/workspace/TopToolbar';
import { useExperimentStore } from '@/store/experimentStore';
import { useSimulationStore } from '@/store/simulationStore';
import { type AppView, type BottomTab, useWorkspaceStore } from '@/store/workspaceStore';

export function App() {
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'palette' | 'inspector'>('none');

  const hydrateWorkspace = useWorkspaceStore((s) => s.hydrate);
  const hydrateExperiments = useExperimentStore((s) => s.hydrate);
  const setOnGraphMutatedCallback = useWorkspaceStore((s) => s.setOnGraphMutatedCallback);

  const activeView = useWorkspaceStore((s) => s.activeView);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const activeBottomTab = useWorkspaceStore((s) => s.activeBottomTab);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);
  const bottomDockSize = useWorkspaceStore((s) => s.bottomDockSize);
  const setBottomDockSize = useWorkspaceStore((s) => s.setBottomDockSize);
  const leftDockOpen = useWorkspaceStore((s) => s.leftDockOpen);
  const rightDockOpen = useWorkspaceStore((s) => s.rightDockOpen);
  const toggleLeftDock = useWorkspaceStore((s) => s.toggleLeftDock);
  const toggleRightDock = useWorkspaceStore((s) => s.toggleRightDock);
  const storageWarning = useWorkspaceStore((s) => s.storageWarning);

  const simStatus = useSimulationStore((s) => s.status);
  const errorMessage = useSimulationStore((s) => s.errorMessage);
  const workerFallbackActive = useSimulationStore((s) => s.workerFallbackActive);
  const resetSimulation = useSimulationStore((s) => s.reset);

  useEffect(() => {
    void hydrateWorkspace();
    void hydrateExperiments();
    setOnGraphMutatedCallback(() => {
      resetSimulation();
    });
    return () => {
      setOnGraphMutatedCallback(null);
    };
  }, [hydrateExperiments, hydrateWorkspace, resetSimulation, setOnGraphMutatedCallback]);

  const bottomHeightClass =
    bottomDockSize === 'collapsed'
      ? 'h-9'
      : bottomDockSize === 'expanded'
        ? 'h-[420px]'
        : 'h-[268px]';

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--sl-bg-canvas)',
        color: 'var(--sl-text-primary)',
      }}
    >
      <TopToolbar />

      {/* Mobile Navigation Strip */}
      <div
        className="flex sm:hidden items-center justify-between border-b px-2 py-1 text-xs"
        style={{
          backgroundColor: 'var(--sl-bg-surface)',
          borderColor: 'var(--sl-border-subtle)',
        }}
      >
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
            className="rounded px-2 py-1 font-medium"
            style={{
              backgroundColor: activeView === tab.id ? 'var(--sl-bg-elevated)' : 'transparent',
              color: activeView === tab.id ? 'var(--sl-text-primary)' : 'var(--sl-text-muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Diagnostic Status Banners */}
      {(storageWarning ||
        workerFallbackActive ||
        simStatus === 'halted_safety' ||
        errorMessage) && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 text-xs"
          style={{
            backgroundColor:
              simStatus === 'halted_safety' || simStatus === 'error'
                ? 'color-mix(in srgb, var(--sl-accent-danger) 12%, transparent)'
                : 'color-mix(in srgb, var(--sl-accent-warning) 10%, transparent)',
            borderColor: 'var(--sl-border-subtle)',
            color:
              simStatus === 'halted_safety' || simStatus === 'error'
                ? 'var(--sl-accent-danger)'
                : 'var(--sl-accent-warning)',
          }}
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {errorMessage ||
              storageWarning ||
              'Web Worker unavailable in this browser context; running simulation on main thread fallback.'}
          </span>
        </div>
      )}

      {activeView === 'scenarios' && (
        <div className="flex-1 min-h-0">
          <ScenarioLibraryView />
        </div>
      )}

      {activeView === 'glossary' && (
        <div className="flex-1 min-h-0">
          <GlossaryView />
        </div>
      )}

      {activeView === 'about' && (
        <div className="flex-1 min-h-0">
          <AboutView />
        </div>
      )}

      {activeView === 'workspace' && (
        <div className="flex flex-1 flex-col min-h-0">
          {/* Tablet / Mobile Drawer Toggle Bar */}
          <div
            className="flex xl:hidden items-center justify-between border-b px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--sl-bg-elevated)',
              borderColor: 'var(--sl-border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => setMobileDrawer((d) => (d === 'palette' ? 'none' : 'palette'))}
              className="inline-flex items-center gap-1.5 rounded border px-2 py-1"
              style={{ borderColor: 'var(--sl-border-default)' }}
            >
              <PanelLeft className="h-3.5 w-3.5" />
              Components
            </button>
            <span
              className="hidden md:inline text-[11px]"
              style={{ color: 'var(--sl-text-muted)' }}
            >
              Full graph editing is optimized for desktop/tablet viewports
            </span>
            <button
              type="button"
              onClick={() => setMobileDrawer((d) => (d === 'inspector' ? 'none' : 'inspector'))}
              className="inline-flex items-center gap-1.5 rounded border px-2 py-1"
              style={{ borderColor: 'var(--sl-border-default)' }}
            >
              Inspector
              <PanelRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Main 3-Column IDE Region */}
          <div className="relative flex flex-1 min-h-0">
            {/* Desktop Left Component Library */}
            {leftDockOpen && (
              <div className="hidden xl:block w-56 shrink-0 min-h-0">
                <ComponentPalette />
              </div>
            )}

            {/* Mobile / Tablet Slide-over Palette */}
            {mobileDrawer === 'palette' && (
              <div className="absolute inset-y-0 left-0 z-30 w-64 shadow-xl xl:hidden">
                <ComponentPalette />
              </div>
            )}

            {/* Center Architecture Canvas */}
            <div className="relative flex-1 min-w-0 min-h-0">
              <button
                type="button"
                onClick={toggleLeftDock}
                aria-label="Toggle components panel"
                title="Toggle components panel"
                className="hidden xl:flex absolute top-3 left-3 z-10 rounded border p-1.5 hover:bg-black/15"
                style={{
                  backgroundColor: 'var(--sl-bg-surface)',
                  borderColor: 'var(--sl-border-default)',
                  color: 'var(--sl-text-secondary)',
                }}
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={toggleRightDock}
                aria-label="Toggle inspector panel"
                title="Toggle inspector panel"
                className="hidden xl:flex absolute top-3 right-3 z-10 rounded border p-1.5 hover:bg-black/15"
                style={{
                  backgroundColor: 'var(--sl-bg-surface)',
                  borderColor: 'var(--sl-border-default)',
                  color: 'var(--sl-text-secondary)',
                }}
              >
                <PanelRight className="h-3.5 w-3.5" />
              </button>

              <ReactFlowProvider>
                <ArchitectureCanvas />
              </ReactFlowProvider>
            </div>

            {/* Desktop Right Properties Inspector */}
            {rightDockOpen && (
              <div className="hidden xl:block w-80 shrink-0 min-h-0">
                <PropertiesInspector />
              </div>
            )}

            {/* Mobile / Tablet Slide-over Inspector */}
            {mobileDrawer === 'inspector' && (
              <div className="absolute inset-y-0 right-0 z-30 w-80 max-w-full shadow-xl xl:hidden">
                <PropertiesInspector />
              </div>
            )}
          </div>

          {/* Bottom Observability / Chaos Lab / Experiments Dock */}
          <section
            aria-label="Telemetry and simulation studios"
            className={`flex flex-col border-t transition-all ${bottomHeightClass}`}
            style={{
              backgroundColor: 'var(--sl-bg-surface)',
              borderColor: 'var(--sl-border-subtle)',
            }}
          >
            <Tabs.Root
              value={activeBottomTab}
              onValueChange={(val) => {
                setActiveBottomTab(val as BottomTab);
                if (bottomDockSize === 'collapsed') setBottomDockSize('normal');
              }}
              className="flex flex-1 flex-col min-h-0"
            >
              <div
                className="flex items-center justify-between border-b px-2"
                style={{ borderColor: 'var(--sl-border-subtle)' }}
              >
                <Tabs.List className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs">
                  {(
                    [
                      { id: 'overview', label: 'Overview', Icon: Activity },
                      { id: 'charts', label: 'Charts', Icon: BarChart3 },
                      { id: 'events', label: 'Event Log', Icon: ScrollText },
                      { id: 'experiments', label: 'Experiments', Icon: FlaskConical },
                      { id: 'chaos', label: 'Chaos Lab', Icon: Flame },
                    ] as const
                  ).map(({ id, label, Icon }) => (
                    <Tabs.Trigger
                      key={id}
                      value={id}
                      className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 font-medium data-[state=active]:border-[var(--sl-accent-traffic)] data-[state=active]:text-[var(--sl-text-primary)]"
                      style={{ color: 'var(--sl-text-secondary)' }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>

                <div className="flex shrink-0 items-center gap-1 pl-1">
                  <button
                    type="button"
                    onClick={() =>
                      setBottomDockSize(bottomDockSize === 'expanded' ? 'normal' : 'expanded')
                    }
                    aria-label={
                      bottomDockSize === 'expanded' ? 'Restore panel height' : 'Expand panel height'
                    }
                    className="rounded p-1 hover:bg-black/15"
                    style={{ color: 'var(--sl-text-secondary)' }}
                  >
                    {bottomDockSize === 'expanded' ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBottomDockSize(bottomDockSize === 'collapsed' ? 'normal' : 'collapsed')
                    }
                    aria-label={
                      bottomDockSize === 'collapsed'
                        ? 'Open telemetry dock'
                        : 'Collapse telemetry dock'
                    }
                    className="rounded p-1 hover:bg-black/15"
                    style={{ color: 'var(--sl-text-secondary)' }}
                  >
                    {bottomDockSize === 'collapsed' ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {bottomDockSize !== 'collapsed' && (
                <div className="flex-1 overflow-y-auto min-h-0">
                  <Tabs.Content value="overview">
                    <OverviewPanel />
                  </Tabs.Content>
                  <Tabs.Content value="charts">
                    <ChartsPanel />
                  </Tabs.Content>
                  <Tabs.Content value="events">
                    <EventLogPanel />
                  </Tabs.Content>
                  <Tabs.Content value="experiments">
                    <ExperimentsPanel />
                  </Tabs.Content>
                  <Tabs.Content value="chaos">
                    <ChaosLabPanel />
                  </Tabs.Content>
                </div>
              )}
            </Tabs.Root>
          </section>
        </div>
      )}

      <RequestTraceModal />
      <GuidedTutorial />
    </div>
  );
}
