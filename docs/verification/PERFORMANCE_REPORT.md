# Performance & Benchmark Report — SystemLab

## 1. Test Environment & Measurement Procedure

- **Host Environment:** Windows 11 (`win32/x64`), Node `v24.14.0`
- **Script:** `scripts/benchmark.ts` executed via `npm run benchmark` (`tsx scripts/benchmark.ts`)
- **Seeds Tested:** Distinct deterministic seeds across cases (`42`, `101`, `202`, `303`, `404`, `505`)
- **Procedure:** Each benchmark workload performs **1 unmeasured warmup run** followed by **5 timed repetitions**, each constructing a fresh `SimulationEngine`, timing `engine.runToCompletion()` with `perf_hooks.performance.now()`, and asserting strict logical request conservation (`generated === succeeded + failed + timedOut + inFlight`). Reported metrics explicitly separate **median wall time**, **min–max range**, **IQR**, **DES kernel throughput (`events/sec`)**, and **virtual simulated workload rate (`sim req/s`)**.
- Additionally, a 20-iteration `WorkerSessionRunner` loop (`20 x 5,000` requests) verifies repeated worker session cleanup and bounded heap retention.

---

## 2. Observed Benchmark Results (1 Warmup + 5 Timed Runs/Case)

| Benchmark Case                       | Topology           | Horizon | Seed  | Median Wall (ms) | Min–Max (ms)     | IQR (ms)  | Generated | Succeeded | Failed | Events  | Median Events/sec | Virtual Workload (sim req/s) | Conserved |
| ------------------------------------ | ------------------ | ------- | ----- | ---------------- | ---------------- | --------- | --------- | --------- | ------ | ------- | ----------------- | ---------------------------- | --------- |
| 1k requests · small 2-node           | 2 nodes, 1 edge    | 10s     | `42`  | **5.40 ms**      | 4.15–6.64 ms     | 1.56 ms   | 996       | 985       | 11     | 3,801   | 703,459           | 99.6                         | `true`    |
| 10k requests · 3-tier medium         | 6 nodes, 6 edges   | 10s     | `101` | **58.95 ms**     | 55.88–74.76 ms   | 8.10 ms   | 10,112    | 10,019    | 93     | 71,325  | 1,209,870         | 1,011.2                      | `true`    |
| 100k requests · 3-tier stretch       | 6 nodes, 6 edges   | 40s     | `202` | **709.34 ms**    | 524.59–914.56 ms | 155.84 ms | 100,259   | 99,315    | 944    | 725,836 | 1,023,249         | 2,506.5                      | `true`    |
| 25-node large topology · 5k reqs     | 25 nodes, 43 edges | 10s     | `303` | **30.59 ms**     | 29.67–38.46 ms   | 3.44 ms   | 5,019     | 5,019     | 0      | 40,743  | 1,331,976         | 501.9                        | `true`    |
| Failure & recovery · 10k reqs        | 6 nodes, 6 edges   | 10s     | `404` | **58.45 ms**     | 53.14–71.27 ms   | 6.36 ms   | 10,016    | 9,918     | 98     | 70,687  | 1,209,309         | 1,001.6                      | `true`    |
| Queue saturation overload · 10k reqs | 6 nodes, 6 edges   | 5s      | `505` | **38.67 ms**     | 33.36–47.59 ms   | 7.14 ms   | 9,954     | 2,669     | 7,285  | 43,983  | 1,137,449         | 1,990.8                      | `true`    |

**Repeated `WorkerSessionRunner` Cleanup Check (`20 x 5,000` requests):**

- `iterations`: `20`, `totalWallMs`: `774.53 ms`, `heapDeltaMb`: `-6.74 MB` (reflects V8 GC reclamation during the loop), `allConserved`: `true`.

---

## 3. Architectural Optimizations Applied

1. **O(1) Hot-Path Metrics Counters:** Initial scenario profiling showed that calling `getGlobalMetrics()` inside `step()` and `handleRequestCreated()` cloned and sorted the latency reservoir on every event ($O(E \cdot N \log N)$). Replacing those hot-path lookups with O(1) `getProcessedEventCount()` and `getInFlightCount()` eliminated quadratic overhead, sustaining ~1.0M–1.3M discrete events/sec across medium and large graphs.
2. **Finalized Request & Reservoir Memory Bounds:** Removing finalized `LogicalRequest` entries from the active lookup map (while retaining bounded `recentTraces`, `50k` latency reservoir samples, and `MAX_TIME_SERIES_POINTS`-bounded bucket latencies) keeps 100k-request runs fast with controlled memory growth.
3. **Worker Batching & Throttled Snapshots:** Browser runs execute inside `simulation.worker.ts` via `WorkerSessionRunner` in bounded slices (`<= 5,000` events live, `<= 25,000` headless), emitting telemetry snapshots at throttled intervals so React Flow and Recharts remain responsive.

---

## 4. Metric Semantics & Limitations

- `DES Throughput (events/sec)` measures in-memory TypeScript discrete-event processing speed in Node; `Virtual Workload (sim req/s)` measures simulated arrivals divided by virtual horizon time. **Neither figure represents production HTTP network RPS.**
- `scripts/benchmark.ts` runs in headless Node and excludes browser Web Worker structured-clone serialization and DOM/SVG rendering latency.
- Single-host measurements vary slightly across runs due to V8 JIT warmup and GC scheduling; min–max ranges and IQR are reported alongside medians above.
