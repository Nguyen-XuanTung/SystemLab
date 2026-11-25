# Contributing to SystemLab

Thank you for your interest in contributing to SystemLab!

## Development Setup

```bash
npm ci
npm run dev
```

## Non-Negotiable Architecture Guidelines

See [AGENTS.md](AGENTS.md) for complete rules:

1. Keep `src/engine/` 100% pure TypeScript with zero React, DOM, Zustand, Dexie, or `Math.random()` usage.
2. Preserve deterministic seeded execution and the logical request conservation invariant (`generated === succeeded + failed + timedOut + inFlight`).
3. Never hardcode or fabricate metrics in UI components.
4. Validate any schema or JSON import changes with strict Zod rules and prototype-pollution key sanitization.

## Pull Request Checklist

Before submitting changes:

1. Run `npm run lint`
2. Run `npm run format:check`
3. Run `npm run typecheck`
4. Run `npm run test:coverage`
5. Run `npm run test:runner` (if modifying `scripts/run_demo.py` or `scripts/ports.json`)
6. Run `npm run build`
7. Run `npm run test:e2e` for UI or persistence changes (uses isolated port `5202`)
8. Update relevant docs under `docs/` when adding components, scenarios, or engine semantics.

## Commit Conventions

Use Conventional Commits:

- `feat(engine): ...`
- `fix(canvas): ...`
- `test(engine): ...`
- `docs: ...`
- `perf(worker): ...`
