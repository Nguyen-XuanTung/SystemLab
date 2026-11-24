# ADR-004: Directed Acyclic Graph (DAG) Topology with Local Bounded Retries

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
Arbitrary cyclic graphs allow infinite request forwarding loops with zero or low latency, which are ambiguous to route and dangerous to browser stability.

## Decision
Require primary request-forwarding edges to form a Directed Acyclic Graph (DAG), verified via Kahn's topological algorithm before simulation starts. Bounded retry semantics are modeled locally inside `app_server` (`maxRetries`, `retryDelayMs`) rather than cyclic edges.

## Alternatives Considered
- **Allow arbitrary directed cycles with hop TTL:** Supports visual feedback arrows, but obscures routing semantics and frequently creates accidental infinite loops for learners.

## Trade-offs
- **Pros:** Guarantees bounded downstream propagation, clear visual left-to-right data flow, and clean cycle error reporting.
- **Cons:** Users modeling retry loops configure retries on the node rather than drawing backward edges.
