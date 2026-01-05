/**
 * Structure Management for EVE Industry Planner.
 * 
 * Handles all operations related to custom structures including manufacturing,
 * reaction, and reprocessing structures. Provides methods for adding, removing,
 * updating, and managing custom structures across different job types.
 * 
 * @fileoverview Custom structure management actions
 * @author EVE Industry Planner Team
 */

import {
  customStructureMap,
  customStructureLocationMap,
} from "../../Context/defaultValues";

/**
 * Structure management actions for application settings.
 * 
 * Provides methods for managing custom structures including CRUD operations,
 * default structure management, and structure retrieval.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Structure management actions
 */
export const structureActions = (set, get) => ({
  /**
   * Gets a custom structure by its ID.
   * 
   * Searches for a custom structure across all structure types (manufacturing,
   * reaction, reprocessing) based on the structure ID. Determines the job type
   * from the structure ID and retrieves the structure from the appropriate storage.
   * 
   * @param {string} structureID - Structure ID to search for
   * @returns {Object|null} Custom structure object or null if not found
   * 
   * @example
   * const structure = store.getState().applicationSettings.actions.getCustomStructureWithID('manufacturing-structure-1');
   * if (structure) console.log(structure.name);
   */
  getCustomStructureWithID: (structureID) => {
    if (!structureID) return null;

    const state = get();
    const jobType = Object.entries(customStructureLocationMap).find(
      ([, value]) => structureID.includes(value)
    )?.[0];

    if (!jobType) {
      console.error("Invalid StructureID");
      return null;
    }

    const storageLocationKey = [customStructureMap[jobType]];
    const storageLocation = state.applicationSettings[storageLocationKey];

    if (!storageLocation) {
      console.error("No Matching Storage Location");
      return null;
    }

    const foundStructure = storageLocation.find(
      (obj) => obj.id === structureID
    );

    if (!foundStructure) {
      return null;
    }

    return foundStructure;
  },

  /**
   * Gets the default custom structure for a specific job type.
   * 
   * Finds the default structure for the given job type, or returns the first
   * structure if no default is set.
   * 
   * @param {string} inputJobType - Job type to get default structure for
   * @returns {Object|null} Default custom structure object or null if not found
   * 
   * @example
   * const defaultStructure = store.getState().applicationSettings.actions.getDefaultCustomStructureWithJobType('manufacturing');
   * if (defaultStructure) console.log(defaultStructure.name);
   */
  getDefaultCustomStructureWithJobType: (inputJobType) => {
    if (!inputJobType) return null;
    const state = get();

    const structureKey = customStructureMap[inputJobType];
    const structureLocation = state.applicationSettings[structureKey];

    if (!Array.isArray(structureLocation)) {
      console.error(
        "Structure location is not an array:",
        structureLocation
      );
      return null;
    }

    return (
      structureLocation.find((obj) => obj.default) ||
      structureLocation[0] ||
      null
    );
  },

  /**
   * Adds a custom structure to the appropriate storage location.
   * 
   * Adds a new custom structure to the storage array based on its job type.
   * Sets the structure as default if it's the first structure of its type.
   * 
   * @param {Object} structure - Custom structure object to add
   * @param {string} structure.jobType - Job type (manufacturing, reaction, reprocessing)
   * @param {string} structure.id - Unique structure identifier
   * @param {string} structure.name - Structure name
   * @param {boolean} [structure.default] - Whether this is the default structure
   * 
   * @example
   * const newStructure = new CustomStructure({
   *   jobType: 'manufacturing',
   *   id: 'structure-1',
   *   name: 'My Manufacturing Facility'
   * });
   * store.getState().applicationSettings.actions.addCustomStructure(newStructure);
   */
  addCustomStructure: (structure) => {
    if (!structure) {
      console.error("Unable to add structure, missing structure object");
      return;
    }
    set(
      (state) => {
        const storageLocation =
          state.applicationSettings[customStructureMap[structure.jobType]];

        if (!storageLocation) {
          console.error("No Matching Storage Location");
          return;
        }

        structure.setDefault(storageLocation.length === 0);
        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            [customStructureMap[structure.jobType]]: [
              ...storageLocation,
              structure,
            ],
          },
        };
      },
      false,
      "addCustomStructure"
    );
  },

  /**
   * Sets a custom structure as the default for its job type.
   * 
   * Sets the specified structure as default and removes the default flag
   * from all other structures of the same job type.
   * 
   * @param {string} structureID - Structure ID to set as default
   * 
   * @example
   * store.getState().applicationSettings.actions.setDefaultCustomStructure('manufacturing-structure-2');
   */
  setDefaultCustomStructure: (structureID) => {
    if (!structureID) {
      console.error("Missing StructureID");
      return;
    }

    const jobType = Object.entries(customStructureLocationMap).find(
      ([, value]) => structureID.includes(value)
    )?.[0];

    if (!jobType) {
      console.error("Invalid StructureID");
      return;
    }

    set(
      (state) => {
        const storageLocation =
          state.applicationSettings[customStructureMap[jobType]];

        if (!storageLocation) {
          console.error("No Matching Storage Location");
          return;
        }

        const matchingStructure = storageLocation.find(
          (obj) => obj.id === structureID
        );

        if (!matchingStructure) {
          console.error("No Matching Structure");
          return;
        }

        matchingStructure.default = true;
        storageLocation.forEach((structure) => {
          if (structure.id !== structureID) {
            structure.default = false;
          }
        });

        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            [customStructureMap[jobType]]: storageLocation,
          },
        };
      },
      false,
      "setDefaultCustomStructure"
    );
  },

  /**
   * Deletes a custom structure from its storage location.
   * 
   * Removes the specified structure from the appropriate storage array.
   * If the deleted structure was the default, sets the first remaining
   * structure as the new default.
   * 
   * @param {string} structureID - Structure ID to delete
   * 
   * @example
   * store.getState().applicationSettings.actions.deleteCustomStructure('manufacturing-structure-1');
   */
  deleteCustomStructure: (structureID) => {
    if (!structureID) {
      console.error("Missing StructureID");
      return;
    }
    const jobType = Object.entries(customStructureLocationMap).find(
      ([, value]) => structureID.includes(value)
    )?.[0];

    if (!jobType) {
      console.error("Invalid StructureID");
      return;
    }

    const storageLocationKey = customStructureMap[jobType];
    set(
      (state) => {
        const storageLocation =
          state.applicationSettings?.[storageLocationKey];

        if (!storageLocation) {
          console.error("No Matching Storage Location");
          return;
        }

        const matchingStructure = storageLocation.find(
          (obj) => obj.id === structureID
        );

        if (!matchingStructure) {
          console.error("No Matching Structure");
          return;
        }

        const updatedStorage = storageLocation.filter(
          (obj) => obj.id !== structureID
        );

        if (matchingStructure.default && updatedStorage.length > 0) {
          updatedStorage[0] = { ...updatedStorage[0], default: true };
        }

        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            [storageLocationKey]: updatedStorage,
          },
        };
      },
      false,
      "deleteCustomStructure"
    );
  },
});
