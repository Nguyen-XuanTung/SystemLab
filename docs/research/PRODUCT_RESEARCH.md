# Product & Engineering Research — SystemLab

## 1. Problem Statement

Learning distributed systems and system design suffers from a persistent gap between two extremes:

1. **Static diagramming tools** (diagrams.net / draw.io, Excalidraw, Mermaid): Useful for drawing boxes and arrows, with zero behavioral execution. A student can draw a Cache or Load Balancer without observing what happens when cache hit ratio drops to 0% or when database connection pools saturate.
2. **Production infrastructure & load-testing tools** (Docker Compose, Kubernetes, Grafana, SimPy, k6): Faithful for real workloads, but too heavy for rapid conceptual experimentation during coursework or system design interview prep, and lacking instant interactive browser-native topology feedback.

**SystemLab** targets the middle ground: a local-first, deterministic discrete-event simulation (DES) playground running directly in the browser inside a Web Worker, coupled to a developer-grade architecture graph editor, live telemetry charts, Chaos Lab fault injection, and fairness-checked experiment comparison.

---

## 2. Existing Solutions & Competitive Landscape

Evaluated against documented OSS tools and browser simulators:

| Category | Representative Tools | Strengths | Limitations Relative to SystemLab |
|---|---|---|---|
| Diagram Editors | Excalidraw, diagrams.net | Fast diagramming, zero setup | Purely static visuals; no virtual-clock request flow, queueing, or faults |
| Observability Dashboards | Grafana | Industry-standard time-series panels | Observes external telemetry; does not model or execute synthetic topologies |
| Code-First DES Frameworks | SimPy (Python), `osukhoroslov/anysystem` (Rust) | Rigorous mathematical and deterministic simulation | Require local compiler/runtime and code authoring; no interactive drag-and-drop studio |
| Container / Infrastructure Simulators | `hamidlabs/distsim` (Docker), `snonux/ds-sim` (Java GUI) | Real container networking or academic protocol teaching | Require Docker/JVM runtime; not zero-install static browser apps |
| Browser Architecture Simulators | `vijaygupta18/system-design-simulator`, `000Sushant/system-design-simulator`, `innovatorved/system-design-in-depth` | Browser accessibility and visual feedback | Vary in deterministic replay, analytical verification, chaos timelines, and request conservation guarantees |

### Naming & Namespace Check

Web searches show "SystemLab" is used descriptively across educational/tech contexts, and several browser system design simulators exist on GitHub under related names (`system-design-simulator`, `system-designer`, `ds-sim`, `distsim`).
- **Decision:** Retain **SystemLab** (`Design. Simulate. Break. Understand.`) as the working project name for this clean-room implementation, while noting in portfolio/release guides that checking GitHub/npm repository slug availability (e.g., `systemlab-sim` if needed) is recommended before public package publication.
- **Clean-room rule:** Zero source code, schemas, lessons, or visual assets are copied from external simulators; all code and documentation are authored from scratch.

---

## 3. Feature Comparison & Differentiation

| Capability | Static Diagram Tool | Code-First DES (SimPy) | SystemLab |
|---|---|---|---|
| Drag-and-drop + keyboard-accessible architecture canvas | Yes | No | Yes (`@xyflow/react` + Dagre auto-layout) |
| Virtual-clock discrete-event simulation | No | Yes | Yes (`MinHeap` + monotonic `VirtualClock`) |
| Deterministic seeded replay | N/A | Yes | Yes (`SplitMix32` -> `xoshiro128**`) |
| Request conservation invariant verification | N/A | Manual | Enforced & analytically tested |
| Fault injection & recovery timeline | No | Manual | First-class Chaos Lab (live + scheduled) |
| Experiment snapshot & fairness-checked diff | No | Manual scripts | Built-in Experiment Studio |
| Zero-backend local persistence | Partial | Files only | IndexedDB (Dexie) + versioned JSON import/export |

---

## 4. Technical Feasibility & Library Evaluation

All dependencies below were queried directly against the npm registry (`Node v24.14.0`, `npm 11.9.0`):

| Concern | Chosen Package / Pattern | Version Queried | License | Rationale |
|---|---|---|---|---|
| Build & Bundling | `vite`, `@vitejs/plugin-react` | `8.3.8`, `6.3.0` | MIT | Fast HMR, native ES Web Worker bundling, configurable subpath builds (`VITE_BASE_PATH`) |
| UI Runtime | `react`, `react-dom`, `typescript` | `19.3.1`, `~5.9.3` | MIT / Apache-2.0 | Strict TypeScript pinned `< 6.1.0` to maintain compatibility with `typescript-eslint@^8.74.0` |
| Graph Editor | `@xyflow/react`, `@dagrejs/dagre` | `13.0.3`, `3.1.3` | MIT | Mature pan/zoom/minimap/custom node & edge primitives; React 19 compatible |
| Styling & Accessible Primitives | `tailwindcss`, `@tailwindcss/vite`, `@radix-ui/*`, `lucide-react` | `4.3.5`, `1.x–2.x`, `1.79.0` | MIT / ISC | CSS-first semantic design tokens (Dark default + Light theme) and accessible dialogs/tabs/selects/switches |
| State Management | `zustand` | `5.1.0` | MIT | Fine-grained selector subscriptions prevent full-app re-renders on 20 Hz telemetry updates |
| Charts | `recharts` | `3.11.1` | MIT | Declarative SVG time-series & bar charts with explicit React 19 peer dependency support |
| Persistence & Validation | `dexie`, `zod` | `4.4.7`, `4.6.7` | Apache-2.0 / MIT | IndexedDB persistence + strict versioned runtime validation for imported JSON |
| Testing & Tooling | `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `fake-indexeddb`, `@playwright/test`, `eslint`, `typescript-eslint`, `prettier`, `tsx` | `5.1.1`, `16.3.3`, `6.2.8`, `1.65.1`, `10.15.0`, `8.74.0` | MIT / Apache-2.0 | Fast Node DES unit/analytical tests, JSdom integration tests, and local Chrome E2E verification |

---

## 5. Recommended Architecture

1. **Strict Engine Isolation (`src/engine/`):** Pure TypeScript discrete-event simulation engine with zero React, DOM, timer, or `Math.random` dependencies. Identical deterministic logic runs in Vitest, Node benchmarks, Web Workers, and main-thread fallback.
2. **Typed Worker Bridge (`src/workers/`):** Runs `SimulationEngine` off the main thread, stamps every run with a monotonic `runId` to discard stale messages after stop/reset, executes bounded batches, and emits throttled telemetry snapshots with bounded event ring buffers (`500` entries) and bounded time-series arrays (`<= 600` buckets).
3. **Explicit Model Simplifications & Boundaries:**
   - Primary request-routing topology must be a Directed Acyclic Graph (DAG); bounded retries occur locally at `app_server` nodes rather than cyclic graph edges.
   - Cache modeling uses an explicit **probabilistic hit rate** (with optional cold-start linear warmup curve), NOT stateful key-level LRU/LFU eviction.
   - Network edges model static propagation delay (plus fault overrides), NOT TCP congestion control, TLS handshakes, or NIC packet queues.
   - Utilization reflects `busyWorkerMs / availableWorkerMs` inside the simplified queuing model and must NOT be treated as production capacity planning.

---

## 6. Risk Assessment & Mitigations

- **Tailwind v4 + React Flow CSS cascade conflict:** Import `@xyflow/react/dist/style.css` carefully and verify visual layout, handles, and edges in live Chrome.
- **Unbounded memory growth under high request volume:** Bound event logs (`500`), trace history (`200`), time series (`<= 600`), latency reservoir (`50,000` samples via forked seeded Algorithm R), and enforce configurable safety ceilings (`maxEvents`, `maxZeroTimeEvents`, `maxHops`, `maxInFlight`).
- **Untrusted JSON imports:** Strip `__proto__`, `constructor`, and `prototype` keys recursively before Zod schema validation, enforce a 2 MB size cap, and reject unknown component types or schema versions.
- **Unverified external assumptions:** GitHub Actions hosted runner behavior and GitHub Pages live deployment remain unverified until pushed to a remote GitHub repository.

---

## 7. References

- `@xyflow/react` documentation: https://reactflow.dev
- Vite documentation: https://vite.dev
- Tailwind CSS v4 documentation: https://tailwindcss.com
- Vitest documentation: https://vitest.dev
- Dexie.js documentation: https://dexie.org
- Zod documentation: https://zod.dev
- SimPy discrete-event simulation concepts: https://simpy.readthedocs.io
- Little's Law and M/M/1 queueing theory fundamentals (Kleinrock, *Queueing Systems*)
