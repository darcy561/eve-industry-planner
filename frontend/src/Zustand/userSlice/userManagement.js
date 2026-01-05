/**
 * User Management for EVE Industry Planner.
 *
 * Handles user-related operations including finding users, adding/removing users,
 * updating user arrays, and managing user data. Provides methods for user
 * identification, character matching, and user array manipulation.
 *
 * @fileoverview User management and user array operations
 * @author EVE Industry Planner Team
 */

/**
 * User management actions for user slice.
 *
 * Provides methods for managing users including finding, adding, removing,
 * and updating user data and user arrays.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} User management actions
 */
export const userManagementActions = (set, get) => ({
  /**
   * Finds the parent user (first user in the array).
   *
   * @returns {Object|null} Parent user object or null if not found
   *
   * @example
   * const parentUser = store.getState().users.actions.findParentUser();
   * if (parentUser) console.log(parentUser.CharacterName);
   */
  findParentUser: () => {
    const state = get().users;
    return state.userArray?.find((user) => user.ParentUser) || null;
  },

  /**
   * Finds the index of the parent user in the user array.
   *
   * @returns {number} Index of parent user or -1 if not found
   *
   * @example
   * const parentIndex = store.getState().users.actions.findParentUserIndex();
   * console.log('Parent user index:', parentIndex);
   */
  findParentUserIndex: () => {
    const state = get().users;
    return state.userArray?.findIndex((user) => user.ParentUser) || -1;
  },

  /**
   * Finds a user by character hash.
   *
   * @param {string} characterHash - Character hash to search for
   * @returns {Object|null} User object or null if not found
   *
   * @example
   * const user = store.getState().users.actions.findUserByCharacterHash('hash-123');
   * if (user) console.log(user.CharacterName);
   */
  findUserByCharacterHash: (characterHash) => {
    const state = get().users;
    return (
      state.userArray?.find((user) => user.CharacterHash === characterHash) ||
      null
    );
  },

  /**
   * Finds a user by character ID.
   *
   * @param {number} characterID - Character ID to search for
   * @returns {Object|null} User object or null if not found
   *
   * @example
   * const user = store.getState().users.actions.findUserByCharacterID(123456);
   * if (user) console.log(user.CharacterName);
   */
  findUserByCharacterID: (characterID) => {
    const state = get().users;
    return (
      state.userArray?.find((user) => user.CharacterID === characterID) || null
    );
  },

  /**
   * Matches a character by ID or corporation ID.
   *
   * @param {number} id - ID to search for
   * @param {boolean} isCorporation - Whether to search by corporation ID
   * @returns {Object|null} User object or null if not found
   *
   * @example
   * const user = store.getState().users.actions.matchCharacterByIDorCorporationID(123456, false);
   * if (user) console.log(user.CharacterName);
   */
  matchCharacterByIDorCorporationID: (id, isCorporation) => {
    const state = get().users;
    return (
      state.userArray?.find((user) =>
        isCorporation ? user.CorporationID === id : user.CharacterID === id
      ) || null
    );
  },

  /**
   * Adds a new user to the user array.
   *
   * @param {Object} user - User object to add
   *
   * @example
   * const newUser = new User(characterData);
   * store.getState().users.actions.addUser(newUser);
   */
  addUser: (user) => {
    set(
      (state) => ({
        ...state,
        users: {
          ...state.users,
          userArray: [...state.users.userArray, user],
        },
      }),
      false,
      "addUser"
    );
  },

  /**
   * Removes a user from the user array.
   *
   * @param {Object} user - User object to remove
   *
   * @example
   * const userToRemove = { CharacterHash: 'hash-123' };
   * store.getState().users.actions.removeUser(userToRemove);
   */
  removeUser: (user) => {
    set(
      (state) => ({
        ...state,
        users: {
          ...state.users,
          userArray: state.users.userArray.filter(
            (u) => u.CharacterHash !== user.CharacterHash
          ),
        },
      }),
      false,
      "removeUser"
    );
  },

  /**
   * Updates the entire user array.
   *
   * @param {Array} array - New user array
   *
   * @example
   * const newUserArray = [user1, user2, user3];
   * store.getState().users.actions.updateUserArray(newUserArray);
   */
  updateUserArray: (array) => {
    set(
      (state) => ({
        ...state,
        users: {
          ...state.users,
          userArray: array,
        },
      }),
      false,
      "updateUserArray"
    );
  },

  /**
   * Adds new users to the existing user array.
   *
   * @param {Array} array - Array of new users to add
   *
   * @example
   * const newUsers = [user1, user2];
   * store.getState().users.actions.addNewUsers(newUsers);
   */
  addNewUsers: (array) => {
    set(
      (state) => ({
        ...state,
        users: {
          ...state.users,
          userArray: [...state.users.userArray, ...array],
        },
      }),
      false,
      "addNewUsers"
    );
  },

  /**
   * Updates Firebase listeners array.
   *
   * @param {Array|Object} newListeners - Array of new Firebase listeners to add, or single listener object
   *
   * @example
   * const listeners = [{ id: 'job-123', unsubscribe: () => {} }];
   * store.getState().users.actions.updateFirebaseListeners(listeners);
   *
   * @example
   * const singleListener = { id: 'job-123', unsubscribe: () => {} };
   * store.getState().users.actions.updateFirebaseListeners(singleListener);
   */
  updateFirebaseListeners: (newListeners) => {
    // Handle both single listener object and array of listeners
    const listenersArray = Array.isArray(newListeners)
      ? newListeners
      : [newListeners];

    set(
      (state) => ({
        ...state,
        users: {
          ...state.users,
          firebaseListeners: [
            ...state.users.firebaseListeners,
            ...listenersArray,
          ],
        },
      }),
      false,
      "updateFirebaseListeners"
    );
  },

  /**
   * Removes Firebase listeners by their IDs.
   *
   * @param {Array} listenerIDs - Array of listener IDs to remove
   *
   * @example
   * store.getState().users.actions.removeFirebaseListeners(['job-123', 'job-456']);
   */
  removeFirebaseListeners: (listenerIDs) => {
    set(
      (state) => ({
        ...state,
        users: {
          ...state.users,
          firebaseListeners: state.users.firebaseListeners.filter(
            (listener) => !listenerIDs.includes(listener.id)
          ),
        },
      }),
      false,
      "removeFirebaseListeners"
    );
  },

  /**
   * Gets the server access token from the parent user.
   *
   * Retrieves the JWT server access token from the parent user (first user in array).
   * Returns null if no parent user exists or token is not available.
   *
   * @returns {string|null} Server access token or null if not available
   *
   * @example
   * const token = store.getState().users.actions.getServerAccessToken();
   * if (token) {
   *   headers.Authorization = `Bearer ${token}`;
   * }
   */
  getServerAccessToken: () => {
    const state = get().users;
    const parentUser = state.userArray?.find((user) => user.ParentUser) || null;
    return parentUser?.serverAccessToken || null;
  },
});
