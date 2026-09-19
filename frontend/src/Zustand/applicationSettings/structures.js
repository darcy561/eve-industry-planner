/**
 * @fileoverview Custom structure management actions
 */

export const structureActions = (set, get) => ({
  getCustomStructureWithID: (structureID) => {
    if (!structureID) return null;

    const structures = get().applicationSettings.customStructures ?? [];

    return structures.find((structure) => structure.id === structureID) ?? null;
  },

  getDefaultCustomStructureWithJobType: (inputJobType) => {
    if (!inputJobType) return null;

    const ofJobType = (get().applicationSettings.customStructures ?? []).filter(
      (structure) => structure.jobType === inputJobType,
    );

    return (
      ofJobType.find((structure) => structure.default) || ofJobType[0] || null
    );
  },

  addCustomStructure: (structure) => {
    if (!structure) {
      console.error("Unable to add structure, missing structure object");
      return;
    }
    set(
      (state) => {
        const structures = state.applicationSettings.customStructures ?? [];

        // The first structure of its kind is that kind's default. Counted per
        // kind rather than over the whole list, which now holds every kind.
        const isFirstOfKind = !structures.some(
          (existing) => existing.jobType === structure.jobType,
        );
        structure.setDefault(isFirstOfKind);

        return {
          applicationSettings: {
            ...state.applicationSettings,
            customStructures: [...structures, structure],
          },
        };
      },
      false,
      "addCustomStructure",
    );
  },

  setDefaultCustomStructure: (structureID) => {
    if (!structureID) {
      console.error("Missing StructureID");
      return;
    }

    set(
      (state) => {
        const structures = state.applicationSettings.customStructures ?? [];
        const matchingStructure = structures.find(
          (structure) => structure.id === structureID,
        );

        if (!matchingStructure) {
          console.error("No Matching Structure");
          return state;
        }

        // Only this kind's other structures lose the flag. One list holds every
        // kind, so an unscoped sweep would clear the defaults of kinds the
        // reader did not touch.
        for (const structure of structures) {
          if (structure.jobType !== matchingStructure.jobType) continue;
          structure.setDefault(structure.id === structureID);
        }

        return {
          applicationSettings: {
            ...state.applicationSettings,
            customStructures: [...structures],
          },
        };
      },
      false,
      "setDefaultCustomStructure",
    );
  },

  deleteCustomStructure: (structureID) => {
    if (!structureID) {
      console.error("Missing StructureID");
      return;
    }

    set(
      (state) => {
        const structures = state.applicationSettings.customStructures ?? [];
        const matchingStructure = structures.find(
          (structure) => structure.id === structureID,
        );

        if (!matchingStructure) {
          console.error("No Matching Structure");
          return state;
        }

        const remaining = structures.filter(
          (structure) => structure.id !== structureID,
        );

        // A kind that loses its default promotes its own first survivor, not
        // whatever happens to sit at the front of the whole list.
        if (matchingStructure.default) {
          const nextOfKind = remaining.find(
            (structure) => structure.jobType === matchingStructure.jobType,
          );
          nextOfKind?.setDefault(true);
        }

        return {
          applicationSettings: {
            ...state.applicationSettings,
            customStructures: remaining,
          },
        };
      },
      false,
      "deleteCustomStructure",
    );
  },
});
