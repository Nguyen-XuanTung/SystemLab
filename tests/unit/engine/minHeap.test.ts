import { describe, expect, it } from 'vitest';
import { MinHeap } from '@/engine/core/minHeap';
import { compareSimEvents, EVENT_PRIORITY, type SimEvent } from '@/engine/events/types';

describe('MinHeap & Event Ordering', () => {
  it('pops numeric elements in strict ascending order', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    const values = [42, 7, 19, 3, 7, 100, 1, 25, 0, -5];
    for (const v of values) heap.push(v);

    expect(heap.size).toBe(values.length);
    expect(heap.peek()).toBe(-5);

    const popped: number[] = [];
    while (!heap.isEmpty()) {
      const next = heap.pop();
      if (next !== undefined) popped.push(next);
    }

    expect(popped).toEqual([-5, 0, 1, 3, 7, 7, 19, 25, 42, 100]);
    expect(heap.pop()).toBeUndefined();
    expect(heap.peek()).toBeUndefined();
  });

  it('maintains heap invariant over 2,000 shuffled pushes and interleaved pops', () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    for (let i = 2000; i >= 1; i -= 1) {
      heap.push((i * 7919) % 1000);
    }
    let prev = Number.NEGATIVE_INFINITY;
    while (!heap.isEmpty()) {
      const val = heap.pop()!;
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it('orders same-timestamp events deterministically by (timestampMs, priority, sequence)', () => {
    const heap = new MinHeap<SimEvent>(compareSimEvents);

    const mkEvent = (
      id: string,
      timestampMs: number,
      type: SimEvent['type'],
      sequence: number,
    ): SimEvent => ({
      id,
      timestampMs,
      type,
      priority: EVENT_PRIORITY[type],
      sequence,
      nodeId: 'n1',
      payload: {},
    });

    // Push deliberately out of priority/sequence order at timestamp 1000
    heap.push(mkEvent('timeout', 1000, 'REQUEST_TIMEOUT', 1));
    heap.push(mkEvent('arrival-b', 1000, 'REQUEST_ARRIVED', 4));
    heap.push(mkEvent('arrival-a', 1000, 'REQUEST_ARRIVED', 2));
    heap.push(mkEvent('complete', 1000, 'SERVICE_COMPLETED', 5));
    heap.push(mkEvent('fail', 1000, 'NODE_FAILED', 6));
    heap.push(mkEvent('earlier', 500, 'REQUEST_CREATED', 99));

    const order: string[] = [];
    while (!heap.isEmpty()) {
      order.push(heap.pop()!.id);
    }

    expect(order).toEqual([
      'earlier', // timestamp 500
      'fail', // priority 10
      'complete', // priority 20
      'arrival-a', // priority 30, seq 2
      'arrival-b', // priority 30, seq 4
      'timeout', // priority 50
    ]);
  });
});
