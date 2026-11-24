# Changelog

All notable changes to SystemLab are documented in this file.

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
