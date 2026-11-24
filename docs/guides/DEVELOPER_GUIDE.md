# Developer Guide — SystemLab

## 1. Repository Layout

- `src/engine/` — Pure TypeScript DES kernel (`clock.ts`, `minHeap.ts`, `engine.ts`, `events/types.ts`, `models/types.ts`, `models/nodeRegistry.ts`, `metrics/collector.ts`, `policies/faults.ts`, `random/prng.ts`, `validation/validator.ts`).
- `src/workers/` — Typed worker protocol (`protocol.ts`), session loop (`runner.ts`), worker entrypoint (`simulation.worker.ts`), and `runId`-fenced bridge (`workerClient.ts`).
- `src/schemas/` — Zod schema validation (`projectSchema.ts`), prototype-pollution key sanitization, and snapshot builder.
- `src/store/` — Zustand stores (`workspaceStore.ts`, `simulationStore.ts`, `experimentStore.ts`).
- `src/features/` — Feature slices (`canvas`, `node-library`, `workspace`, `monitoring`, `fault-injection`, `experiments`, `scenarios`, `persistence`).
- `tests/` — Unit, analytical (`Tests A-H`), schema/security, integration, and Playwright E2E suites.
- `scripts/benchmark.ts` — Reproducible CLI performance benchmark harness.

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
npm run typecheck      # Strict TypeScript check
npm run test:coverage  # Runs Vitest with V8 coverage enforcement on src/engine/
npm run test:e2e       # Runs Playwright Chrome suite against preview server
npm run benchmark      # Measures wall-clock & event throughput
npm run build          # Production Vite build + tsc
```
