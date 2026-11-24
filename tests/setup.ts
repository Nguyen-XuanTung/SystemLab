import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// Provide a clean ResizeObserver stub for Recharts & React Flow in jsdom tests
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
