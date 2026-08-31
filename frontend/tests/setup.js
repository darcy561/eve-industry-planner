import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock environment variables - Vitest handles this automatically
// No need to manually set process.env in Vitest

vi.stubGlobal(
  'matchMedia',
  vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
);

// Declared as a class because MUI calls these with `new`, which a plain mock does not satisfy.
class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

vi.stubGlobal('ResizeObserver', MockObserver);
vi.stubGlobal('IntersectionObserver', MockObserver);

// Node's own Web Storage global has no methods unless `--localstorage-file` names a path, and
// Vitest skips jsdom's `localStorage`/`sessionStorage` when a global of that name already
// exists. Point the globals back at the jsdom instance Vitest exposes here.
if (globalThis.jsdom) {
  globalThis.localStorage = globalThis.jsdom.window.localStorage;
  globalThis.sessionStorage = globalThis.jsdom.window.sessionStorage;
}
