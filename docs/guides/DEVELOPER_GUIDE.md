# Developer Guide — SystemLab

## 1. Repository Layout

- `src/engine/` — Pure TypeScript DES kernel (`clock.ts`, `minHeap.ts`, `engine.ts`, `events/types.ts`, `models/types.ts`, `models/nodeRegistry.ts`, `metrics/collector.ts`, `policies/faults.ts`, `random/prng.ts`, `validation/validator.ts`).
- `src/workers/` — Typed worker protocol (`protocol.ts`), session loop (`runner.ts`), worker entrypoint (`simulation.worker.ts`), and `runId`-fenced bridge (`workerClient.ts`).
- `src/schemas/` — Zod schema validation (`projectSchema.ts`), prototype-pollution key sanitization, and snapshot builder.
- `src/store/` — Zustand stores (`workspaceStore.ts`, `simulationStore.ts`, `experimentStore.ts`).
- `src/features/` — Feature slices (`canvas`, `node-library`, `workspace`, `monitoring`, `fault-injection`, `experiments`, `scenarios`, `persistence`).
- `tests/` — Unit, analytical (`Tests A-H`), invariant, schema/security, integration, Python runner (`tests/runner/`), and Playwright E2E suites.
- `scripts/` — Single-source port config (`ports.json`, `ports.ts`), local demo runner (`run_demo.py`), screenshot generator (`capture-screenshots.mjs`), and deterministic benchmark harness (`benchmark.ts`).

### Isolated Port Policy

SystemLab enforces `strictPort: true` on `127.0.0.1`: `5200` (dev & local demo), `5201` (`npm run preview`), `5202` (Playwright E2E, `reuseExistingServer: false`). Reserved external ports (`5173`, `5174`, `15173`, `18080`, `8080`, `3307`) are rejected without silent fallback.

---

## 2. Adding a New Component Type

1. Add the config interface and union member in `src/engine/models/types.ts` (and `ComponentType`).
2. Add its registry entry (`defaultConfig`, `fields`, `education`, `accentVar`) in `src/engine/models/nodeRegistry.ts`.
3. Add validation rules in `src/engine/validation/validator.ts`.
4. Implement arrival/service/completion semantics inside `src/engine/core/engine.ts`.
5. Add its Zod config variant to `NodeConfigSchema` in `src/schemas/projectSchema.ts` and update `isKnownComponentType`.
6. Map a Lucide icon in `src/components/ui/ComponentIcon.tsx`.
7. Add dedicated unit tests in `tests/unit/engine/components.test.ts` and schema tests.

---

## 3. Running Quality Checks

```bash
npm run lint           # Must pass with zero engine purity violations
npm run format:check   # Prettier style compliance across src/ and tests/
npm run typecheck      # Strict TypeScript check
npm run test:runner    # Python unittest suite for scripts/run_demo.py
npm run test:coverage  # Runs Vitest with V8 coverage enforcement on src/engine/
npm run test:e2e       # Runs Playwright Chromium suite against isolated preview server (:5202)
npm run benchmark      # Measures wall-clock & event throughput
npm run build          # Production Vite build + tsc
```
