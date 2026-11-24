import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT_BYTES,
  safeParseExperimentJson,
  safeParseProjectJson,
  SCHEMA_VERSION,
  stripDangerousKeys,
} from '@/schemas/projectSchema';
import { BUILT_IN_SCENARIOS } from '@/features/scenarios/scenarios';

describe('Schema Validation & Import Security', () => {
  it('accepts a valid exported project JSON round-trip', () => {
    const project = BUILT_IN_SCENARIOS[0]!.createProject();
    const raw = JSON.stringify(project);
    const parsed = safeParseProjectJson(raw);
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.id).toBe(project.id);
    expect(parsed.data?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects oversized payloads (> 2 MB) before JSON parsing', () => {
    const oversized = 'x'.repeat(MAX_IMPORT_BYTES + 128);
    const res = safeParseProjectJson(oversized);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('safety limit');
  });

  it('strips __proto__, constructor, and prototype keys to prevent prototype pollution', () => {
    const evil = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"bad":1},"prototype":{"x":2},"safe":123,"nested":[{"__proto__":{"y":1},"ok":"yes"}]}',
    );
    const clean = stripDangerousKeys(evil) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(clean, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(clean, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(clean, 'prototype')).toBe(false);
    expect(clean.safe).toBe(123);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    // Ensure importing a project containing __proto__ strips dangerous keys safely
    const proj = BUILT_IN_SCENARIOS[0]!.createProject();
    const injectedJson = `{"__proto__":{"pwned":true},${JSON.stringify(proj).slice(1)}`;
    const parsed = safeParseProjectJson(injectedJson);
    expect(parsed.ok).toBe(true);
    expect(({} as Record<string, unknown>).pwned).toBeUndefined();
  });

  it('rejects malformed JSON, unsupported schemaVersion, unknown component types, and dangling edges', () => {
    expect(safeParseProjectJson('{not valid json').ok).toBe(false);
    expect(safeParseProjectJson('[]').ok).toBe(false);

    const proj = BUILT_IN_SCENARIOS[0]!.createProject();
    const wrongVer = safeParseProjectJson(JSON.stringify({ ...proj, schemaVersion: 999 }));
    expect(wrongVer.ok).toBe(false);
    expect(wrongVer.error).toContain('Unsupported schemaVersion');

    const unknownComp = safeParseProjectJson(
      JSON.stringify({
        ...proj,
        nodes: [{ ...proj.nodes[0]!, config: { type: 'quantum_router' } }],
      }),
    );
    expect(unknownComp.ok).toBe(false);

    const dangling = safeParseProjectJson(
      JSON.stringify({
        ...proj,
        edges: [
          {
            id: 'bad',
            source: 'client-1',
            target: 'nonexistent',
            latencyMs: 1,
            routeType: 'default',
          },
        ],
      }),
    );
    expect(dangling.ok).toBe(false);
  });

  it('migrates legacy schemaVersion 0 payloads cleanly', () => {
    const base = BUILT_IN_SCENARIOS[0]!.createProject();
    const legacy = {
      ...base,
      schemaVersion: 0,
      scheduledFaults: undefined,
    };
    const migrated = safeParseProjectJson(JSON.stringify(legacy));
    expect(migrated.ok).toBe(true);
    expect(migrated.data?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects malformed experiment JSON imports cleanly', () => {
    expect(safeParseExperimentJson('{bad').ok).toBe(false);
    expect(safeParseExperimentJson('{"schemaVersion":1}').ok).toBe(false);
  });

  it('rejects excessively nested JSON payloads beyond recursion depth limit and invalid nodeMetrics', () => {
    const deep = '{"a":'.repeat(80) + '1' + '}'.repeat(80);
    const deepProj = safeParseProjectJson(deep);
    expect(deepProj.ok).toBe(false);
    expect(deepProj.error).toContain('nesting depth');

    const deepExp = safeParseExperimentJson(deep);
    expect(deepExp.ok).toBe(false);
    expect(deepExp.error).toContain('nesting depth');

    const validExp = {
      schemaVersion: SCHEMA_VERSION,
      id: 'exp-1',
      name: 'Exp 1',
      projectId: 'proj-1',
      projectName: 'Proj 1',
      engineVersion: '1.0.0',
      seed: 42,
      durationMs: 1000,
      drainOnEnd: true,
      graphSnapshot: { nodes: [], edges: [] },
      faultTimeline: [],
      summaryMetrics: {
        virtualTimeMs: 1000,
        generated: 0,
        succeeded: 0,
        failed: 0,
        timedOut: 0,
        inFlight: 0,
        throughputRps: 0,
        errorRate: null,
        meanLatencyMs: null,
        p50LatencyMs: null,
        p95LatencyMs: null,
        p99LatencyMs: null,
        processedEvents: 0,
        sampleCount: 0,
      },
      nodeMetrics: {
        badNode: { invalidField: 'corrupt' },
      },
      timeSeries: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const invalidMetricsRes = safeParseExperimentJson(JSON.stringify(validExp));
    expect(invalidMetricsRes.ok).toBe(false);
  });
});
