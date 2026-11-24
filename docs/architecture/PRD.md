# Product Requirements Document (PRD) — SystemLab

**Tagline:** Design. Simulate. Break. Understand.  
**Product Category:** Local-first interactive distributed systems & architecture simulation playground.

---

## 1. Target Audience & Value Proposition

- **Computer Science / IT Students & System Design Learners:** Experiment visually with latency, queueing, scaling, caching, rate limiting, and failures without provisioning cloud clusters.
- **Junior & Backend Engineers:** Compare trade-offs (e.g., 1 vs 3 app servers, round-robin vs least-in-flight, synchronous DB vs queue + workers) under identical seeds and workloads.
- **Educators & Interview Candidates:** Demonstrate distributed systems behavior interactively in 3–5 minutes using built-in reproducible scenarios.

### Non-Goals
- SystemLab is an **educational simulation tool**, NOT a production load generator, Kubernetes replacement, or capacity-planning oracle.
- No backend database, user login, paid cloud API, or LLM API is required to use the application.

---

## 2. Prioritized Scope

### P0 — Release Blockers (Must Ship & Verify)
1. **Pure Deterministic DES Engine:** Virtual clock, min-heap event scheduler, deterministic `(timestamp, priority, sequence)` tie-breaking, seeded PRNG (`SplitMix32` + `xoshiro128**`), safety limits (`maxEvents`, `maxZeroTimeEvents`, `maxHops`, `maxInFlight`), and request conservation invariant (`generated === succeeded + failed + timedOut + inFlight`).
2. **Mandatory + Extended Verified Components (10):** `Client / Traffic Generator`, `Load Balancer`, `API Gateway`, `Application Server`, `Cache` (explicitly documented probabilistic model), `Database`, `Message Queue`, `Background Worker`, `Circuit Breaker`, `Read Replica`.
3. **Graph Editor:** Drag-and-drop palette + click/Enter insertion, directional edges, zoom/pan/minimap/fit-view, multi-select, duplicate, delete, rename, undo/redo, keyboard shortcuts, snap-to-grid, auto-layout (Dagre), context menu, and real-time blocking/non-blocking graph validation.
4. **Web Worker Execution:** Start, pause, resume, step, stop, reset, configurable speed (`0.25x`–`25x`) + headless fast-run, throttled telemetry snapshots, `runId` race protection, and main-thread fallback.
5. **Observability Dashboard:** Global KPIs (`Mean`, `P50`, `P95`, `P99` using R-7 percentiles, showing `—` when unpopulated), per-node metrics, Recharts time-series & utilization charts, bounded filterable Event Stream, Request Trace inspection dialog, and sampled animated edge packets.
6. **Chaos Lab:** Manual live fault injection & recovery + scheduled virtual-timestamp fault timeline (`node_failure`, `latency_spike`, `capacity_drop`, `traffic_spike`, `packet_drop`, `cache_cold_start`, `edge_latency_spike`, `edge_failure`).
7. **Experiment Studio:** Immutable experiment snapshots storing architecture, seed, engine version, workload, fault schedule, summary metrics, and bounded time series; side-by-side Baseline vs Candidate comparison with automatic fairness mismatch warnings.
8. **Built-in Scenario Library & Educational Content:** 10 working scenarios (all 8 core scenarios + Circuit Breaker + Read Replica), per-component Learn tab, 16-term Glossary, and interactive 4-step Guided Tutorial.
9. **Persistence & Security:** IndexedDB workspace & experiment persistence (Dexie), autosave, project create/rename/duplicate/delete, safe versioned JSON import/export with prototype-pollution protection and size bounds.
10. **Quality & Documentation:** Unit + analytical verification (`>=85%` line / `>=80%` branch coverage on engine), integration tests, Playwright E2E tests, reproducible benchmarks, security review, static-host build (`./` and `/SystemLab/`), CI workflow, open-source docs, portfolio & Vietnamese learning package.

### P1 — High-Value Polish (Included in Scope)
- Full Dark Mode (default) and Light Mode theme support.
- Visualization modes: Normal, Reduced Motion, High-Speed, Headless Fast-Run.
- Responsive tablet workspace and streamlined mobile view for scenarios/metrics/glossary.

### P2 — Future Roadmap (Explicitly Deferred)
- Multi-user collaborative editing, cloud sync, community scenario hub, stateful LRU cache simulation, network partition matrix, production trace import.

---

## 3. Release Acceptance Criteria

- Pure TypeScript engine runs identically in Node (Vitest/benchmarks) and browser (Web Worker) with zero React/DOM dependencies.
- All 8 analytical verification tests (single server, queue formation, round-robin, cache extremes, failure & recovery, request conservation, deterministic reproducibility, saturation/M/M/1 alignment) pass.
- All 10 built-in scenarios pass graph validation and execute cleanly.
- Browser E2E checks confirm zero console/page errors across critical user journeys.
