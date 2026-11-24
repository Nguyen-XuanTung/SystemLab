# AGENTS.md — Contributor & Engineering Guidelines for SystemLab

## Repository Overview

SystemLab is a local-first, deterministic discrete-event system design simulator built with TypeScript, React, `@xyflow/react`, Zustand, Recharts, Dexie, Zod, and Tailwind CSS v4.

## Non-Negotiable Architecture Rules

1. **Engine Isolation (`src/engine/`):**
   - `src/engine/` must remain 100% pure TypeScript.
   - NEVER import React, DOM APIs (`window`, `document`), IndexedDB, or Zustand inside `src/engine/`.
   - NEVER call `Math.random()` inside `src/engine/`. All randomness must go through `SeededRng` (`src/engine/random/prng.ts`).
2. **Determinism & Correctness:**
   - Virtual simulation time (`VirtualClock`) is the sole source of truth for request timing, timeouts, utilization, and metrics.
   - Every logical request must reach at most one terminal state (`succeeded`, `failed`, or `timed_out`), preserving `generated === succeeded + failed + timedOut + inFlight`.
   - Changing UI playback speed or worker batching must NEVER alter final simulation metrics for the same graph, configuration, and seed.
3. **Worker & UI Separation:**
   - Run browser simulations in the Web Worker (`src/workers/simulation.worker.ts`) via `workerClient.ts`, tagging runs with `runId` so stale worker messages are discarded.
   - Never fabricate metrics, charts, or fallback numbers in React components. Display `—` when sample count is 0.
4. **Safe Persistence & Imports:**
   - Validate all imported JSON using `src/schemas/projectSchema.ts` (size limits, prototype-pollution key stripping, Zod schema checks). Never execute code from imported JSON.

## Standard Commands

```bash
npm run dev            # Start local dev server
npm run typecheck      # Strict TypeScript check
npm run lint           # ESLint check (includes engine purity rules)
npm run test           # Run Vitest unit, analytical & integration suites
npm run test:coverage  # Run tests with V8 coverage thresholds
npm run test:e2e       # Run Playwright E2E suite against Chrome
npm run benchmark      # Run deterministic engine performance benchmarks
npm run build          # Typecheck + Vite production build
npm run preview        # Preview production build locally
```

## Coding Conventions

- Keep functions focused with shallow nesting and explicit TypeScript types.
- Use CSS custom properties (`var(--sl-*)`) rather than hardcoded hex colors inside components.
- Ensure all interactive controls have accessible labels, keyboard focus styles, and `prefers-reduced-motion` support.
