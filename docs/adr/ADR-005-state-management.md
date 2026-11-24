# ADR-005: Zustand Fine-Grained Stores Separated from Engine State

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
During live simulation, telemetry updates arrive ~20 times per second while graph topology editing needs undo/redo history and autosave.

## Decision
Split state into three focused Zustand stores: `workspaceStore` (graph nodes/edges, selection, undo/redo, theme, project CRUD), `simulationStore` (run lifecycle, speed, latest snapshot, edge pulse map), and `experimentStore` (saved experiment snapshots and comparison selection).

## Alternatives Considered
- **React Context + `useReducer`:** Causes broad subtree re-renders on frequent telemetry ticks unless heavily split.
- **Redux Toolkit:** Extra boilerplate without meaningful benefit for local-only client state.

## Trade-offs
- **Pros:** Components subscribe to narrow slices (`useSimulationStore(s => s.snapshot?.nodeMetrics[id])`), keeping node cards and canvas smooth.
- **Cons:** Care must be taken when resetting simulation state synchronously upon graph edits.
