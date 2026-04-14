/**
 * User slice actions that are not tied to `account.characters` (Firebase listeners, etc.).
 * Character list logic lives in `account/characterActions.js`.
 *
 * @fileoverview User slice — Firebase listeners
 */

export const userManagementActions = (set, get) => ({
  /**
   * Updates Firebase listeners array.
   *
   * @param {Array|Object} newListeners - Array of new Firebase listeners to add, or single listener object
   *
   * @example
   * const listeners = [{ id: 'job-123', unsubscribe: () => {} }];
   * store.getState().users.actions.updateFirebaseListeners(listeners);
   */
  updateFirebaseListeners: (newListeners) => {
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
});
