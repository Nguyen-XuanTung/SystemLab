import { ENGINE_VERSION } from '@/engine/models/types';

export function AboutView() {
  return (
    <main className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-6 text-xs leading-relaxed">
        <section
          className="rounded-lg border p-5"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border-default)',
          }}
        >
          <div className="flex items-center gap-3">
            <img src="./logo.svg" alt="SystemLab" className="h-9 w-9" />
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--sl-text-primary)' }}>
                SystemLab — Design. Simulate. Break. Understand.
              </h1>
              <p
                className="font-mono-tabular text-[11px]"
                style={{ color: 'var(--sl-text-muted)' }}
              >
                Local-First Deterministic Discrete-Event Simulator · Engine v{ENGINE_VERSION}
              </p>
            </div>
          </div>

          <p className="mt-3" style={{ color: 'var(--sl-text-secondary)' }}>
            SystemLab is an open-source, browser-native distributed systems simulation playground
            for computer science students, learners, and software engineers. Instead of drawing
            static architecture diagrams, every node executes inside a deterministic discrete-event
            simulation (DES) kernel inside a Web Worker.
          </p>
        </section>

        <section
          className="rounded-lg border p-5 space-y-2.5"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border-default)',
          }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
            Explicit Model Assumptions &amp; Limitations
          </h2>
          <ul className="list-disc pl-5 space-y-1.5" style={{ color: 'var(--sl-text-secondary)' }}>
            <li>
              <strong>Educational Simulator, Not Production Capacity Sizing:</strong> SystemLab
              demonstrates queueing, bottlenecks, backpressure, caching impact, and fault
              propagation. Do not treat simulated numbers as production load-testing or cloud
              provisioning guarantees.
            </li>
            <li>
              <strong>DAG Topology:</strong> Primary request-forwarding edges must form a Directed
              Acyclic Graph (DAG). Bounded retries are modeled locally at Application Server nodes.
            </li>
            <li>
              <strong>Probabilistic Cache Model:</strong> Cache nodes evaluate reads using a seeded
              Bernoulli trial against configured Hit Probability (with optional linear cold-start
              warmup), rather than key-level LRU/LFU eviction or TTL clocks.
            </li>
            <li>
              <strong>Network Abstraction:</strong> Edges apply static propagation latency plus
              Chaos faults; TCP congestion control, TLS handshakes, and packet fragmentation are
              omitted.
            </li>
            <li>
              <strong>Browser Storage:</strong> Projects and experiments persist locally in your
              browser’s IndexedDB. Export JSON backups for important architectures.
            </li>
          </ul>
        </section>

        <section
          className="rounded-lg border p-5 space-y-2.5"
          style={{
            backgroundColor: 'var(--sl-bg-surface)',
            borderColor: 'var(--sl-border-default)',
          }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--sl-text-primary)' }}>
            Keyboard Shortcuts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono-tabular">
            {[
              ['Space', 'Run / Pause / Resume simulation'],
              ['Ctrl / Cmd + Z', 'Undo topology edit'],
              ['Ctrl / Cmd + Y', 'Redo topology edit'],
              ['Ctrl / Cmd + D', 'Duplicate selected node'],
              ['Delete / Backspace', 'Delete selected node or edge'],
              ['F', 'Fit architecture graph to canvas'],
            ].map(([shortcut, desc]) => (
              <div
                key={shortcut}
                className="flex items-center justify-between rounded border px-3 py-2"
                style={{
                  backgroundColor: 'var(--sl-bg-elevated)',
                  borderColor: 'var(--sl-border-subtle)',
                }}
              >
                <span style={{ color: 'var(--sl-accent-traffic)' }}>{shortcut}</span>
                <span className="font-sans" style={{ color: 'var(--sl-text-secondary)' }}>
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
