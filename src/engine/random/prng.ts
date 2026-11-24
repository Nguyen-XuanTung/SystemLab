/**
 * Deterministic seeded pseudo-random number generator using SplitMix32 seed
 * expansion feeding a xoshiro128** core.
 *
 * Pure TypeScript: never calls Math.random().
 */
export type ServiceDistribution = 'fixed' | 'exponential' | 'lognormal';

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function splitMix32Next(stateRef: { s: number }): number {
  stateRef.s = (stateRef.s + 0x9e3779b9) >>> 0;
  let z = stateRef.s;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

function hashString32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class SeededRng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private readonly initialSeed: number;

  constructor(seed: number) {
    const normalized = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1;
    this.initialSeed = normalized;
    const sm = { s: normalized === 0 ? 0x6d2b79f5 : normalized };
    this.s0 = splitMix32Next(sm);
    this.s1 = splitMix32Next(sm);
    this.s2 = splitMix32Next(sm);
    this.s3 = splitMix32Next(sm);
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      this.s0 = 1;
    }
  }

  get seed(): number {
    return this.initialSeed;
  }

  /**
   * Returns a uniformly distributed unsigned 32-bit integer.
   */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;

    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);

    return result >>> 0;
  }

  /**
   * Returns a uniform floating-point number in [0, 1).
   */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Returns an integer uniformly distributed in [min, max] inclusive.
   */
  nextInt(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    const span = hi - lo + 1;
    return lo + Math.floor(this.nextFloat() * span);
  }

  /**
   * Returns true with probability p (clamped to [0, 1]).
   */
  nextBool(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  /**
   * Picks a random element from a non-empty readonly array.
   */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    const idx = Math.floor(this.nextFloat() * items.length);
    return items[idx];
  }

  /**
   * Generates an exponential inter-arrival time in milliseconds for a Poisson
   * arrival rate expressed in requests per second.
   */
  nextExponentialMs(ratePerSecond: number): number {
    if (ratePerSecond <= 0 || !Number.isFinite(ratePerSecond)) {
      return Number.POSITIVE_INFINITY;
    }
    const u = Math.min(this.nextFloat(), 1 - 1e-12);
    const ratePerMs = ratePerSecond / 1000;
    return -Math.log(1 - u) / ratePerMs;
  }

  /**
   * Generates a positive service duration in milliseconds.
   */
  nextServiceTimeMs(meanMs: number, distribution: ServiceDistribution, cv = 0.5): number {
    const safeMean = Math.max(0, meanMs);
    if (safeMean === 0 || distribution === 'fixed') {
      return safeMean;
    }
    if (distribution === 'exponential') {
      const u = Math.min(this.nextFloat(), 1 - 1e-12);
      return Math.max(0.01, -safeMean * Math.log(1 - u));
    }
    // Lognormal distribution parameterized by desired mean and coefficient of variation (cv = sigma / mean).
    const safeCv = Math.max(0.05, Math.min(cv, 5));
    const varianceLn = Math.log(1 + safeCv * safeCv);
    const sigmaLn = Math.sqrt(varianceLn);
    const muLn = Math.log(safeMean) - 0.5 * varianceLn;

    const u1 = Math.max(1e-12, Math.min(this.nextFloat(), 1 - 1e-12));
    const u2 = this.nextFloat();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0.01, Math.exp(muLn + sigmaLn * z));
  }

  /**
   * Creates an independent deterministic PRNG substream from this generator's initial seed
   * and a string salt so auxiliary consumers (e.g. metrics reservoir sampling) never perturb
   * core simulation draws.
   */
  fork(salt: string): SeededRng {
    const mixed = (this.initialSeed ^ hashString32(salt)) >>> 0;
    return new SeededRng(mixed);
  }
}
