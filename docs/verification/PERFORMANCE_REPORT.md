# Performance & Benchmark Report — SystemLab

## 1. Test Environment & Measurement Procedure

- **Host Environment:** Windows 11 (`win32/x64`), Node `v24.14.0`
- **Script:** `scripts/benchmark.ts` executed via `npm run benchmark` (`tsx scripts/benchmark.ts`)
- **Seeds Tested:** Distinct deterministic seeds across cases (`42`, `101`, `202`, `303`, `404`, `505`)
- **Procedure:** Each benchmark workload performs **1 unmeasured warmup run** followed by **5 timed repetitions**, each constructing a fresh `SimulationEngine`, timing `engine.runToCompletion()` with `perf_hooks.performance.now()`, and asserting exact logical request conservation (`generated === succeeded + failed + timedOut + inFlight`). Reported metrics explicitly separate **median wall time**, **min–max range**, **IQR**, **DES kernel throughput (`events/sec`)**, and **virtual simulated workload rate (`sim req/s`)**.
- Additionally, a 20-iteration `WorkerSessionRunner` loop (`20 x 5,000` requests) verifies repeated worker session cleanup and bounded heap retention.

---

## 2. Observed Benchmark Results (1 Warmup + 5 Timed Runs/Case)

| Benchmark Case                       | Topology           | Horizon | Seed  | Median Wall (ms) | Min–Max (ms)     | IQR (ms) | Generated | Succeeded | Failed | Events  | Median Events/sec | Virtual Workload (sim req/s) | Conserved |
| ------------------------------------ | ------------------ | ------- | ----- | ---------------- | ---------------- | -------- | --------- | --------- | ------ | ------- | ----------------- | ---------------------------- | --------- |
| 1k requests · small 2-node           | 2 nodes, 1 edge    | 10s     | `42`  | **3.85 ms**      | 3.51–7.60 ms     | 0.59 ms  | 996       | 985       | 11     | 3,801   | 986,606           | 99.6                         | `true`    |
| 10k requests · 3-tier medium         | 6 nodes, 6 edges   | 10s     | `101` | **43.85 ms**     | 39.08–48.31 ms   | 8.55 ms  | 10,112    | 10,019    | 93     | 71,325  | 1,626,408         | 1,011.2                      | `true`    |
| 100k requests · 3-tier stretch       | 6 nodes, 6 edges   | 40s     | `202` | **464.90 ms**    | 457.03–477.66 ms | 7.22 ms  | 100,259   | 99,315    | 944    | 725,836 | 1,561,258         | 2,506.5                      | `true`    |
| 25-node large topology · 5k reqs     | 25 nodes, 43 edges | 10s     | `303` | **20.89 ms**     | 20.34–21.86 ms   | 0.75 ms  | 5,019     | 5,019     | 0      | 40,743  | 1,950,126         | 501.9                        | `true`    |
| Failure & recovery · 10k reqs        | 6 nodes, 6 edges   | 10s     | `404` | **38.16 ms**     | 36.76–39.52 ms   | 0.50 ms  | 10,016    | 9,918     | 98     | 70,687  | 1,852,152         | 1,001.6                      | `true`    |
| Queue saturation overload · 10k reqs | 6 nodes, 6 edges   | 5s      | `505` | **31.18 ms**     | 26.21–35.90 ms   | 2.83 ms  | 9,954     | 2,669     | 7,285  | 43,983  | 1,410,453         | 1,990.8                      | `true`    |

**Repeated `WorkerSessionRunner` Cleanup Check (`20 x 5,000` requests):**

- `iterations`: `20`, `totalWallMs`: `667.94 ms`, `heapDeltaMb`: `-60.34 MB` (reflects V8 GC reclamation during the loop), `allConserved`: `true`.

---

## 3. Architectural Optimizations Applied

1. **O(1) Hot-Path Metrics Counters:** Initial scenario profiling showed that calling `getGlobalMetrics()` inside `step()` and `handleRequestCreated()` cloned and sorted the latency reservoir on every event ($O(E \cdot N \log N)$). Replacing those hot-path lookups with O(1) `getProcessedEventCount()` and `getInFlightCount()` eliminated quadratic overhead, sustaining ~1.0M–1.95M discrete events/sec across medium and large graphs.
2. **Finalized Request & Reservoir Memory Bounds:** Removing finalized `LogicalRequest` entries from the active lookup map (while retaining bounded `recentTraces`, `50k` latency reservoir samples, and `MAX_TIME_SERIES_POINTS`-bounded bucket latencies) keeps 100k-request runs fast with controlled memory growth.
3. **Worker Batching & Throttled Snapshots:** Browser runs execute inside `simulation.worker.ts` via `WorkerSessionRunner` in bounded slices (`<= 5,000` events live, `<= 25,000` headless), emitting telemetry snapshots at throttled intervals so React Flow and Recharts remain responsive.

---

## 4. Metric Semantics & Limitations

- `DES Throughput (events/sec)` measures in-memory TypeScript discrete-event processing speed in Node; `Virtual Workload (sim req/s)` measures simulated arrivals divided by virtual horizon time. **Neither figure represents production HTTP network RPS.**
- `scripts/benchmark.ts` runs in headless Node and excludes browser Web Worker structured-clone serialization and DOM/SVG rendering latency.
- Single-host measurements vary across runs due to CPU frequency scaling, V8 JIT warmup, and GC scheduling; min–max ranges and IQR are reported alongside medians above.
