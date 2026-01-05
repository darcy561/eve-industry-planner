import { decodeJwt } from "jose";
/**
 * Token Management for EVE Industry Planner.
 * 
 * Handles refresh token operations including adding, removing, updating,
 * and managing account refresh tokens. Provides methods for token storage,
 * retrieval, and maintenance.
 * 
 * @fileoverview Refresh token management operations
 * @author EVE Industry Planner Team
 */

/**
 * Token management actions for user slice.
 * 
 * Provides methods for managing refresh tokens including adding, removing,
 * updating, and retrieving token data.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Token management actions
 */
export const tokenManagementActions = (set, get) => ({
  /**
   * Updates the account refresh tokens array.
   * 
   * @param {Array} array - New refresh tokens array
   * 
   * @example
   * const newTokens = [{ characterHash: 'hash-1', token: 'token-1' }];
   * store.getState().users.actions.updateAccountRefreshTokens(newTokens);
   */
  updateAccountRefreshTokens: (array) => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        accountRefreshTokens: array,
      }
    }), false, "updateAccountRefreshTokens");
  },

  /**
   * Updates the IndexedDB instance.
   * 
   * @param {Object} db - IndexedDB instance
   * 
   * @example
   * store.getState().users.actions.updateIndexDB(indexedDBInstance);
   */
  updateIndexDB: (db) => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        indexDB: db,
      }
    }), false, "updateIndexDB");
  },

  /**
   * Adds a new account refresh token.
   * 
   * @param {Object} token - Token object to add
   * @param {string} token.characterHash - Character hash
   * @param {string} token.token - Refresh token
   * 
   * @example
   * const newToken = { characterHash: 'hash-123', token: 'refresh-token-abc' };
   * store.getState().users.actions.addAccountRefreshToken(newToken);
   */
  addAccountRefreshToken: (token) => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        accountRefreshTokens: [...state.users.accountRefreshTokens, token],
      }
    }), false, "addAccountRefreshToken");
  },

  /**
   * Sets the account refresh tokens array.
   * 
   * @param {Array} array - New refresh tokens array
   * 
   * @example
   * const tokens = [{ characterHash: 'hash-1', token: 'token-1' }];
   * store.getState().users.actions.setAccountRefreshTokens(tokens);
   */
  setAccountRefreshTokens: (array) => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        accountRefreshTokens: array,
      }
    }), false, "setAccountRefreshTokens");
  },

  /**
   * Removes an account refresh token by character hash.
   * 
   * @param {string} characterHash - Character hash to remove token for
   * 
   * @example
   * store.getState().users.actions.removeAccountRefreshToken('hash-123');
   */
  removeAccountRefreshToken: (characterHash) => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        accountRefreshTokens: state.users.accountRefreshTokens.filter(
          token => token.characterHash !== characterHash
        ),
      }
    }), false, "removeAccountRefreshToken");
  },
   /**
   * Gets the deserialized server access token from the parent user.
   * 
   * Finds the parent user in the state and deserializes their server access token
   * using JWT decoding. Returns null if parent user is not found or token is invalid.
   * 
   * @returns {Object|null} Deserialized server token object or null if not found
   * 
   * @example
   * const token = store.getState().users.actions.getDeserialisedSerializedServerToken();
   */
   getDeserialisedSerializedServerToken: () => {
    const state = get().users;
    const parentUser = state.userArray?.find(i => i.ParentUser);
    if (!parentUser) {
      return null;
    }

    const token = parentUser.serverAccessToken;
    if (!token) {
      return null;
    }

    try {
      const deserializedToken = decodeJwt(token);
      return deserializedToken;
    } catch (error) {
      console.error("Failed to deserialize token:", error);
      return null;
    }
  },
});
