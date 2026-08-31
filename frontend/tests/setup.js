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

// Node's own Web Storage global has no methods unless `--localstorage-file` names a path, and
// Vitest skips jsdom's `localStorage`/`sessionStorage` when a global of that name already
// exists. Point the globals back at the jsdom instance Vitest exposes here.
if (globalThis.jsdom) {
  globalThis.localStorage = globalThis.jsdom.window.localStorage;
  globalThis.sessionStorage = globalThis.jsdom.window.sessionStorage;
}
