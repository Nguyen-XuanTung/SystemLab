# ADR-009: Canvas Memoization and Sampled Telemetry Packet Visualization

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
Rendering individual DOM/SVG animations for thousands of requests per second would freeze React Flow and degrade chart responsiveness.

## Decision
Memoize custom `@xyflow/react` nodes (`SystemNode`) and edges (`TrafficEdge`) via `React.memo`, drive edge packet dots from throttled per-edge delta counters (`edgeDeltaCounts`) emitted by the worker (~20 Hz), cap visual pulses per edge per frame, and expose explicit `Normal`, `Reduced Motion`, `High-Speed`, and `Headless Fast-Run` visualization modes honoring `prefers-reduced-motion`.

## Alternatives Considered
- **HTML5 Canvas overlay spawning 1 particle per event:** High frame cost during bursts and requires syncing custom viewport transforms with React Flow zoom/pan.

## Trade-offs
- **Pros:** Smooth 60fps interaction at high request rates while keeping vector edges crisp and accessible; metrics are never distorted to match animation sampling.
- **Cons:** Visual packets represent sampled traffic density rather than 1:1 tracking of every individual request (explicitly disclosed in UI legend and docs).
