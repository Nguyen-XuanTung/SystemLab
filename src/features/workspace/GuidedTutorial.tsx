import { ArrowRight, CheckCircle2, X } from 'lucide-react';
import { useExperimentStore } from '@/store/experimentStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const STEPS = [
  {
    title: '1. Explore or Load a Scenario',
    body: 'Start with "Hello, System Design" on the canvas, or browse Scenarios to load Caching, Database Bottleneck, Rate Limiting, or Server Failure topologies.',
    actionLabel: 'Open Scenarios',
  },
  {
    title: '2. Run the Simulation',
    body: 'Press Run (or Space) to stream virtual requests from the Client through the architecture. Watch live queue depth, latency percentiles, and utilization update.',
    actionLabel: 'Run Simulation Now',
  },
  {
    title: '3. Tune Parameters or Inject a Fault',
    body: 'Select a component on the right Inspector to adjust concurrency or hit probability, or switch to the Chaos Lab tab to crash a server and watch failover.',
    actionLabel: 'Open Chaos Lab Tab',
  },
  {
    title: '4. Save & Compare in Experiment Studio',
    body: 'Open the Experiments tab, save a Baseline snapshot, tweak one parameter with the same Seed, re-run, and compare P95 latency and throughput deltas.',
    actionLabel: 'Open Experiments Tab',
  },
];

export function GuidedTutorial() {
  const tutorialDismissed = useWorkspaceStore((s) => s.tutorialDismissed);
  const tutorialStep = useWorkspaceStore((s) => s.tutorialStep);
  const dismissTutorial = useWorkspaceStore((s) => s.dismissTutorial);
  const setTutorialStep = useWorkspaceStore((s) => s.setTutorialStep);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const setActiveBottomTab = useWorkspaceStore((s) => s.setActiveBottomTab);
  const setBottomDockSize = useWorkspaceStore((s) => s.setBottomDockSize);
  const project = useWorkspaceStore((s) => s.project);
  const visMode = useWorkspaceStore((s) => s.visMode);
  const validation = useWorkspaceStore((s) => s.validation);

  const snapshot = useSimulationStore((s) => s.snapshot);
  const run = useSimulationStore((s) => s.run);
  const expCount = useExperimentStore((s) => s.experiments.length);

  if (tutorialDismissed) return null;

  const stepMeta = STEPS[tutorialStep] ?? STEPS[0]!;
  const stepDone = [
    project.nodes.length >= 2,
    Boolean(snapshot && snapshot.global.generated > 0),
    Boolean(snapshot && (snapshot.activeFaults.length > 0 || snapshot.faultTimeline.length > 0)),
    expCount >= 2,
  ][tutorialStep];

  const handleStepAction = (): void => {
    if (tutorialStep === 0) {
      setActiveView('scenarios');
    } else if (tutorialStep === 1) {
      setActiveView('workspace');
      if (validation.valid) run(project, visMode);
    } else if (tutorialStep === 2) {
      setActiveView('workspace');
      setActiveBottomTab('chaos');
      setBottomDockSize('normal');
    } else {
      setActiveView('workspace');
      setActiveBottomTab('experiments');
      setBottomDockSize('normal');
    }
  };

  return (
    <aside
      aria-label="Guided tutorial"
      className="fixed right-4 bottom-4 z-40 w-80 rounded-lg border p-3.5 shadow-xl"
      style={{
        backgroundColor: 'var(--sl-bg-surface)',
        borderColor: 'var(--sl-accent-traffic)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="text-[11px] font-mono-tabular"
          style={{ color: 'var(--sl-accent-traffic)' }}
        >
          Quick-Start Walkthrough ({tutorialStep + 1}/{STEPS.length})
        </div>
        <button
          type="button"
          onClick={() => dismissTutorial(true)}
          aria-label="Dismiss tutorial"
          className="rounded p-0.5 hover:bg-black/15"
          style={{ color: 'var(--sl-text-muted)' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <h3
        className="mt-1 flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--sl-text-primary)' }}
      >
        {stepMeta.title}
        {stepDone && (
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--sl-accent-success)' }} />
        )}
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--sl-text-secondary)' }}>
        {stepMeta.body}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleStepAction}
          className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold text-white"
          style={{ backgroundColor: 'var(--sl-btn-primary-bg)' }}
        >
          {stepMeta.actionLabel}
          <ArrowRight className="h-3 w-3" />
        </button>

        <div className="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            disabled={tutorialStep === 0}
            onClick={() => setTutorialStep(Math.max(0, tutorialStep - 1))}
            className="rounded border px-2 py-1 disabled:opacity-40"
            style={{ borderColor: 'var(--sl-border-default)', color: 'var(--sl-text-secondary)' }}
          >
            Prev
          </button>
          {tutorialStep < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setTutorialStep(tutorialStep + 1)}
              className="rounded border px-2 py-1"
              style={{ borderColor: 'var(--sl-border-default)', color: 'var(--sl-text-primary)' }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => dismissTutorial(true)}
              className="rounded border px-2 py-1"
              style={{ borderColor: 'var(--sl-accent-success)', color: 'var(--sl-accent-success)' }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
