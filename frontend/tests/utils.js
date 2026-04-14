import { create } from 'zustand';
import { vi } from 'vitest';

/**
 * Test utilities for Zustand store testing
 * 
 * Provides helper functions to create isolated store instances for testing,
 * mock store state, and test store actions independently of React components.
 */

/**
 * Creates a fresh store instance for testing
 * 
 * This ensures each test gets a clean store state without interference
 * from other tests or the main application state.
 * 
 * @param {Function} storeCreator - Function that creates the store
 * @returns {Object} Fresh store instance
 * 
 * @example
 * const testStore = createTestStore(createUsersStore);
 * const state = testStore.getState();
 */
export function createTestStore(storeCreator) {
  return storeCreator();
}

/**
 * Creates a mock store with predefined state
 * 
 * Useful for testing components that depend on specific store state
 * without needing to set up complex initial state.
 * 
 * @param {Object} initialState - Initial state for the store
 * @param {Object} actions - Mock actions for the store
 * @returns {Object} Mock store instance
 * 
 * @example
 * const mockStore = createMockStore({
 *   account: { isLoggedIn: true },
 *   users: { user: { name: 'Test User' } }
 * });
 */
export function createMockStore(initialState = {}, actions = {}) {
  return create((set, get) => ({
    ...initialState,
    ...actions,
    // Provide mock set and get functions
    setState: set,
    getState: get,
  }));
}

/**
 * Creates a spy store that tracks all state changes
 * 
 * Useful for testing that actions properly update state
 * and for debugging state changes during tests.
 * 
 * @param {Function} storeCreator - Function that creates the store
 * @returns {Object} Store instance with spy functionality
 * 
 * @example
 * const spyStore = createSpyStore(createUsersStore);
 * spyStore.getState().users.actions.login('test@example.com');
 * expect(spyStore.getSpyCalls()).toHaveLength(1);
 */
export function createSpyStore(storeCreator) {
  const spyCalls = [];
  const originalStore = storeCreator();
  
  return {
    ...originalStore,
    getSpyCalls: () => spyCalls,
    clearSpyCalls: () => spyCalls.length = 0,
    // Override setState to track calls
    setState: (partial, replace) => {
      spyCalls.push({ partial, replace, timestamp: Date.now() });
      return originalStore.setState(partial, replace);
    },
  };
}

/**
 * Waits for store state to match expected condition
 * 
 * Useful for testing asynchronous operations that update store state.
 * 
 * @param {Object} store - Store instance to watch
 * @param {Function} condition - Function that returns true when condition is met
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise} Promise that resolves when condition is met
 * 
 * @example
 * await waitForStoreCondition(store, (state) => state.users.isLoading === false);
 */
export function waitForStoreCondition(store, condition, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkCondition = () => {
      if (condition(store.getState())) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Store condition not met within ${timeout}ms`));
      } else {
        setTimeout(checkCondition, 10);
      }
    };
    
    checkCondition();
  });
}

/**
 * Creates a test wrapper for React components that need store access
 * 
 * Provides a clean way to test components with store dependencies
 * without needing to set up complex provider hierarchies.
 * 
 * @param {Object} store - Store instance to provide
 * @returns {Function} Test wrapper component
 * 
 * @example
 * const TestWrapper = createTestWrapper(testStore);
 * render(<TestWrapper><MyComponent /></TestWrapper>);
 */
export function createTestWrapper(store) {
  return ({ children }) => {
    // Store is already available globally in Zustand
    // This wrapper is mainly for semantic clarity in tests
    return children;
  };
}

/**
 * Mocks Firebase functions for testing
 * 
 * Provides common Firebase mocks that can be reused across tests.
 * 
 * @returns {Object} Mock Firebase functions
 */
export function createFirebaseMocks() {
  return {
    auth: {
      signInWithPopup: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChanged: vi.fn(),
    },
    firestore: {
      collection: vi.fn(),
      doc: vi.fn(),
      getDoc: vi.fn(),
      getDocs: vi.fn(),
      setDoc: vi.fn(),
      updateDoc: vi.fn(),
      deleteDoc: vi.fn(),
      onSnapshot: vi.fn(),
    },
    functions: {
      httpsCallable: vi.fn(),
    },
  };
}

/**
 * Creates test data for common entities
 * 
 * Provides factory functions to create test data for users, jobs, etc.
 * 
 * @returns {Object} Test data factories
 */
export function createTestData() {
  return {
    user: (overrides = {}) => ({
      uid: 'test-user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
      ...overrides,
    }),
    
    job: (overrides = {}) => ({
      id: 'test-job-123',
      name: 'Test Job',
      type: 'manufacturing',
      status: 'active',
      createdAt: new Date().toISOString(),
      ...overrides,
    }),
    
    corporation: (overrides = {}) => ({
      id: 'test-corp-123',
      name: 'Test Corporation',
      ticker: 'TEST',
      ...overrides,
    }),
  };
}
