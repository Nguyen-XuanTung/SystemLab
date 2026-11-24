# Performance & Benchmark Report — SystemLab

## 1. Test Environment & Measurement Procedure

- **Host Hardware:** Windows 11 (`Microsoft Windows NT 10.0.26100.0`, 16 logical processors, 16 GB RAM, `win32/x64`)
- **Runtime:** Node `v24.14.0`
- **Script:** `scripts/benchmark.ts` executed via `npm run benchmark` (`tsx scripts/benchmark.ts`)
- **Seed:** `42` across all benchmark cases
- **Procedure:** Each case constructs a fresh `SimulationEngine`, snapshots `process.memoryUsage().heapUsed` before and after `engine.runToCompletion()`, times wall-clock execution via `perf_hooks.performance.now()`, and asserts exact logical request conservation (`generated === succeeded + failed + timedOut + inFlight`).

---

## 2. Observed Benchmark Results

| Benchmark Case | Topology | Horizon | Wall Time (ms) | Generated | Succeeded | Failed | Events Processed | Throughput (events/sec) | Heap Delta (MB) | Conserved |
|---|---|---|---|---|---|---|---|---|---|---|
| 1k requests · small 2-node | 2 nodes, 1 edge | 10s | **13.68 ms** | 996 | 985 | 11 | 3,801 | 277,906 | +1.40 MB | `true` |
| 10k requests · 3-tier medium | 6 nodes, 6 edges | 10s | **63.26 ms** | 10,147 | 10,040 | 107 | 71,554 | 1,131,187 | +8.15 MB | `true` |
| 100k requests · 3-tier stretch | 6 nodes, 6 edges | 40s | **676.62 ms** | 100,127 | 99,088 | 1,039 | 724,610 | 1,070,929 | +41.69 MB | `true` |
| 25-node large topology · 5k reqs | 25 nodes, 43 edges | 10s | **32.84 ms** | 4,981 | 4,981 | 0 | 40,406 | 1,230,525 | -19.56 MB | `true` |
| Failure & recovery · 10k reqs | 6 nodes, 6 edges | 10s | **57.34 ms** | 10,114 | 10,008 | 106 | 71,400 | 1,245,176 | +4.75 MB | `true` |
| Queue saturation overload · 10k reqs | 6 nodes, 6 edges | 5s | **37.74 ms** | 10,040 | 2,784 | 7,256 | 44,724 | 1,185,147 | +39.62 MB | `true` |

---

## 3. Architectural Optimizations Applied

1. **O(1) Hot-Path Metrics Counters:** Initial scenario profiling showed that calling `getGlobalMetrics()` inside `step()` and `handleRequestCreated()` cloned and sorted the latency reservoir on every event ($O(E \cdot N \log N)$). Replacing those hot-path lookups with O(1) `getProcessedEventCount()` and `getInFlightCount()` eliminated quadratic overhead, bringing 10k-request runs from multi-second execution down to `63.26 ms` (>1M events/sec).
2. **Finalized Request Pruning:** Removing finalized `LogicalRequest` entries from the active lookup map (while retaining the bounded 200-entry `recentTraces` buffer in `MetricsCollector`) keeps 100k-request runs under `~42 MB` heap delta.
3. **Worker Batching & Throttled Snapshots:** Browser runs execute inside `simulation.worker.ts` in bounded slices (`<= 5,000` events live, `<= 25,000` headless), emitting telemetry snapshots at ~20 Hz so React Flow and Recharts stay responsive.

---

## 4. Limitations

- Node CLI benchmarks measure pure engine compute without structured-clone worker serialization or browser SVG layout cost.
- Negative heap deltas (`-19.56 MB`) reflect V8 garbage collection running between cases rather than negative memory usage.
- Browser UI responsiveness at 100,000 requests was not instrumentally benchmarked via Chrome DevTools traces; standard browser experiments target 1,000–20,000 logical requests cleanly.
