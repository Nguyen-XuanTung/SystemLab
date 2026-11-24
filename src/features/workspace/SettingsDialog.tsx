import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import { Settings, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const simConfig = useWorkspaceStore((s) => s.project.simConfig);
  const updateSimConfig = useWorkspaceStore((s) => s.updateSimConfig);
  const resetAllLocalStorage = useWorkspaceStore((s) => s.resetAllLocalStorage);
  const simStatus = useSimulationStore((s) => s.status);
  const resetSim = useSimulationStore((s) => s.reset);
  const [confirmClear, setConfirmClear] = useState(false);

  const locked = simStatus === 'running' || simStatus === 'paused';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          aria-describedby="settings-desc"
          className="fixed top-1/2 left-1/2 z-50 w-[94vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-xl"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border-default)',
            color: 'var(--sl-text-primary)',
          }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--sl-border-subtle)' }}>
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4" />
              Simulation &amp; Storage Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close settings"
                className="rounded p-1 hover:bg-black/15"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <p id="settings-desc" className="mt-2 text-xs" style={{ color: 'var(--sl-text-muted)' }}>
            Configure virtual horizon draining, engine safety ceilings, and local browser storage.
          </p>

          <div className="mt-4 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="pr-3">
                <div className="font-medium">Drain In-Flight Requests at Horizon</div>
                <p style={{ color: 'var(--sl-text-muted)' }}>
                  Allows in-flight requests created before horizon end to finish up to Max Drain ms.
                </p>
              </div>
              <Switch.Root
                checked={simConfig.drainOnEnd}
                disabled={locked}
                aria-label="Drain in-flight requests at horizon"
                onCheckedChange={(checked) => updateSimConfig({ drainOnEnd: checked })}
                className="relative h-5 w-9 shrink-0 rounded-full border disabled:opacity-50"
                style={{
                  backgroundColor: simConfig.drainOnEnd
                    ? 'var(--sl-accent-traffic)'
                    : 'var(--sl-bg-input)',
                  borderColor: 'var(--sl-border-default)',
                }}
              >
                <Switch.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="setting-max-drain" className="block font-medium">
                  Max Drain Window (ms)
                </label>
                <input
                  id="setting-max-drain"
                  type="number"
                  disabled={locked}
                  min={0}
                  max={120000}
                  step={1000}
                  value={simConfig.maxDrainMs}
                  onChange={(e) =>
                    updateSimConfig({
                      maxDrainMs: Math.max(0, parseInt(e.target.value, 10) || 0),
                    })
                  }
                  className="mt-1 w-full rounded border px-2.5 py-1.5 font-mono-tabular disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--sl-bg-input)',
                    borderColor: 'var(--sl-border-default)',
                  }}
                />
              </div>
              <div>
                <label htmlFor="setting-max-events" className="block font-medium">
                  Max Engine Events
                </label>
                <input
                  id="setting-max-events"
                  type="number"
                  disabled={locked}
                  min={1000}
                  max={2000000}
                  step={50000}
                  value={simConfig.safetyLimits.maxEvents}
                  onChange={(e) =>
                    updateSimConfig({
                      safetyLimits: {
                        ...simConfig.safetyLimits,
                        maxEvents: Math.max(1000, parseInt(e.target.value, 10) || 500000),
                      },
                    })
                  }
                  className="mt-1 w-full rounded border px-2.5 py-1.5 font-mono-tabular disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--sl-bg-input)',
                    borderColor: 'var(--sl-border-default)',
                  }}
                />
              </div>
            </div>

            <div
              className="rounded border p-3"
              style={{
                backgroundColor: 'var(--sl-bg-elevated)',
                borderColor: 'var(--sl-border-subtle)',
              }}
            >
              <div className="font-medium">Local Browser Storage</div>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--sl-text-muted)' }}>
                Projects and experiments are stored locally in IndexedDB. IndexedDB is not a
                permanent cloud backup — export JSON files for durable backups.
              </p>
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--sl-accent-danger) 45%, transparent)',
                    color: 'var(--sl-accent-danger)',
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear Local Projects &amp; Experiments
                </button>
              ) : (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      resetSim();
                      await resetAllLocalStorage();
                      setConfirmClear(false);
                      onOpenChange(false);
                    }}
                    className="rounded px-2.5 py-1 text-xs font-medium text-white"
                    style={{ backgroundColor: 'var(--sl-accent-danger)' }}
                  >
                    Confirm Clear All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded border px-2.5 py-1 text-xs"
                    style={{ borderColor: 'var(--sl-border-default)' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
