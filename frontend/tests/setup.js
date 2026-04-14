import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Firebase - comprehensive mocking
const mockApp = { 
  name: 'test-app',
  options: {},
  _getProvider: vi.fn(() => ({})),
};

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => mockApp),
  getApp: vi.fn(() => mockApp),
  getApps: vi.fn(() => [mockApp]),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  memoryLocalCache: vi.fn(() => ({})),
}));

// Mock Firebase Functions
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(),
}));

// Mock Firebase Storage
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

// Mock Firebase App Check
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: vi.fn(),
  onTokenChanged: vi.fn(),
}));

// Mock Firebase Analytics
vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({})),
  logEvent: vi.fn(),
}));

// Mock Firebase Messaging
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: vi.fn(),
  onMessage: vi.fn(),
  isSupported: vi.fn(() => Promise.resolve(false)),
}));

// Mock Firebase Remote Config
vi.mock('firebase/remote-config', () => ({
  getRemoteConfig: vi.fn(() => ({
    settings: {
      minimumFetchIntervalMillis: 0,
    },
  })),
  fetchAndActivate: vi.fn(),
  getValue: vi.fn(),
  getAll: vi.fn(),
  getString: vi.fn(),
}));

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

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
