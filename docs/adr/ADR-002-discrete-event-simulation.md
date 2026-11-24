# ADR-002: Discrete-Event Simulation (DES) Over Fixed-Tick Simulation

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
Simulating millisecond-precision request latency, timeouts, retries, queueing, and token-bucket rate limits requires accurate time resolution without wasting CPU on idle ticks or distorting event ordering.

## Decision
Implement a pure TypeScript discrete-event simulation (DES) kernel driven by a binary `MinHeap` priority queue and monotonic `VirtualClock` (`nowMs`), breaking ties deterministically by `(timestampMs, priority, sequence)`.

## Alternatives Considered
- **Fixed Time-Step Loop (e.g., 10ms ticks):** Simpler to write, but introduces quantization error for sub-10ms cache/network latencies, wastes iterations during idle gaps, and couples step granularity to accuracy.

## Trade-offs
- **Pros:** Exact sub-millisecond timing, fast execution skipping idle gaps, identical results regardless of UI playback speed.
- **Cons:** Requires strict `nodeEpoch` and terminal-state guards so stale scheduled events (e.g., after `NODE_FAILED` or `REQUEST_TIMEOUT`) cannot corrupt node capacity.
