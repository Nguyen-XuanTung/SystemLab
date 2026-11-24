import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app/App';
import { clearAllLocalData } from '@/features/persistence/repository';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

describe('Workspace Critical User Flows (Integration)', () => {
  beforeEach(async () => {
    await clearAllLocalData();
    useSimulationStore.getState().reset();
    useWorkspaceStore.getState().loadScenario('scenario-01-hello-system-design');
    useWorkspaceStore.getState().dismissTutorial(true);
    useWorkspaceStore.getState().setActiveView('workspace');
  });

  it('loads scenario, runs simulation headless, displays real metrics, and navigates views', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Verify scenario loaded cleanly and Run button is enabled
    const runBtn = screen.getByRole('button', { name: /run simulation/i });
    expect(runBtn).toBeEnabled();

    // Switch speed to Fast-Run so simulation finishes deterministically in ms inside test
    const speedSelect = screen.getByLabelText(/playback speed/i);
    await user.selectOptions(speedSelect, '100');

    await user.click(runBtn);

    await waitFor(
      () => {
        expect(screen.getByText(/Conservation: 300 = 300 \+ 0 \+ 0 \+ 0/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Save snapshot into Experiment Studio
    await user.click(screen.getByRole('tab', { name: /experiments/i }));
    const expInput = screen.getByLabelText(/experiment snapshot name/i);
    await user.type(expInput, 'Integration Baseline');
    await user.click(screen.getByRole('button', { name: /save snapshot/i }));

    await waitFor(() => {
      expect(screen.getByText('Integration Baseline')).toBeInTheDocument();
    });

    // Navigate to Scenarios and Glossary views cleanly
    await user.click(screen.getAllByRole('button', { name: /^Scenarios$/i })[0]!);
    expect(screen.getByText('Built-in Scenario Library')).toBeInTheDocument();
    expect(screen.getByText('Server Failure & Recovery')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^Glossary$/i })[0]!);
    expect(screen.getByText('System Design Glossary')).toBeInTheDocument();
  });

  it('surfaces blocking graph validation errors when project has no client traffic source', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.getState().newBlankProject();
    render(<App />);

    const runBtn = screen.getByRole('button', { name: /run simulation/i });
    expect(runBtn).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /graph validation status/i }));
    expect(screen.getByText(/architecture canvas is empty/i)).toBeInTheDocument();
  });
});
