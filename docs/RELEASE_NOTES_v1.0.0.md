# SystemLab v1.0.0 Release Notes

**Design. Simulate. Break. Understand.**

SystemLab `v1.0.0` is a local-first, deterministic discrete-event system design and distributed systems simulation playground running entirely in the browser inside a Web Worker.

## Highlights

- **Deterministic DES Kernel (`src/engine/`):** Pure TypeScript engine (`VirtualClock`, binary `MinHeap`, `(timestampMs, priority, sequence)` tie-breaking, `SplitMix32` -> `xoshiro128**` PRNG) enforcing `generated === succeeded + failed + timedOut + inFlight` and isolating UI playback speed from simulated outcomes.
- **10 Interactive Component Models:** `Client`, `Load Balancer`, `API Gateway`, `Application Server`, `Cache (Probabilistic)`, `Primary Database`, `Message Queue`, `Background Worker`, `Circuit Breaker`, and `Read Replica`.
- **Architecture Editor & Telemetry:** `@xyflow/react` DAG canvas, Dagre auto-layout, 50-step undo/redo, live KPIs (`Mean`, `P50`, `P95`, `P99` R-7 percentiles with `—` empty states), Recharts time-series, bounded 500-event log, and hop-by-hop Request Trace dialog.
- **Chaos Lab & Experiment Studio:** Live and scheduled fault injection/recovery (`node_failure`, `latency_spike`, `capacity_drop`, `traffic_spike`, `packet_drop`, `cache_cold_start`, `edge_latency_spike`, `edge_failure`), immutable snapshot persistence in IndexedDB (Dexie), Baseline vs. Candidate deltas, and comparison fairness warnings.
- **Hardened Imports & Static Deployment:** 2 MB JSON limit, 64-level nesting depth cap, prototype-pollution key stripping, strict Zod `schemaVersion: 1` validation, and Vite subpath support (`VITE_BASE_PATH`) for GitHub Pages.

## Verification Scope Summary

- Audited and verified locally across ESLint (engine purity rules), Prettier format checks, TypeScript strict check, Vitest unit/analytical/integration coverage, controlled multi-run Node benchmarks, Playwright E2E (Google Chrome + Microsoft Edge Chromium), `npm audit` (0 vulnerabilities), and fresh `npm ci` + `/SystemLab/` subpath Web Worker serving.
- Explicit model simplifications are documented in [Known Limitations](KNOWN_LIMITATIONS.md).
- Hosted GitHub Actions execution, live GitHub Pages deployment, and Firefox/Safari WebKit E2E are external checks pending repository publication.
