/**
 * Main Users Store for EVE Industry Planner.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import applicationSettingsSlice from "./applicationSettingsSlice";
import accountSlice from "./accountSlice";
import worldDataSlice from "./worldDataSlIce";
import jobsSlice from "./jobsSlice";
import realtimeSyncSlice from "./realtimeSyncSlice";
import documentLockSlice from "./documentLockSlice";
import headerDocumentLockUISlice from "./headerDocumentLockUISlice";

/**
 * Creates the main users store with all state slices.
 *
 * Combines all state slices (application settings, account, world data,
 * and jobs data) into a single Zustand store with Redux DevTools integration.
 *
 * @returns {Object} Configured Zustand store instance
 */
const createUsersStore = () =>
  create(
    devtools(
      (set, get) => ({
        ...applicationSettingsSlice(set, get),
        ...accountSlice(set, get),
        ...worldDataSlice(set, get),
        ...jobsSlice(set, get),
        ...realtimeSyncSlice(set, get),
        ...documentLockSlice(set, get),
        ...headerDocumentLockUISlice(set, get),
      }),
      {
        name: "usersStore",
        // import.meta.env.ENVIRONMENT is defined in vite.config (same merged .ENVIRONMENT as root .env)
        enabled: import.meta.env.ENVIRONMENT === "development",
      }
    )
  );

/**
 * Main store instance. The store is parked on a global window reference so its
 * state survives a hot reload.
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
