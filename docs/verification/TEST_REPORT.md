# Verification & Test Report — SystemLab

**Date:** 2026-11-24  
**Environment:** Windows 11 (`win32/x64`), Node `v24.14.0`, npm `11.9.0`, local Google Chrome (Playwright)

---

## 1. Suite Execution Matrix

| Suite | Command | Result | Scope Covered |
|---|---|---|---|
| Strict TypeScript | `npm run typecheck` | **PASS** (0 errors) | `src/`, `tests/`, `scripts/`, configs |
| ESLint & Engine Purity | `npm run lint` | **PASS** (0 errors, 0 warnings) | React Hooks, TS imports, `src/engine/` purity guard |
| Unit & Analytical + Integration | `npm run test` | **PASS** (14 files, 57 / 57 tests) | Engine core, Tests A–H, 10 components, faults, validator, safety limits, R-7 metrics, schemas, Dexie persistence, worker protocol, 10 built-in scenarios, React workspace flows |
| V8 Code Coverage | `npm run test:coverage` | **PASS** (thresholds met) | `90.80%` stmts, `81.94%` branches, `97.44%` funcs, `94.25%` lines across `src/engine/`, `src/schemas/`, `src/features/scenarios/` |
| Browser E2E (Playwright) | `npm run test:e2e` | **PASS** (1 comprehensive E2E journey, 2.1s, 0 console/page errors) | Scenario load, run/pause/resume, Chaos Lab live node failure, Experiment Studio save + comparison, Recharts rendering, JSON export/import, page reload persistence, invalid graph/input blocking, theme toggle |

---

## 2. Detailed Coverage Breakdown (`vitest run --coverage`)

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `src/engine/core/clock.ts` | 100% | 100% | 100% | 100% |
| `src/engine/core/minHeap.ts` | 94.44% | 93.75% | 88.88% | 97.95% |
| `src/engine/core/engine.ts` | 87.06% | 77.07% | 98.57% | 91.28% |
| `src/engine/events/types.ts` | 100% | 100% | 100% | 100% |
| `src/engine/metrics/collector.ts` | 93.41% | 77.95% | 100% | 99.54% |
| `src/engine/models/nodeRegistry.ts` | 100% | 100% | 100% | 100% |
| `src/engine/policies/faults.ts` | 97.26% | 93.87% | 93.75% | 98.55% |
| `src/engine/random/prng.ts` | 98.52% | 96.00% | 100% | 98.41% |
| `src/engine/validation/validator.ts` | 96.41% | 92.85% | 100% | 96.84% |
| `src/features/scenarios/*.ts` | 100% | 100% | 100% | 100% |
| `src/schemas/projectSchema.ts` | 90.90% | 79.31% | 83.33% | 91.89% |
| **Aggregate** | **90.80%** | **81.94%** | **97.44%** | **94.25%** |

---

## 3. Limitations of Current Testing Scope

- Browser E2E checks ran locally against Google Chrome (`channel: 'chrome'`) over `vite preview`; cross-browser execution against Firefox and Safari WebKit was not run in this environment.
- GitHub Actions CI workflows are configured locally but have not yet executed on GitHub's hosted runners because no public remote repository has been pushed.
