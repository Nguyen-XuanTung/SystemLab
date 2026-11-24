# Known Limitations & Model Simplifications — SystemLab

SystemLab prioritizes engineering clarity, determinism, and educational intuition over full production infrastructure emulation. Users and reviewers should keep these explicit boundaries in mind:

1. **Not a Production Capacity Planner:** Do not use SystemLab latencies or saturation thresholds to size real cloud clusters or replace real load-testing tools (such as k6, Locust, or production benchmarks).
2. **DAG Topology Requirement:** Primary request-forwarding edges must form a Directed Acyclic Graph (DAG). Cyclic graphs are rejected by `validateGraph()` to prevent ambiguous routing and runaway zero-time loops. Bounded retry loops are modeled locally inside `Application Server` (`maxRetries`, `retryDelayMs`).
3. **Probabilistic Cache Model:** `Cache` evaluates reads via a seeded Bernoulli trial against `hitProbability` (with optional linear cold-start warmup). It does **not** simulate individual cache keys, working-set memory limits, LRU/LFU eviction, or per-key TTL expiration.
4. **Open-Loop Traffic Generation:** Client traffic generators emit arrivals according to the selected schedule regardless of downstream backlog (with optional API Gateway Token Bucket rejection), rather than closed-loop user think-time backoff.
5. **Abstract Network Links:** Connection edges apply static configured latency (plus Chaos link overrides) without modeling TCP slow-start, congestion windows, TLS handshakes, DNS lookup, or NIC packet queues.
6. **Instantaneous Health Check Awareness:** When `healthCheckEnabled` is true on a Load Balancer, it skips failed nodes immediately on `node_failure` without simulating periodic probe intervals or health-check flapping thresholds.
7. **Browser Storage Volatility:** IndexedDB persists locally on the user's browser profile and is subject to browser eviction or user site-data clearing. Export important projects and experiments as JSON files.
8. **Mobile Viewport Scope:** Full drag-and-drop canvas topology editing is designed for desktop and tablet screens (`>= 768px`); mobile screens prioritize browsing scenarios, running simulations, inspecting KPIs, and reading the glossary.
