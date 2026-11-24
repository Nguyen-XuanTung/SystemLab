/**
 * Generic binary min-heap for O(log N) event scheduling.
 */
export class MinHeap<T> {
  private readonly items: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  clear(): void {
    this.items.length = 0;
  }

  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const len = this.items.length;
    if (len === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (len > 1 && last !== undefined) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const currentItem = this.items[i];
      const parentItem = this.items[parent];
      if (currentItem === undefined || parentItem === undefined) break;
      if (this.compare(currentItem, parentItem) >= 0) break;
      this.items[i] = parentItem;
      this.items[parent] = currentItem;
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    const len = this.items.length;
    while (true) {
      const left = (i << 1) + 1;
      const right = left + 1;
      let smallest = i;

      if (left < len) {
        const leftItem = this.items[left];
        const smallestItem = this.items[smallest];
        if (leftItem !== undefined && smallestItem !== undefined && this.compare(leftItem, smallestItem) < 0) {
          smallest = left;
        }
      }
      if (right < len) {
        const rightItem = this.items[right];
        const smallestItem = this.items[smallest];
        if (rightItem !== undefined && smallestItem !== undefined && this.compare(rightItem, smallestItem) < 0) {
          smallest = right;
        }
      }
      if (smallest === i) break;

      const currentItem = this.items[i];
      const targetItem = this.items[smallest];
      if (currentItem === undefined || targetItem === undefined) break;
      this.items[i] = targetItem;
      this.items[smallest] = currentItem;
      i = smallest;
    }
  }
}
