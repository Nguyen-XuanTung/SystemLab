# Verification & Test Report — SystemLab

**Updated:** 2026-11-25  
**Environment:** Windows 11 (`win32/x64`), Node `v24.14.0`, Playwright Chromium (`chrome` and `msedge` channels)

---

## 1. Suite Execution Matrix

| Suite                                                  | Command                                      | Result                                        | Scope Covered                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strict TypeScript                                      | `npm run typecheck`                          | **PASS** (0 errors)                           | `src/`, `tests/`, `scripts/`, configs                                                                                                                                                                                                                                          |
| ESLint & Engine Purity                                 | `npm run lint`                               | **PASS** (0 errors, 0 warnings)               | React Hooks, TS imports, `src/engine/` purity guard                                                                                                                                                                                                                            |
| Prettier Formatting                                    | `npm run format:check`                       | **PASS**                                      | `src/**/*.{ts,tsx,css}`, `tests/**/*.{ts,tsx}`                                                                                                                                                                                                                                 |
| Unit, Analytical, Invariant & Integration              | `npm run test`                               | **PASS** (15 files, 69 / 69 tests)            | Engine core, Tests A–H, 10-seed property/regression invariants, 10 components, faults, validator, safety limits, R-7 metrics, schemas/JSON security, Dexie persistence + flush-on-switch, worker protocol, 14 built-in scenarios (10 core + 4 VCraft), React workspace flows   |
| Python Demo Runner Safety (`scripts/run_demo.py`)      | `npm run test:runner`                        | **PASS** (5 / 5 tests)                        | CLI validation & VCraft reserved-port rejection, CWD-independent root resolution, PID reuse / stale metadata protection, port conflict refusal, timeout cleanup, start/status/duplicate/stop/restart lifecycle                                                                 |
| V8 Code Coverage (`src/engine/` + schemas + scenarios) | `npm run test:coverage`                      | **PASS** (thresholds met)                     | `91.86%` stmts, `82.64%` branches, `98.02%` funcs, `95.07%` lines across all included files (`91.72%` stmts, `82.87%` branches, `98.29%` funcs, `95.14%` lines across `src/engine/**/*.ts`)                                                                                    |
| Browser E2E (Chrome, port `5202`)                      | `npm run test:e2e`                           | **PASS** (5 / 5 tests, 0 console/page errors) | Architecture creation/connect/edit/validation/undo-redo, simulation controls/speed/Chaos Lab faults/experiments, JSON export/import/reload persistence/project CRUD + clear reset, storage quota banner fallback + Worker lifecycle, VCraft Current vs. Scaled fair comparison |
| Browser E2E (Edge Chromium, port `5202`)               | `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` | **PASS** (5 / 5 tests, 0 console/page errors) | Full 5-test E2E suite against isolated `vite preview` (`127.0.0.1:5202`) in Edge Chromium                                                                                                                                                                                      |
| Browser E2E (Firefox / WebKit)                         | —                                            | **NOT RUN**                                   | Firefox and Safari WebKit runtimes are not installed on this local Windows machine                                                                                                                                                                                             |

---

## 2. Detailed Coverage Breakdown (`vitest run --coverage`)

> **Important scope note:** `vitest.config.ts` limits V8 coverage instrumentation to `src/engine/**/*.ts`, `src/schemas/**/*.ts`, and `src/features/scenarios/**/*.ts`, with threshold enforcement (`lines: 85`, `branches: 80`, `functions: 85`, `statements: 85`) scoped to `src/engine/**/*.ts`. `src/workers/`, `src/store/`, `src/features/persistence/`, `src/lib/`, and React UI components (`src/features/**`, `src/components/**`) are excluded from Vitest coverage metrics and verified instead via Vitest integration suites (`workerProtocol`, `persistence`, `workspaceFlow`) and Playwright E2E flows.

| Module                                              | Statements | Branches   | Functions  | Lines      |
| --------------------------------------------------- | ---------- | ---------- | ---------- | ---------- |
| `src/engine/core/clock.ts`                          | 100%       | 100%       | 100%       | 100%       |
| `src/engine/core/minHeap.ts`                        | 94.44%     | 93.75%     | 88.88%     | 97.95%     |
| `src/engine/core/engine.ts`                         | 88.98%     | 78.48%     | 98.61%     | 93.00%     |
| `src/engine/events/types.ts`                        | 100%       | 100%       | 100%       | 100%       |
| `src/engine/metrics/collector.ts`                   | 93.25%     | 79.38%     | 100%       | 98.68%     |
| `src/engine/models/nodeRegistry.ts`                 | 100%       | 100%       | 100%       | 100%       |
| `src/engine/policies/faults.ts`                     | 97.26%     | 93.87%     | 93.75%     | 98.55%     |
| `src/engine/random/prng.ts`                         | 98.52%     | 96.00%     | 100%       | 98.41%     |
| `src/engine/validation/validator.ts`                | 96.44%     | 92.99%     | 100%       | 96.89%     |
| `src/features/scenarios/*.ts`                       | 100%       | 100%       | 100%       | 100%       |
| `src/schemas/projectSchema.ts`                      | 92.94%     | 78.46%     | 91.66%     | 92.68%     |
| **Aggregate (`src/engine/` + schemas + scenarios)** | **91.86%** | **82.64%** | **98.02%** | **95.07%** |
| **`src/engine/**/*.ts` threshold scope**            | **91.72%** | **82.87%** | **98.29%** | **95.14%** |

---

## 3. Limitations of Current Testing Scope

- **Cross-browser coverage:** Playwright verified Chrome and Edge Chromium locally; Firefox and WebKit are **NOT RUN** locally because neither browser binary is installed on this host.
- **Hosted CI/Pages:** `.github/workflows/ci.yml` and `.github/workflows/deploy-pages.yml` have not yet executed on GitHub-hosted Linux runners because the repository has not been pushed to a remote.
