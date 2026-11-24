import { describe, expect, it } from 'vitest';
import { SeededRng } from '@/engine/random/prng';

describe('SeededRng (SplitMix32 + xoshiro128**)', () => {
  it('produces identical sequences for identical seeds and diverges for different seeds', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const c = new SeededRng(43);

    const seqA = Array.from({ length: 50 }, () => a.nextFloat());
    const seqB = Array.from({ length: 50 }, () => b.nextFloat());
    const seqC = Array.from({ length: 50 }, () => c.nextFloat());

    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('handles edge seeds, booleans, picks, and invalid rates safely', () => {
    const z1 = new SeededRng(0);
    const z2 = new SeededRng(0);
    expect(z1.nextUint32()).toBe(z2.nextUint32());
    expect(z1.seed).toBe(0);

    const neg1 = new SeededRng(-12345);
    const neg2 = new SeededRng(-12345);
    expect(neg1.nextFloat()).toBe(neg2.nextFloat());
    expect(new SeededRng(Number.NaN).seed).toBe(1);

    expect(z1.nextInt(5, 3)).toBe(5);
    expect(z1.nextInt(1, 5)).toBeGreaterThanOrEqual(1);
    expect(z1.nextBool(0)).toBe(false);
    expect(z1.nextBool(1)).toBe(true);
    expect(z1.pick([])).toBeUndefined();
    expect(z1.pick(['a', 'b'])).toMatch(/^[ab]$/);
    expect(z1.nextExponentialMs(0)).toBe(Number.POSITIVE_INFINITY);
    expect(z1.nextServiceTimeMs(0, 'exponential')).toBe(0);
  });

  it('keeps forked substreams independent from parent draw count', () => {
    const parent1 = new SeededRng(99);
    const fork1 = parent1.fork('metrics-reservoir');

    const parent2 = new SeededRng(99);
    for (let i = 0; i < 100; i += 1) parent2.nextFloat();
    const fork2 = parent2.fork('metrics-reservoir');

    expect(Array.from({ length: 10 }, () => fork1.nextUint32())).toEqual(
      Array.from({ length: 10 }, () => fork2.nextUint32()),
    );
  });

  it('generates exponential inter-arrivals with accurate sample mean', () => {
    const rng = new SeededRng(2026);
    const ratePerSec = 25; // expected mean = 40 ms
    const n = 40_000;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      sum += rng.nextExponentialMs(ratePerSec);
    }
    const sampleMean = sum / n;
    expect(sampleMean).toBeGreaterThan(38.5);
    expect(sampleMean).toBeLessThan(41.5);
  });

  it('generates fixed, exponential, and lognormal service times matching target mean', () => {
    const rng = new SeededRng(777);
    expect(rng.nextServiceTimeMs(50, 'fixed')).toBe(50);

    let logSum = 0;
    const n = 30_000;
    for (let i = 0; i < n; i += 1) {
      const val = rng.nextServiceTimeMs(100, 'lognormal', 0.6);
      expect(val).toBeGreaterThan(0);
      logSum += val;
    }
    const logMean = logSum / n;
    expect(logMean).toBeGreaterThan(96);
    expect(logMean).toBeLessThan(104);
  });
});
