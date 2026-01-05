/**
 * Watchlist Management for EVE Industry Planner.
 * 
 * Handles watchlist operations including setting watchlist items and groups,
 * managing watchlist data, and watchlist-related operations. Provides methods
 * for managing user watchlists and watchlist data.
 * 
 * @fileoverview Watchlist management operations
 * @author EVE Industry Planner Team
 */

/**
 * Watchlist management actions for jobs slice.
 * 
 * Provides methods for managing watchlist data including setting items,
 * groups, and managing watchlist state.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Watchlist management actions
 */
export const watchlistManagementActions = (set, get) => ({
  /**
   * Sets the user watchlist with items and groups.
   * 
   * @param {Array} items - Watchlist items array
   * @param {Array} groups - Watchlist groups array
   * 
   * @example
   * store.getState().jobData.actions.setUserWatchlist(items, groups);
   */
  setUserWatchlist: (items, groups) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          userWatchlist: {
            items: items || [],
            groups: groups || [],
          },
        },
      }),
      false,
      "setUserWatchlist"
    );
  },

  /**
   * Sets the user watchlist groups.
   * 
   * @param {Array} groups - Watchlist groups array
   * 
   * @example
   * store.getState().jobData.actions.setUserWatchlistGroups(groups);
   */
  setUserWatchlistGroups: (groups) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          userWatchlist: {
            ...state.jobData.userWatchlist,
            groups: groups || [],
          },
        },
      }),
      false,
      "setUserWatchlistGroups"
    );
  },

  /**
   * Sets the user watchlist items.
   * 
   * @param {Array} items - Watchlist items array
   * 
   * @example
   * store.getState().jobData.actions.setUserWatchlistItems(items);
   */
  setUserWatchlistItems: (items) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          userWatchlist: {
            ...state.jobData.userWatchlist,
            items: items || [],
          },
        },
      }),
      false,
      "setUserWatchlistItems"
    );
  },
});
