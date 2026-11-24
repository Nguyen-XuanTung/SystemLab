# ADR-007: Bounded Telemetry, R-7 Percentiles, and Forked Reservoir Sampling

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
Collecting unbounded arrays of every latency sample, time-series point, and event log at 10,000+ requests causes memory spikes and non-deterministic side effects if sampling shares the traffic RNG.

## Decision
Use bounded structures inside `MetricsCollector`: `500`-entry event ring buffer, `200`-entry request trace map, `<= 600` time-series buckets, time-weighted worker busy/capacity integrals, and a `50,000`-sample Algorithm R latency reservoir driven by `rng.fork('metrics-reservoir')`, evaluated via R-7 linear interpolation returning `null` (`—`) when empty.

## Alternatives Considered
- **Keep every latency sample in memory:** Exact up to moderate loads, unbounded at 100k+ requests.
- **HDRHistogram / t-digest library:** Adds external dependency complexity; bounded 50k reservoir gives exact accuracy up to 50k requests and clean bounded memory beyond 50k.

## Trade-offs
- **Pros:** Constant bounded memory, exact percentiles up to 50,000 requests, zero perturbation of traffic RNG, explicit `—` empty states.
- **Cons:** Above 50,000 succeeded requests in a single run, percentiles reflect a uniform 50k sample.
