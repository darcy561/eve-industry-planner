/**
 * Structure Management — `customStructures.{manufacturing,reaction,reprocessing}` (API-aligned).
 *
 * @fileoverview Custom structure management actions
 */

import {
  customStructureMap,
  customStructureLocationMap,
} from "../../Context/defaultValues";

export const structureActions = (set, get) => ({
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

    const key = customStructureMap[jobType];
    const storageLocation =
      state.applicationSettings.customStructures?.[key];

    if (!storageLocation) {
      console.error("No Matching Storage Location");
      return null;
    }

    const foundStructure = storageLocation.find(
      (obj) => obj.id === structureID
    );

    return foundStructure ?? null;
  },

  getDefaultCustomStructureWithJobType: (inputJobType) => {
    if (!inputJobType) return null;
    const state = get();

    const key = customStructureMap[inputJobType];
    const structureLocation = state.applicationSettings.customStructures?.[key];

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

  addCustomStructure: (structure) => {
    if (!structure) {
      console.error("Unable to add structure, missing structure object");
      return;
    }
    set(
      (state) => {
        const key = customStructureMap[structure.jobType];
        const storageLocation = [
          ...(state.applicationSettings.customStructures[key] || []),
        ];

        if (!key) {
          console.error("No Matching Storage Location");
          return state;
        }

        structure.setDefault(storageLocation.length === 0);
        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            customStructures: {
              ...state.applicationSettings.customStructures,
              [key]: [...storageLocation, structure],
            },
          },
        };
      },
      false,
      "addCustomStructure"
    );
  },

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
        const key = customStructureMap[jobType];
        const storageLocation = state.applicationSettings.customStructures?.[key];

        if (!storageLocation) {
          console.error("No Matching Storage Location");
          return state;
        }

        const matchingStructure = storageLocation.find(
          (obj) => obj.id === structureID
        );

        if (!matchingStructure) {
          console.error("No Matching Structure");
          return state;
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
            customStructures: {
              ...state.applicationSettings.customStructures,
              [key]: [...storageLocation],
            },
          },
        };
      },
      false,
      "setDefaultCustomStructure"
    );
  },

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
          state.applicationSettings.customStructures?.[storageLocationKey];

        if (!storageLocation) {
          console.error("No Matching Storage Location");
          return state;
        }

        const matchingStructure = storageLocation.find(
          (obj) => obj.id === structureID
        );

        if (!matchingStructure) {
          console.error("No Matching Structure");
          return state;
        }

        const updatedStorage = storageLocation.filter(
          (obj) => obj.id !== structureID
        );

        if (matchingStructure.default && updatedStorage.length > 0) {
          updatedStorage[0].setDefault(true);
        }

        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            customStructures: {
              ...state.applicationSettings.customStructures,
              [storageLocationKey]: updatedStorage,
            },
          },
        };
      },
      false,
      "deleteCustomStructure"
    );
  },
});
