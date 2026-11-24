# Product & Engineering Research — SystemLab

## 1. Problem Statement

Learning distributed systems and system design suffers from a persistent gap between two extremes:

1. **Static diagramming tools** (draw.io / diagrams.net, Excalidraw, Mermaid): Great for drawing boxes and arrows, zero behavioral execution. A student can draw a Cache or Load Balancer without ever discovering what happens when cache hit ratio drops to 0% or when database connection pools saturate.
2. **Production infrastructure & load-testing tools** (Kubernetes, Docker Compose, k6, Grafana, Locust, SimPy): Accurate for real software, but too heavy for quick conceptual experimentation during study or interview preparation, and lacking instant interactive visual topology feedback in the browser.

**SystemLab** targets the middle ground: a local-first, deterministic discrete-event simulation (DES) playground running entirely in the browser inside a Web Worker, coupled to a developer-grade architecture graph editor, real-time telemetry charts, fault injection controls, and side-by-side experiment comparison.

---

## 2. Existing Solutions & Competitive Landscape

| Category | Representative Tools | Strengths | Limitations Relative to SystemLab |
|---|---|---|---|
| Diagram Editors | Excalidraw, diagrams.net (draw.io) | Fast drawing, mature export, zero setup | Purely static visuals; no traffic flow, queues, latency, or failure simulation |
| Observability Dashboards | Grafana | Industry-standard time-series visualization | Observes external telemetry; does not model or execute synthetic topologies locally |
| Code-First DES Frameworks | SimPy (Python), OMNeT++, ns-3 | Rigorous mathematical and protocol fidelity | Require local Python/C++ environments and code authoring; no drag-and-drop topology studio |
| Browser System Design Simulators | Open-source sandboxes such as `VVarrior1/systemlab`, `vijaygupta18/system-design-simulator`, `trudi-group/isds` | Combine visual graphs with simulated workloads or consensus protocols | Vary widely in reproducibility, analytical verification, chaos timelines, and zero-backend local persistence |

### Naming & Trademark Check

Web search confirmed an existing open-source Next.js repository under `github.com/VVarrior1/systemlab` that also uses the name "Systemlab" for an interactive architecture simulator. To avoid public confusion before publishing to GitHub or npm:
- **Decision:** Keep **SystemLab** as the working project name throughout this clean-room implementation (`Design. Simulate. Break. Understand.`), while explicitly noting the namespace overlap so the repository owner can either publish under a scoped repository name (e.g., `systemlab-sim` / `systemlab-playground`) or verify distinctiveness prior to public release.
- **Clean-room rule:** Zero code, visual assets, lessons, or schemas were copied from any external simulator. All code and docs in this repository are written from scratch.

---

## 3. Feature Comparison & Differentiation

| Capability | Static Diagram Tool | Code-First DES (SimPy) | SystemLab (Target Design) |
|---|---|---|---|
| Drag-and-drop architecture canvas | Yes | No | Yes (`@xyflow/react` + Dagre layout) |
| Virtual-clock discrete-event simulation | No | Yes | Yes (`MinHeap` + monotonic virtual clock) |
| Deterministic seeded replay | N/A | Yes | Yes (`SplitMix32` -> `xoshiro128**`) |
| Request conservation invariant checks | N/A | Manual | Built-in & verified analytically |
| Fault injection & recovery timeline | No | Manual | First-class Chaos Lab (manual + scheduled) |
| Experiment snapshot & fairness-checked diff | No | Manual scripts | Built-in Experiment Studio |
| Zero-backend local persistence | Partial | Files only | IndexedDB (Dexie) + versioned JSON import/export |

---

## 4. Technical Feasibility & Library Evaluation

All core dependencies were verified against npm (`Node v24.14.0`, `npm 11.9.0`):

| Concern | Chosen Package / Pattern | License | Rationale |
|---|---|---|---|
| Build & Bundling | `vite@^8.3.8`, `@vitejs/plugin-react@^6.3.0` | MIT | Fast HMR, native ES Web Worker bundling (`new Worker(new URL(..., import.meta.url), { type: 'module' })`), clean subpath static builds for GitHub Pages |
| UI Runtime | `react@^19.3.1`, `react-dom@^19.3.1`, TypeScript strict | MIT | Strong typing and component model; strict memoization keeps canvas responsive |
| Graph Editor | `@xyflow/react@^13.0.3`, `@dagrejs/dagre@^3.1.3` | MIT | Mature pan/zoom/minimap/custom node & edge primitives; CSS scoped inside `@layer base` for Tailwind v4 compatibility |
| Styling & Accessible Primitives | `tailwindcss@^4.3.5`, `@tailwindcss/vite@^4.3.5`, `@radix-ui/*`, `lucide-react@^1.79.0` | MIT | CSS-first semantic design tokens (Dark default + Light theme) and accessible dialogs/tabs/selects/switches |
| State Management | `zustand@^5.1.0` | MIT | Fine-grained selectors prevent full-app re-renders when 20 Hz telemetry updates arrive |
| Charts | `recharts@^3.11.1` | MIT | Declarative responsive SVG charts with explicit React 19 peer compatibility |
| Persistence & Validation | `dexie@^4.4.7`, `zod@^4.6.7` | Apache-2.0 / MIT | Structured IndexedDB storage + strict versioned runtime validation against unsafe/malformed JSON imports |
| Testing | `vitest@^5.1.1`, `@vitest/coverage-v8@^5.1.1`, `@testing-library/react`, `fake-indexeddb`, `@playwright/test@^1.65.1` | MIT / Apache-2.0 | Fast pure-Node DES unit/analytical tests, JSdom integration tests, and Chromium/Chrome E2E tests |

---

## 5. Recommended Architecture

1. **Strict Engine Isolation (`src/engine/`):** Pure TypeScript discrete-event simulation engine with zero React, DOM, or `Math.random` dependencies. This lets identical deterministic code run inside Vitest, Node benchmarks, Web Workers, and fallback main-thread execution.
2. **Typed Worker Bridge (`src/workers/`):** Runs `SimulationEngine` off the main thread, stamps every session with a monotonic `runId` to discard stale frames after pause/stop/reset, processes events in bounded batches, and emits throttled (~20 Hz) snapshots with bounded event ring buffers (`500` items) and bounded time-series arrays (`<= 600` buckets).
3. **Explicit Simplifications & Limitations:**
   - The graph must be a Directed Acyclic Graph (DAG) for primary request forwarding; bounded retries happen locally at `app_server` nodes rather than cyclic graph edges.
   - Cache modeling uses an explicit **probabilistic cache hit rate** (with optional cold-start warmup curve), NOT a stateful key-level LRU/LFU eviction simulator.
   - Network edges apply static configured propagation latency; packet routing does not simulate TCP congestion control, TLS handshakes, or physical NIC queues.
   - Utilization reflects `busyWorkerTime / (capacity * horizonTime)` inside the simplified queuing model and must NOT be used for production capacity sizing.

---

## 6. Risk Assessment & Mitigations

- **Tailwind v4 + React Flow CSS cascade conflict:** Import `@xyflow/react/style.css` inside `@layer base` in `src/styles/index.css`.
- **Unbounded memory growth at high RPS:** Bound event logs (`500`), time-series buckets (`<= 600`), latency reservoir (`50,000` samples via seeded Algorithm R), and hard engine event/zero-time loop ceilings.
- **Untrusted JSON imports:** Strip `__proto__`, `constructor`, and `prototype` keys before Zod schema validation, enforce a 2 MB file size ceiling, and reject unknown component types or schema versions.
- **Unverified assumptions recorded:** Exact browser rendering throughput on external user hardware and GitHub Actions CI execution on GitHub's hosted runners remain unverified until deployed to a remote repository.

---

## 7. References

- React Flow (`@xyflow/react`) official documentation: https://reactflow.dev
- Tailwind CSS v4 Vite integration guide: https://tailwindcss.com
- Dexie.js documentation: https://dexie.org
- Zod schema validation documentation: https://zod.dev
- SimPy discrete-event simulation concepts: https://simpy.readthedocs.io
- Little's Law & M/M/1 queueing fundamentals (Kleinrock, *Queueing Systems*)
