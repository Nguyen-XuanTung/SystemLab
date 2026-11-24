# ADR-001: Local-First Zero-Backend Architecture

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
SystemLab targets CS students, system design learners, and engineers running instant experiments without cloud provisioning, login barriers, API keys, or hosting costs.

## Decision
Run the entire application (graph editor, simulation engine, telemetry charts, chaos lab, experiment comparison, and persistence) 100% locally in the browser, buildable as pure static files for GitHub Pages / Cloudflare Pages / Vercel.

## Alternatives Considered
- **Client + Node/Python Backend:** Would enable server persistence and heavy multi-core runs, at the cost of deployment fees, cold starts, auth friction, and broken offline usage.

## Trade-offs
- **Pros:** Zero cost, zero privacy leakage, instant startup, static hosting compatibility, no external dependencies.
- **Cons:** Compute is bounded by the user's browser tab memory/CPU, and IndexedDB storage is local to the browser profile (mitigated via versioned JSON export/import).
