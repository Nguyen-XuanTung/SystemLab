# Scenario Authoring Guide — SystemLab

Built-in scenarios live in `src/features/scenarios/scenarios.ts`. Every scenario must:
1. Pass `validateGraph(graph, simConfig)` with zero blocking errors.
2. Execute cleanly in `SimulationEngine.runToCompletion()` preserving `generated === succeeded + failed + timedOut + inFlight`.
3. Include non-overlapping node coordinates spaced comfortably for left-to-right readability (typically `x` increments of `260–340` px, `y` spacing of `140–180` px).
4. Document `educationalObjective`, `suggestedExperiment`, `explanation`, `modelAssumptions`, and `expectedBehavior` — never hardcode numerical outputs as expected simulation results.

After adding a scenario to `BUILT_IN_SCENARIOS`, run:

```bash
npm run test -- tests/unit/scenarios/scenarios.test.ts
```

to verify schema integrity, graph validation, and request conservation automatically.
