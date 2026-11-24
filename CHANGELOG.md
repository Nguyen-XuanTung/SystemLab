# Changelog

All notable changes to SystemLab are documented in this file.

## [1.0.0] — 2026-11-25

### Fixed & Hardened (Independent Release Audit)
- **Simulation Engine:** Added circuit-breaker epoch isolation (`cbEpoch`) and multi-breaker propagation (`requestCbContexts`) so stale pre-trip completions cannot corrupt `HALF_OPEN` probes and downstream `CIRCUIT_OPEN` rejections properly notify upstream breakers; added `nodeEpoch` cancellation for in-flight `cache` hits and `message_queue` enqueues/sync-wait jobs during `node_failure`; drained buffered `message_queue` jobs on `edge_failure` expiration and direct `worker` completion; fixed `traffic_spike` expiration rescheduling, overlapping `node_failure` recovery logging, future-timestamp guards on failed forwarding, `capacity_drop` busy-time clamping, `worker` `jobMeanLatencyMs` tracking, and bounded `bucketLatencies` cleanup.
- **Worker & Stores:** Preserved `PAUSED` state when recovering faults while paused; enabled `step()` recovery from `halted_safety`; added monotonic suffix IDs and `autosaveTimer` cancellation on project delete; synced experiment store reset on local storage clear; added Seed and Horizon controls to Settings dialog for narrow viewports.
- **Schema & Security:** Enforced `MAX_JSON_DEPTH = 64` recursion limit inside `stripDangerousKeys()` and replaced loose `z.any()` in `ExperimentRecordSchema.nodeMetrics` with strict `NodeMetricsSchema`.
- **UI, Contrast & Accessibility:** Improved dark-mode muted text contrast (`#8598b0`) and added accessible solid-button color tokens; displayed `—` (and hid empty 0% bars) for capacity-less stateless components (`client`, `load_balancer`, `api_gateway`, `cache`, `circuit_breaker`); fixed dynamic custom horizon options in toolbar (e.g., Scenario 09 `18s`); widened default `addNode` placement (`300x180` px) to prevent overlapping handles; added click-outside and `Escape` dismissal for toolbar popovers.
- **Verification & Tooling:** Formatted entire codebase with Prettier (`npm run format:check`), added least-privilege `permissions` and format check to CI workflow, expanded engine multi-seed invariant & regression tests, expanded Playwright E2E suite across Chrome and Edge Chromium, and upgraded `scripts/benchmark.ts` to multi-run median/variability reporting plus repeated `WorkerSessionRunner` cleanup verification.

## [0.1.0] — 2026-11-24

### Added
- Pure TypeScript discrete-event simulation (DES) kernel (`VirtualClock`, binary `MinHeap`, deterministic `(timestamp, priority, sequence)` tie-breaking, `SplitMix32` -> `xoshiro128**` PRNG).
- 10 component models (`client`, `load_balancer`, `api_gateway`, `app_server`, `cache`, `database`, `message_queue`, `worker`, `circuit_breaker`, `read_replica`).
- Analytical verification suite (Tests A–H) and unit/integration suites exceeding 90% line / 81% branch coverage on engine & schemas.
- Interactive React Flow architecture editor with palette, Dagre auto-layout, undo/redo, snap-to-grid, context menu, and DAG validation.
- ES Module Web Worker execution (`simulation.worker.ts`) with monotonic `runId` safety and main-thread fallback.
- Real-time observability dashboard (KPIs, R-7 percentiles, Recharts time series, bounded event stream, Request Trace modal).
- Chaos Lab with manual live fault injection/recovery and scheduled virtual-time fault timelines.
- Experiment Studio with immutable snapshots, Baseline vs. Candidate comparison, and fairness checks.
- 10 built-in educational scenarios, per-component Learn documentation, 16-term Glossary, and 4-step Guided Tutorial.
- Local IndexedDB persistence via Dexie and sanitized versioned JSON import/export (`schemaVersion: 1`).
- GitHub Actions CI & GitHub Pages static deployment workflows.
