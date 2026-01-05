/**
 * Corporation Management for EVE Industry Planner.
 * 
 * Handles corporation-related operations including checking for existing
 * corporation objects, managing corporation data, and corporation-related
 * user operations. Provides methods for corporation identification and management.
 * 
 * @fileoverview Corporation management operations
 * @author EVE Industry Planner Team
 */

/**
 * Corporation management actions for user slice.
 * 
 * Provides methods for managing corporation data including checking for
 * existing corporations and managing corporation objects.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Corporation management actions
 */
export const corporationManagementActions = (set, get) => ({
  /**
   * Checks for existing corporation object by corporation ID.
   * 
   * @param {number} corporationID - Corporation ID to check for
   * @returns {Object|null} Corporation object or null if not found
   * 
   * @example
   * const corporation = store.getState().users.actions.checkForExistingCorporationObject(123456);
   * if (corporation) console.log(corporation.corporationName);
   */
  checkForExistingCorporationObject: (corporationID) => {
    const state = get().users;
    return state.corporationObjects?.[corporationID] || null;
  },

  /**
   * Adds a corporation object to the corporation objects store.
   * 
   * @param {Object} corporationObject - Corporation object to add
   * 
   * @example
   * const corp = new Corporation(userData, publicData, divisionsData);
   * store.getState().users.actions.addCorporationObject(corp);
   */
  addCorporationObject: (corporationObject) => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        corporationObjects: {
          ...state.users.corporationObjects,
          [corporationObject.corporation_id]: corporationObject,
        },
      }
    }), false, "addCorporationObject");
  },

  /**
   * Gets a corporation object by corporation ID.
   * 
   * @param {number} corporationID - Corporation ID to get
   * @returns {Object|null} Corporation object or null if not found
   * 
   * @example
   * const corporation = store.getState().users.actions.getCorporationObject(123456);
   * if (corporation) console.log(corporation.corporationName);
   */
  getCorporationObject: (corporationID) => {
    const state = get().users;
    return state.corporationObjects?.[corporationID] || null;
  },

  /**
   * Removes a character from all corporation objects.
   * 
   * @param {string} characterHash - Character hash to remove
   * 
   * @example
   * store.getState().users.actions.removeCharacterFromCorporationObjects('ABC123');
   */
  removeCharacterFromCorporationObjects: (characterHash) => {
    const state = get().users;
    const corporationObjects = { ...state.corporationObjects };

    for (let i = Object.keys(corporationObjects).length - 1; i >= 0; i--) {
      const key = Object.keys(corporationObjects)[i];
      if (corporationObjects[key].members && corporationObjects[key].members.includes(characterHash)) {
        corporationObjects[key].removeMember(characterHash);
      }
      if (corporationObjects[key].members && corporationObjects[key].members.length === 0) {
        delete corporationObjects[key];
      }
    }
    
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        corporationObjects: corporationObjects,
      }
    }), false, "removeCharacterFromCorporationObjects");
  },

  /**
   * Sets corporation office locations from assets array.
   * 
   * @param {number} corporationID - Corporation ID
   * @param {Array} assetsArray - Array of asset objects
   * 
   * @example
   * store.getState().users.actions.setCorporationOffices(123456, assetsArray);
   */
  setCorporationOffices: (corporationID, assetsArray) => {
    const state = get().users;
    const corporationObject = state.corporationObjects[corporationID];

    if (corporationObject) {
      corporationObject.addOfficeLocations(assetsArray);

      set((state) => ({
        ...state,
        users: {
          ...state.users,
          corporationObjects: {
            ...state.users.corporationObjects,
            [corporationID]: corporationObject,
          },
        },
      }), false, "setCorporationOffices");
    }
  },
});
