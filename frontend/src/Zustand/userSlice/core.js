/**
 * Core User Management for EVE Industry Planner.
 * 
 * Contains the default state configuration and core actions for managing
 * user-related data including state initialization, document conversion,
 * and basic user operations.
 * 
 * @fileoverview Core user management state and actions
 * @author EVE Industry Planner Team
 */

import Character from "../../Classes/character";

/**
 * Default state configuration for user data.
 *
 * Characters and corporations live on the `account` slice.
 * Job stage labels and accordion expansion are handled via application settings
 * and localStorage — see `useJobStatuses`.
 *
 * @returns {Object} Default user state
 */
export const stateDefault = () => ({});

/**
 * Core actions for user management.
 * 
 * Provides essential actions for managing user state including resetting state,
 * converting to document format, and basic authentication operations.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Core user management actions
 */
export const coreActions = (set, get) => ({
  /**
   * Resets the users settings store to its default state.
   * 
   * Clears user-slice fields and resets `account.characters` to the default main-character placeholder,
   * while preserving slice `actions`.
   * 
   * @example
   * store.getState().users.actions.resetUsersSettingsStore();
   */
  resetUsersSettingsStore: () => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        ...stateDefault(),
        actions: state.users.actions,
      },
      account: {
        ...state.account,
        characters: [Character.placeholder()],
        corporations: [],
        actions: state.account.actions,
      },
    }), false, "resetUsersSettingsStore");
  },

  /**
   * Converts user state to document format for storage.
   *
   * Additional-character refresh tokens are now handled by the dedicated
   * `/api/v1/user/cloud-stored-esi-refresh-tokens` endpoint, so this payload
   * intentionally excludes refresh token fields.
   *
   * @returns {Object} Document object for storage
   */
  toDocument: () => {
    return {};
  },
});
