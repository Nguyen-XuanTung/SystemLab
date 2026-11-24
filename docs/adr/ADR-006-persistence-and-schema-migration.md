# ADR-006: Versioned Persistence via IndexedDB (Dexie) and Sanitized JSON

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
Projects and saved experiments contain graphs and bounded time series exceeding `localStorage` quotas, and users must be able to share or back up architectures safely.

## Decision
Persist projects and experiments in IndexedDB via `Dexie` (`SystemLabDB`), and support versioned JSON (`schemaVersion: 1`) import/export validated through `zod` after recursive prototype-pollution key stripping and a 2 MB size cap.

## Alternatives Considered
- **`localStorage` only:** Quickly hits ~5 MB shared quota when saving multiple experiment time-series snapshots.

## Trade-offs
- **Pros:** Structured queries, large local capacity, resilient offline autosave, and strict import security.
- **Cons:** Requires `fake-indexeddb` in unit/integration tests and an in-memory fallback when browser private modes block IndexedDB.
