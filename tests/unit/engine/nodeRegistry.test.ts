import { describe, expect, it } from 'vitest';
import { VirtualClock } from '@/engine/core/clock';
import {
  CATEGORY_LABELS,
  COMPONENT_DEFINITIONS,
  COMPONENT_TYPE_LIST,
} from '@/engine/models/nodeRegistry';
import { validateGraph } from '@/engine/validation/validator';

describe('Component Registry & VirtualClock', () => {
  it('exposes complete valid definitions and educational docs for all 10 component types', () => {
    expect(COMPONENT_TYPE_LIST).toHaveLength(10);
    for (const type of COMPONENT_TYPE_LIST) {
      const def = COMPONENT_DEFINITIONS[type];
      expect(def.type).toBe(type);
      expect(def.defaultConfig().type).toBe(type);
      expect(CATEGORY_LABELS[def.category]).toBeTruthy();
      expect(def.fields.length).toBeGreaterThan(0);
      expect(def.education.whatItIs.length).toBeGreaterThan(10);
      expect(def.education.simplifications.length).toBeGreaterThan(0);
    }

    // Smoke-check every component defaultConfig passes validator checks when wired properly
    for (const type of COMPONENT_TYPE_LIST) {
      if (type === 'client') continue;
      const clientDef = COMPONENT_DEFINITIONS.client;
      const targetDef = COMPONENT_DEFINITIONS[type];
      const nodes = [
        { id: 'c', label: 'Client', config: clientDef.defaultConfig() },
        { id: 'n', label: targetDef.defaultLabel, config: targetDef.defaultConfig() },
      ];
      const edges = [{ id: 'e1', source: 'c', target: 'n', latencyMs: 1, routeType: 'default' as const }];
      if (targetDef.allowOutgoing && type !== 'app_server' && type !== 'message_queue' && type !== 'worker') {
        nodes.push({ id: 'db', label: 'DB', config: COMPONENT_DEFINITIONS.database.defaultConfig() });
        edges.push({ id: 'e2', source: 'n', target: 'db', latencyMs: 1, routeType: 'default' as const });
      }
      const res = validateGraph({ nodes, edges });
      expect(res.valid).toBe(true);
    }
  });

  it('enforces monotonic positive timestamps on VirtualClock and resets cleanly', () => {
    const clock = new VirtualClock();
    expect(clock.nowMs).toBe(0);
    expect(clock.advanceTo(150)).toBe(150);
    expect(() => clock.advanceTo(-1)).toThrow('Invalid virtual timestamp');
    expect(() => clock.advanceTo(100)).toThrow('Non-monotonic virtual clock transition');
    clock.reset();
    expect(clock.nowMs).toBe(0);
  });
});
