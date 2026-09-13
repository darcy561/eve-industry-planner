import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { create } from "zustand";
import { usersStoreState } from "./usersStoreHarness.js";

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
 *   applicationSettings: { theme: 'dark' }
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
 * spyStore.getState().account.actions.setLoggedIn(true);
 * expect(spyStore.getSpyCalls()).toHaveLength(1);
 */
export function createSpyStore(storeCreator) {
  const spyCalls = [];
  const originalStore = storeCreator();

  return {
    ...originalStore,
    getSpyCalls: () => spyCalls,
    clearSpyCalls: () => (spyCalls.length = 0),
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
 * await waitForStoreCondition(store, (state) => state.account.isLoggedIn === true);
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
 * @returns {Function} Test wrapper component
 *
 * @example
 * const TestWrapper = createTestWrapper();
 * render(<TestWrapper><MyComponent /></TestWrapper>);
 */
export function createTestWrapper() {
  return ({ children }) => {
    // Store is already available globally in Zustand
    // This wrapper is mainly for semantic clarity in tests
    return children;
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
      uid: "test-user-123",
      email: "test@example.com",
      displayName: "Test User",
      photoURL: null,
      ...overrides,
    }),

    job: (overrides = {}) => ({
      id: "test-job-123",
      name: "Test Job",
      type: "manufacturing",
      status: "active",
      createdAt: new Date().toISOString(),
      ...overrides,
    }),

    corporation: (overrides = {}) => ({
      id: "test-corp-123",
      name: "Test Corporation",
      ticker: "TEST",
      ...overrides,
    }),
  };
}

/**
 * A store state for code that resolves the planner a request works in.
 *
 * Signed in whenever an account is named, because the reads this is written for
 * are enabled on `account.isLoggedIn`: a signed-out state leaves them never
 * asking for anything, which reads as the code being wrong rather than the
 * setup being incomplete.
 *
 * The planner actions are the real ones, so a test exercises the actual fallback
 * to the account's own planner instead of a second copy of that rule.
 *
 * @param {{accountID?: string, owner?: string|null}} [overrides]
 * @returns {object} a state object for a `usersStore` mock
 */
export function activePlannerStoreState({
  accountID = "acct-1",
  owner = null,
} = {}) {
  return usersStoreState({
    account: { accountID, isLoggedIn: Boolean(accountID) },
    activePlanner: { owner },
  });
}

/**
 * An unsigned but structurally real ESI access JWT.
 *
 * The SPA reads `exp` and the identity claims out of tokens it is handed and never verifies a
 * signature — that is the server's job — so a token built here exercises the same paths a real one
 * does.
 *
 * @param {object} [claims]
 * @param {number} [claims.exp] - Unix seconds; defaults to an hour out.
 * @param {string} [claims.owner] - Character hash.
 * @param {string} [claims.name]
 * @param {number} [claims.characterID]
 * @returns {string}
 */
export function esiAccessToken(claims = {}) {
  const {
    exp = Math.floor(Date.now() / 1000) + 3600,
    owner = "owner-hash",
    name = "Test Pilot",
    characterID = 94800326,
  } = claims;
  const part = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, "");
  return `${part({ alg: "RS256" })}.${part({
    sub: `CHARACTER:EVE:${characterID}`,
    owner,
    name,
    exp,
  })}.signature`;
}

/**
 * Wraps an element in a React Query provider.
 *
 * A component that calls `useQueryClient` throws without one, and that is a
 * setup failure rather than anything the test is about. Retries are off so a
 * failing query fails the test immediately instead of timing it out.
 *
 * @param {React.ReactNode} ui
 * @returns {React.ReactElement}
 */
export function withQueryClient(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return createElement(QueryClientProvider, { client }, ui);
}
