# ADR-008: Deterministic Virtual-Time Fault Model and In-Flight Semantics

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
Fault injection is core to SystemLab ("Design. Simulate. Break. Understand.") and must work identically whether triggered manually during a run or scheduled on the Chaos Lab timeline.

## Decision
Model every fault (manual or scheduled) as a typed `FaultSpec` evaluated against `VirtualClock`. When a node transitions to `failed`, active in-service requests fail immediately (`NODE_FAILED`), queued requests fail immediately, `nodeEpoch` increments to invalidate stale completion events, and manual faults are recorded onto the run's fault timeline so saved experiments remain reproducible.

## Alternatives Considered
- **Fuzz global error rate randomly in UI:** Non-deterministic, bypasses queueing/routing behavior, and prevents teaching health-aware load balancing or recovery.

## Trade-offs
- **Pros:** Realistic cascading overload, accurate health-aware routing failover, and reproducible chaos experiments.
- **Cons:** Manual live faults injected at arbitrary wall-clock times depend on the virtual timestamp active when the user clicked "Inject" (mitigated by recording the exact virtual timestamp in saved experiment `faultTimeline`).
