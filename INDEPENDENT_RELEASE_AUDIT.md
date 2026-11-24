# Independent Release Audit & Final Freeze Report — SystemLab

**Audit Target:** `SystemLab` (`main` branch, baseline commit `f60aaa3`)  
**Release Candidate Version:** `v1.0.0` (`package.json` / `package-lock.json`)  
**Audit Date:** 2026-11-25  
**Host Verification Environment:** Windows 11 (`win32/x64`), Node `v24.14.0`, Playwright (`chrome` and `msedge` channels)  
**Release Decision:** **`CONDITIONAL PASS — EXTERNAL VERIFICATION PENDING`**

---

## 1. Executive Summary

An independent, end-to-end engineering audit of **SystemLab** was performed against commit `f60aaa3` across discrete-event simulation (DES) kernel correctness, Web Worker lifecycle and store state transitions, schema and JSON import hardening, WCAG UI contrast and responsive layout, multi-run kernel performance, E2E workflows, security/license hygiene, public documentation truthfulness, and fresh clean-install subpath deployment readiness.

Although commit `f60aaa3` passed its original unit smoke checks and built cleanly, the audit uncovered **18 concrete defects** across engine concurrency/epoch state, fault recovery scheduling, worker pause preservation, deep-JSON recursion protection, store/canvas usability, WCAG AA button/text contrast, misleading metric labels, outdated documentation claims, unformatted source files (`npm run format:check` failed at baseline), and narrow single-run/single-seed benchmark & E2E coverage.

All verified code, schema, UI, workflow, benchmark, test, and documentation defects have been fixed and re-verified locally, bringing the test suite to **15 files / 67 tests passing**, Playwright E2E to **4/4 flows passing on both Google Chrome and Microsoft Edge Chromium**, `npm run format:check` to **PASS**, and live `/SystemLab/` subpath serving with ES Module Web Worker execution to **PASS**. Final status is **`CONDITIONAL PASS — EXTERNAL VERIFICATION PENDING`** rather than full public `PASS` because GitHub Actions hosted CI, live GitHub Pages URL serving, cross-browser Firefox/WebKit execution (not installed locally), and owner review of `LICENSE` / pre-freeze git commit author metadata remain external gates.

---

## 2. Baseline Verification Results (Commit `f60aaa3`)

| Gate                              | Baseline Command        | Baseline Result                            | Audit Observation                                                                                                                                                                                           |
| --------------------------------- | ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint & Engine Purity            | `npm run lint`          | **PASS**                                   | 0 errors, 0 warnings                                                                                                                                                                                        |
| TypeScript Strict Check           | `npm run typecheck`     | **PASS**                                   | 0 errors                                                                                                                                                                                                    |
| Prettier Formatting               | `npm run format:check`  | **FAIL** (exit `1`)                        | 43 files failed formatting check (`src/` and `tests/`)                                                                                                                                                      |
| Unit & Integration + Coverage     | `npm run test:coverage` | **PASS** (14 files, 57/57 tests, `12.26s`) | `90.80%` stmts, `81.94%` branches, `97.44%` funcs, `94.25%` lines (`engine.ts`: `87.06%` stmts, `77.07%` branches). `vitest.config.ts` covers only `src/engine/`, `src/schemas/`, `src/features/scenarios/` |
| Benchmarks (pre-audit single run) | `npm run benchmark`     | **PASS** (seed `42` only, 1 run/case)      | 1k `13.36 ms`, 10k `82.92 ms`, 100k `729.57 ms`, 25-node `34.08 ms`, fail/rec `57.05 ms`, queue sat `35.22 ms`; single-run variability not measured                                                         |
| Production Build                  | `npm run build`         | **PASS** (`1.31s`)                         | Root build clean; live `/SystemLab/` HTTP subpath worker execution untested                                                                                                                                 |
| Browser E2E                       | `npm run test:e2e`      | **PASS** (1 smoke journey, Chrome only)    | Covered only a single script; omitted node wiring, delete, undo/redo, error recovery, project CRUD, quota fallback                                                                                          |
| Security Audit                    | `npm audit`             | **PASS** (`0` vulnerabilities)             | CI workflow `.github/workflows/ci.yml` lacked top-level least-privilege `permissions`                                                                                                                       |

---

## 3. Issues Discovered, 4. Severity & 5. Root Causes

| ID         | Area                                               | Issue Discovered                                                                                                                                                                                                                                        | Severity   | Root Cause                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AUD-01** | Engine (`engine.ts`)                               | Stale pre-trip completions corrupted `HALF_OPEN` circuit breakers; downstream `CIRCUIT_OPEN` rejections failed to propagate failure signals to upstream circuit breakers                                                                                | **High**   | Requests did not track circuit-breaker epoch (`cbEpoch`) or active breaker chain (`requestCbContexts`), and `requestLastCbError` cleared upstream notification context                                            |
| **AUD-02** | Engine (`engine.ts`)                               | In-flight `cache` hits and `message_queue` `JOB_ENQUEUED` / buffered jobs survived `node_failure` events                                                                                                                                                | **High**   | Missing `nodeEpoch` invalidation checks and `activeRequestIds` cancellation on cache/MQ nodes during node failure; buffered `mqJobs` were not drained on MQ `node_failure`                                        |
| **AUD-03** | Engine (`engine.ts`)                               | Asynchronous `message_queue` jobs stalled indefinitely when downstream `edge_failure` faults expired                                                                                                                                                    | **Medium** | `edge_failure` recovery did not resume buffered `mqJobs` awaiting capacity/forwarding (`worker` direct completion also needed queue drain)                                                                        |
| **AUD-04** | Engine (`engine.ts`)                               | `traffic_spike` expiration re-triggered deterministic bursts and double-spiked Poisson arrivals at `t=0`                                                                                                                                                | **Medium** | Fault expiration shared activation logic instead of distinguishing activation vs expiration rescheduling                                                                                                          |
| **AUD-05** | Engine (`engine.ts`)                               | Overlapping `node_failure` schedules emitted premature `NODE_RECOVERED` events; failed cache/edge hops logged future timestamps                                                                                                                         | **Medium** | Failure tracking did not guard active failure count before emitting recovery, and failed forward hops used arrival + latency without clamping to clock                                                            |
| **AUD-06** | Engine (`collector.ts`)                            | `capacity_drop` faults could exceed 100% effective worker utilization; `worker` `jobMeanLatencyMs` stayed `0`; `bucketLatencies` grew unbounded                                                                                                         | **Medium** | `busyWorkerMs` lacked `Math.min(lastActiveCount, lastEffectiveCapacity) * dt` clamping; `worker` completion didn't accumulate `totalJobLatencyMs`; bucket latency array wasn't capped at `MAX_TIME_SERIES_POINTS` |
| **AUD-07** | Worker / Store                                     | Fault recovery (`RECOVER_FAULT`) or snapshot requests while `paused` flipped UI state to `running`; `step()` failed to resume from `halted_safety`                                                                                                      | **High**   | `runner.ts` emitted `SNAPSHOT` instead of `PAUSED` while paused; `simulationStore.ts` overwrote `paused` state and blocked `step()` recovery                                                                      |
| **AUD-08** | Security (`projectSchema.ts`)                      | Deeply nested malicious JSON imports could trigger stack overflow during key sanitization; `ExperimentRecordSchema.nodeMetrics` accepted `z.any()`                                                                                                      | **High**   | `stripDangerousKeys()` lacked recursion depth bounds, and `ExperimentRecordSchema` deferred strict typing on `nodeMetrics`                                                                                        |
| **AUD-09** | Stores (`workspaceStore.ts`, `experimentStore.ts`) | Active project deletion raced with pending autosave writes; ID generation could collide under rapid mutations; Settings reset left stale experiments in memory                                                                                          | **Medium** | `deleteProjectById` did not cancel `autosaveTimer`; IDs lacked monotonic counters; `SettingsDialog` cleared IndexedDB without rehydrating `experimentStore`                                                       |
| **AUD-10** | Canvas & Toolbar UX                                | Default `addNode` `220px` spacing caused adjacent Client & App Server handles to overlap; Scenario 09 (`18s`) clipped from toolbar dropdown; Seed/Horizon missing in Settings below `1280px`                                                            | **Medium** | Insufficient horizontal node placement spacing (`220px`), static `DURATION_OPTIONS` list without custom horizon merge, and toolbar responsive hiding without Settings parity                                      |
| **AUD-11** | UI Honesty & Contrast                              | Stateless nodes (`client`, `load_balancer`, `api_gateway`, `cache`, `circuit_breaker`) showed misleading `0%` Util and empty Chart 4 bars; dark muted text and white-on-accent buttons failed WCAG AA contrast                                          | **Medium** | UI rendered capacity metrics uniformly for stateless nodes and used low-contrast CSS tokens (`--sl-text-muted` and translucent accent fills)                                                                      |
| **AUD-12** | Prettier Formatting                                | `npm run format:check` failed at baseline                                                                                                                                                                                                               | **Low**    | Pre-release edits across 43 files were committed without running Prettier                                                                                                                                         |
| **AUD-13** | CI Permissions                                     | `.github/workflows/ci.yml` omitted `permissions` and `format:check`; `deploy-pages.yml` granted `pages: write` / `id-token: write` workflow-wide                                                                                                        | **Medium** | Missing explicit least-privilege `permissions` scopes on GitHub Actions workflow/jobs                                                                                                                             |
| **AUD-14** | Validation (`validator.ts`)                        | Multiple outgoing edges from a `client` node lacked a user-visible routing warning                                                                                                                                                                      | **Low**    | Validator checked outgoing edge existence without warning on multi-edge `client` fan-out behavior                                                                                                                 |
| **AUD-15** | Test / Benchmark Rigor                             | Baseline E2E ran 1 smoke test on Chrome only; benchmark used 1 single seed (`42`) and 1 repetition without dispersion/variability metrics                                                                                                               | **Medium** | Absence of multi-seed property tests, full CRUD/quota E2E journeys, and multi-run IQR/min-max benchmark statistics                                                                                                |
| **AUD-16** | Docs & Assets                                      | Baseline `FINAL_RELEASE_REPORT.md` declared `RELEASE READY — LOCAL VERIFIED` despite failing `format:check`; `README.md` had a typo (`wall-clock wall rendering`), stale metrics, and `ROADMAP.md` referenced `v0.1.0`; screenshots needed regeneration | **Low**    | Documentation lagged final pre-freeze edits and benchmark updates                                                                                                                                                 |

---

## 6. Fixes Applied

1. **Simulation Engine (`src/engine/core/engine.ts`, `collector.ts`, `validator.ts`):**
   - Added `requestCbContexts` (`cbId`, `cbEpoch`, `isHalfOpenProbe`) and `excludeCbId` propagation in `finalizeRequest` / `notifyCircuitBreakers`.
   - Added `nodeEpoch` cancellation and `activeRequestIds` cleanup on `cache` hits and `message_queue` `JOB_ENQUEUED`, routing node failures cleanly through `handleDownstreamFailure` and draining `mqJobs` + `mqReservedSlots`.
   - Resumed buffered `mqJobs` when `edge_failure` expires or direct `worker` capacity frees.
   - Separated `traffic_spike` activation vs expiration scheduling (`Poisson` vs deterministic), prevented premature `NODE_RECOVERED` under overlapping failures, and eliminated future timestamps on failed forwarding hops.
   - Recorded `worker` `totalJobLatencyMs` (`jobMeanLatencyMs`), bounded `bucketLatencies` by `MAX_TIME_SERIES_POINTS`, clamped `busyWorkerMs` to `Math.min(lastActiveCount, lastEffectiveCapacity) * dt`, added `recordEdgeCacheHit` without double-counting traffic, and added non-blocking `MULTIPLE_OUTGOING_EDGES` warnings for multi-edge `client` nodes.
2. **Worker, Stores & Schemas (`runner.ts`, `simulationStore.ts`, `projectSchema.ts`, `workspaceStore.ts`, `experimentStore.ts`):**
   - Updated `runner.ts` and `simulationStore.ts` to preserve `paused` across `RECOVER_FAULT` / `REQUEST_SNAPSHOT` and permit `step()` from `halted_safety`.
   - Added `MAX_JSON_DEPTH = 64` guard inside `stripDangerousKeys()` and replaced `z.any()` in `ExperimentRecordSchema.nodeMetrics` with strict `NodeMetricsSchema`.
   - Added monotonic ID suffix counters (`nextId`/`nextExpId`), canceled `autosaveTimer` prior to `deleteProjectFromDb`, bounded `past` undo stack size on `redo()`, synced `useExperimentStore.getState().hydrate()` on local reset, widened `addNode` spacing to `300x180` px, and added Seed & Horizon controls in `SettingsDialog.tsx`.
3. **UI, WCAG Contrast, Metric Honesty & Responsive Polish (`tokens.css`, `format.ts`, `SystemNode.tsx`, `OverviewPanel.tsx`, `PropertiesInspector.tsx`, `ChartsPanel.tsx`, `TopToolbar.tsx`, `ArchitectureCanvas.tsx`, `App.tsx`, `ExperimentsPanel.tsx`):**
   - Raised dark `--sl-text-muted` to `#8598b0` (>5.4:1 contrast on elevated surfaces) and introduced `--sl-btn-{run,pause,primary,routing,danger}-bg` solid accessible button tokens.
   - Added `hasCapacityPool()` so capacity-less nodes display `—` instead of `0%` Util and Chart 4 excludes capacity-less bars; `worker` rows show completed/failed jobs without `0/0` `jobsEnqueued`; dynamic `durationOptions` accommodates Scenario 09 (`18s`); added `Escape`/click-outside popover dismissal, `fitView` `maxZoom: 1.15`, mobile `MiniMap` hiding, mobile tab flex fixes, and regenerated all 4 `docs/assets/*.png` screenshots.
4. **Tests, Benchmarks, CI & Release Docs:**
   - Added `tests/unit/engine/invariantsAndRegression.test.ts` (10-seed property invariants + 6 targeted engine regression tests); expanded `schemaAndSecurity.test.ts`, `persistence.test.ts`, `workerProtocol.test.ts`, and `tests/e2e/systemlab.spec.ts` (4 comprehensive E2E flows across Chrome & Edge Chromium via `PLAYWRIGHT_CHANNEL`).
   - Upgraded `scripts/benchmark.ts` to 1 warmup + 5 timed runs per workload across distinct seeds with median, min–max, IQR, `simReqPerSec`, `medianEventsPerSec`, and 20-iteration `WorkerSessionRunner` cleanup check.
   - Added least-privilege `permissions` across `.github/workflows/ci.yml` and `.github/workflows/deploy-pages.yml`; formatted with Prettier (`npm run format:check` passes); bumped version to `1.0.0`, authored `docs/RELEASE_NOTES_v1.0.0.md`, and corrected all public/verification documentation.

---

## 7. Regression Evidence

- **Engine Multi-Seed Invariants & Targeted Regressions (`tests/unit/engine/invariantsAndRegression.test.ts`):**
  - Verifies identical deterministic replays, strict conservation (`generated === succeeded + failed + timedOut + inFlight`), and `[0, horizon]` latency bounds across **10 distinct seeds** (beyond seed `42`).
  - Directly regression-tests CB `HALF_OPEN` epoch isolation (`cbEpoch`), multi-tier CB upstream propagation, in-flight cache/MQ cancellation on `node_failure`, `edge_failure` expiry resuming MQ jobs, overlapping `node_failure` recovery events, and `worker` `jobMeanLatencyMs` / capacity clamping.
- **Security & Store Regressions:**
  - `schemaAndSecurity.test.ts` verifies deep recursion JSON payload rejection (`MAX_JSON_DEPTH = 64`), prototype-pollution key stripping, strict `NodeMetricsSchema`, and invalid import rejection.
  - `persistence.test.ts` & `workerProtocol.test.ts` verify storage fallback, active project deletion timer cleanup, paused recovery snapshot preservation, and `runId` stale-message fencing.
- **Playwright E2E Regressions (`tests/e2e/systemlab.spec.ts` — 4/4 tests PASS on Chrome & Edge):**
  1. Architecture creation, node add (`300x180` non-overlapping handle wiring), validation error -> valid transition, property edit, run, node delete, undo/redo.
  2. Built-in scenario loading (including `18s` custom horizon), Run/Pause/Resume/Step/Reset, playback speed changes, Chaos Lab live fault inject & recover, Experiment save & Baseline vs Variant B comparison.
  3. JSON export/import, malformed JSON rejection, page reload workspace persistence, project create/rename/duplicate/delete CRUD, Settings reset synchronization.
  4. IndexedDB/storage failure banner fallback & Web Worker lifecycle.

---

## 8. Final Verification Results

_(Updated from the final verification sweep executed directly prior to freeze commit.)_

### 8.1 Before vs. After Verification Comparison

| Verification Gate                               | Baseline (`f60aaa3`)                                    | Post-Audit Final                                                                                            | Status               |
| ----------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| `npm run lint`                                  | PASS                                                    | PASS (0 errors, 0 warnings)                                                                                 | **PASS**             |
| `npm run format:check`                          | **FAIL** (43 files)                                     | PASS (`src/**/*.{ts,tsx,css}`, `tests/**/*.{ts,tsx}`)                                                       | **FIXED & PASS**     |
| `npm run typecheck`                             | PASS                                                    | PASS (0 errors)                                                                                             | **PASS**             |
| `npm run test:coverage`                         | 14 files, 57 tests (`90.80%` stmts / `81.94%` branches) | **15 files, 67/67 tests** (`91.43%` stmts / `82.40%` branches / `97.48%` funcs / `94.68%` lines)            | **IMPROVED & PASS**  |
| `src/engine/**/*.ts` Threshold Scope            | `engine.ts` `87.06%` stmts / `77.07%` branches          | **`91.35%` stmts / `82.62%` branches / `98.29%` funcs / `94.75%` lines** (`engine.ts`: `88.34%` / `78.05%`) | **IMPROVED & PASS**  |
| `npm run build`                                 | PASS (`1.31s`)                                          | PASS (zero TypeScript or bundler errors)                                                                    | **PASS**             |
| `npm run test:e2e` (Chrome)                     | 1 smoke test                                            | **4/4 E2E tests PASS**, 0 console/page errors                                                               | **EXPANDED & PASS**  |
| Edge Chromium E2E (`PLAYWRIGHT_CHANNEL=msedge`) | Not run                                                 | **4/4 E2E tests PASS**, 0 console/page errors                                                               | **NEW & PASS**       |
| Firefox / Safari WebKit E2E                     | Not run                                                 | **NOT RUN** (browsers not installed on host)                                                                | **EXTERNAL PENDING** |
| `npm audit`                                     | 0 vulns                                                 | **0 vulnerabilities** (`358` packages audited in clean install)                                             | **PASS**             |

> **V8 Coverage Exclusion Disclosure:** Per `vitest.config.ts`, coverage includes `src/engine/**/*.ts`, `src/schemas/**/*.ts`, and `src/features/scenarios/**/*.ts`, with pass thresholds (`lines: 85, branches: 80, functions: 85, statements: 85`) scoped to `src/engine/**/*.ts`. `src/workers/`, `src/store/`, `src/features/persistence/`, `src/lib/`, and React UI modules are excluded from coverage percentages and verified via Vitest integration tests (`workerProtocol`, `persistence`, `workspaceFlow`) and Playwright E2E tests.

### 8.2 Controlled Performance Results (`npm run benchmark`)

Measured on Windows 11 (`win32/x64`), Node `v24.14.0`, **1 warmup + 5 timed repetitions/case**, distinct deterministic seeds. _Note: `DES Throughput (events/sec)` measures kernel event processing in Node; `Virtual Workload (sim req/s)` measures model-time request density (not production HTTP RPS)._

| Workload                  | Topology           | Horizon | Seed  | Median Wall (Min–Max, IQR)                | DES Throughput | Virtual Rate      | Conserved |
| ------------------------- | ------------------ | ------- | ----- | ----------------------------------------- | -------------- | ----------------- | --------- |
| 1k requests               | 2 nodes, 1 edge    | 10s     | `42`  | **5.40 ms** (4.15–6.64, IQR 1.56)         | 703,459 ev/s   | 99.6 sim req/s    | `true`    |
| 10k requests              | 6-node 3-tier      | 10s     | `101` | **58.95 ms** (55.88–74.76, IQR 8.10)      | 1,209,870 ev/s | 1,011.2 sim req/s | `true`    |
| 100k requests (stretch)   | 6-node 3-tier      | 40s     | `202` | **709.34 ms** (524.59–914.56, IQR 155.84) | 1,023,249 ev/s | 2,506.5 sim req/s | `true`    |
| 5k requests (large graph) | 25 nodes, 43 edges | 10s     | `303` | **30.59 ms** (29.67–38.46, IQR 3.44)      | 1,331,976 ev/s | 501.9 sim req/s   | `true`    |
| Failure & recovery 10k    | 6-node 3-tier      | 10s     | `404` | **58.45 ms** (53.14–71.27, IQR 6.36)      | 1,209,309 ev/s | 1,001.6 sim req/s | `true`    |
| Queue saturation 10k      | 6-node 3-tier      | 5s      | `505` | **38.67 ms** (33.36–47.59, IQR 7.14)      | 1,137,449 ev/s | 1,990.8 sim req/s | `true`    |

- **Repeated `WorkerSessionRunner` Cleanup (`20 x 5,000` requests):** `774.53 ms` total wall time, `-6.74 MB` heap delta (V8 GC reclamation), `allConserved: true`.

### 8.3 Visual, Responsive & Subpath Clean-Install Verification

- **Responsive Viewports Inspected (Production Preview):** `1920x1080`, `1440x900`, `1366x768`, `1024x768` (plus `SettingsDialog`), and `390x844` mobile — `0` horizontal scroll overflow, readable charts, accessible solid contrast buttons, all 4 `docs/assets/*.png` screenshots regenerated.
- **Clean Install (`npm ci` in isolated temp copy of `121` deliverable files):** `npm ci` (358 audited, 0 vulns), `lint`, `format:check`, `typecheck`, `test:coverage`, default `build`, and `VITE_BASE_PATH='/SystemLab/'` build all passed.
- **Live `/SystemLab/` Subpath Serving (Chrome over static HTTP server rejecting root paths):** `11` HTTP `200` responses all within `/SystemLab/` (`/SystemLab/`, `./logo.svg`, `./favicon.svg`, `/SystemLab/assets/simulation.worker-*.js`), `0` 4xx/5xx responses, `0` console/page errors, `0` Worker fallback banners, and Fast-Run completed with `Conservation:`.
- **Security & License Scan (`121` workspace files + full `git log --all -p`):** `0` secrets in tracked files or git history, `0` machine paths, `0` unsafe JS (`eval`, `new Function`, `dangerouslySetInnerHTML`), `0` external network requests in `src/`, `0` `Math.random()` calls in `src/engine/`, `0` `.ai-local/` tracked files; `348` installed packages scanned (`0` GPL/AGPL; permissive licenses + `2` `MPL-2.0` transitive `lightningcss` build packages).

---

## 9. Remaining Limitations

1. **Simulation Model Boundaries (`docs/KNOWN_LIMITATIONS.md`):** DAG-only forwarding (bounded local app-server retries), probabilistic cache model (no LRU/LFU/key-level eviction), open-loop traffic generation, abstract static network latencies (no TCP/TLS congestion), and instantaneous LB health checks. Educational tool, not a production load-testing or cluster-sizing oracle.
2. **External Browser Coverage Gap:** Playwright verified Google Chrome and Microsoft Edge Chromium; **Firefox and Safari WebKit are `NOT RUN`** locally because those runtimes are unavailable on this Windows host.
3. **Remote CI & GitHub Pages Untested:** `.github/workflows/ci.yml` and `.github/workflows/deploy-pages.yml` have not executed on GitHub-hosted Linux runners because no GitHub remote exists yet.
4. **Owner Pre-Push Legal/Identity Check:** `LICENSE` lists `Copyright (c) 2026 Nguyen Xuan Tung` and existing pre-freeze git commits contain the owner's local git author identity; the repository owner should confirm copyright attribution and author metadata preferences prior to pushing publicly.

---

## 10. Release Decision

**Decision: `CONDITIONAL PASS — EXTERNAL VERIFICATION PENDING`**

All local code, simulation correctness, UI, security, clean-install, `/SystemLab/` subpath Web Worker, Chrome & Edge E2E, and documentation gates pass with zero remaining local release blockers. `PASS — READY TO PUBLISH` is withheld strictly because hosted GitHub Actions CI, live GitHub Pages URL verification, non-Chromium (Firefox/WebKit) browser testing, and owner review of `LICENSE`/commit metadata can only complete during/after GitHub publication.

---

## 11. Exact Commands for GitHub Publication

```bash
# 1. Verify clean local state (after owner reviews LICENSE and SECURITY.md)
git status
git log --oneline -5

# 2. Add public GitHub remote and push main (do NOT create v1.0.0 tag yet)
git remote add origin https://github.com/<your-username>/SystemLab.git
git push -u origin main

# 3. Monitor GitHub Actions -> CI workflow (`ci.yml`) and Pages workflow (`deploy-pages.yml`)
#    Confirm Settings -> Pages -> Source is set to "GitHub Actions", then verify the live
#    https://<your-username>.github.io/SystemLab/ deployment in Chrome/Firefox/Safari.

# 4. Only AFTER remote CI and live GitHub Pages verification succeed, create & push v1.0.0 tag:
git tag -a v1.0.0 -m "Release SystemLab v1.0.0"
git push origin v1.0.0
```
