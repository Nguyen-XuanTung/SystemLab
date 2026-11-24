# ADR-003: Web Worker Execution with Run-ID Fencing

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
Running 10,000+ request experiments on the browser main thread can cause dropped frames and unresponsive UI controls during pause/stop/fault injection.

## Decision
Execute `SimulationEngine` inside a dedicated ES module Web Worker (`src/workers/simulation.worker.ts`) managed by `WorkerClient`, with every session tagged by a monotonically increasing `runId` and an automatic main-thread fallback if `Worker` is unavailable.

## Alternatives Considered
- **Main-thread `requestAnimationFrame` chunking:** Avoids worker message serialization, but competes directly with React and SVG rendering.

## Trade-offs
- **Pros:** Keeps main thread responsive during heavy workloads; `runId` prevents stale messages from previous runs from overwriting state after reset.
- **Cons:** Snapshots must be plain structured-cloneable objects and throttled (~20 Hz) rather than streaming every raw event.
