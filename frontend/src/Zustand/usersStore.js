/**
 * Main Users Store for EVE Industry Planner.
 *
 * Creates and configures the main Zustand store by combining all state slices
 * including user settings, application settings, world data, and jobs data.
 * Provides centralized state management with Redux DevTools integration
 * and hot module replacement support for development.
 *
 * @fileoverview Main Zustand store configuration for EVE Industry Planner
 * @author EVE Industry Planner Team
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import applicationSettingsSlice from "./applicationSettingsSlice";
import accountSlice from "./accountSlice";
import userSettingsSlice from "./userSlice";
import worldDataSlice from "./worldDataSlIce";
import jobsSlice from "./jobsSlice";

/**
 * Creates the main users store with all state slices.
 *
 * Combines all state slices (user settings, application settings, world data,
 * and jobs data) into a single Zustand store with Redux DevTools integration.
 *
 * @returns {Object} Configured Zustand store instance
 *
 * @example
 * const store = createUsersStore();
 * const useStore = store;
 */
const createUsersStore = () =>
  create(
    devtools(
      (set, get) => ({
        ...userSettingsSlice(set, get),
        ...applicationSettingsSlice(set, get),
        ...accountSlice(set, get),
        ...worldDataSlice(set, get),
        ...jobsSlice(set, get),
      }),
      {
        name: "usersStore",
        // import.meta.env.ENVIRONMENT is defined in vite.config (same merged .ENVIRONMENT as root .env)
        enabled: import.meta.env.ENVIRONMENT === "development",
      }
    )
  );

/**
 * Main store instance with hot module replacement support.
 *
 * Creates the store instance with support for hot module replacement in development.
 * Uses a global window reference to maintain store state across hot reloads.
 *
 * @type {Object} Configured Zustand store instance
 */
const store = import.meta.hot
  ? (window.__ZUSTAND_STORE__ ??
    (window.__ZUSTAND_STORE__ = createUsersStore()))
  : createUsersStore();

/**
 * Default export of the main users store.
 *
 * This is the primary store instance that should be used throughout
 * the application for state management.
 *
 * @type {Object} Main Zustand store instance
 */
export default store;
