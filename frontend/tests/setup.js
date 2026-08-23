import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock environment variables - Vitest handles this automatically
// No need to manually set process.env in Vitest

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver and IntersectionObserver.
//
// Declared as classes and assigned to both global and window: components reach
// for `window.ResizeObserver`, which jsdom does not alias to `global`, and MUI
// calls it with `new`, which a plain mock function does not satisfy.
class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

global.ResizeObserver = MockObserver;
global.IntersectionObserver = MockObserver;
window.ResizeObserver = MockObserver;
window.IntersectionObserver = MockObserver;
