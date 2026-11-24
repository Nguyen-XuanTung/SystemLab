# Security & Reliability Review — SystemLab

**Review Date:** 2026-11-24  
**Scope:** Static source code, import validation, browser storage, worker lifecycle, and npm dependency tree.

---

## 1. Threat Controls Verified

| Risk Area | Control Implemented | Verification |
|---|---|---|
| **Prototype Pollution on JSON Import** | `stripDangerousKeys()` recursively strips `__proto__`, `constructor`, and `prototype` keys from parsed JSON prior to Zod schema checks. | Unit tested (`tests/unit/schemas/schemaAndSecurity.test.ts`). |
| **Oversized / Malformed Imports** | `MAX_IMPORT_BYTES = 2 MB` UTF-8 size check executes before `JSON.parse`; Zod `ProjectFileV1Schema` and `ExperimentRecordSchema` enforce strict types, finite numbers, bounded node/edge counts (`<=100`/`<=300`), and referential integrity. | Unit tested across malformed JSON, unknown component types, dangling edges, and unsupported versions. |
| **Arbitrary Code Execution / XSS** | Zero uses of `eval`, `new Function`, or `dangerouslySetInnerHTML`. Imported node behavior maps strictly to typed declarative component configs. | Verified via static regex grep across `src/`, `tests/`, `scripts/`. |
| **Simulation DoS / Infinite Loops** | DAG cycle validation (`validateGraph`), `maxEvents`, `maxZeroTimeEvents`, `maxHops`, and `maxInFlight` ceilings abort pathological configs deterministically (`halted_safety`). | Verified in `tests/unit/engine/safetyLimits.test.ts`. |
| **Worker Race Conditions** | Every run increments a monotonic `runId`; `SimulationWorkerClient` drops any worker message whose `runId` differs from `activeRunId`. | Verified in `tests/integration/workerProtocol.test.ts`. |
| **Storage Failures** | `repository.ts` catches IndexedDB errors and degrades transparently to in-memory session storage while surfacing a visible backup warning banner. | Verified via try/catch fallback design and `fake-indexeddb` integration tests. |
| **Privacy & Telemetry** | Zero external analytics, zero backend API calls, zero LLM API keys, zero personal data collection. | Static inspection of network/import usage. |

---

## 2. Dependency Audit & Repository Hygiene

- **`npm audit`:** `found 0 vulnerabilities` across 356 installed packages on 2026-11-24.
- **Repository Hygiene Scan:** Zero hardcoded API keys, credentials, or local developer file paths (`C:\Users\...`) exist in `src/`, `tests/`, `scripts/`, or `docs/`.
- **Git Exclusions:** `.ai-local/` internal tracking state is excluded in both `.gitignore` and `.git/info/exclude`.
