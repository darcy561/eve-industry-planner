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

        const isFirstOfKind = !structures.some(
          (existing) => existing.jobType === structure.jobType,
        );

        return {
          applicationSettings: {
            ...state.applicationSettings,
            customStructures: [
              ...structures,
              { ...structure, default: isFirstOfKind },
            ],
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

        const reflagged = structures.map((structure) =>
          structure.jobType === matchingStructure.jobType
            ? { ...structure, default: structure.id === structureID }
            : structure,
        );

        return {
          applicationSettings: {
            ...state.applicationSettings,
            customStructures: reflagged,
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

        const promoted = matchingStructure.default
          ? remaining.find(
              (structure) => structure.jobType === matchingStructure.jobType,
            )
          : undefined;

        return {
          applicationSettings: {
            ...state.applicationSettings,
            customStructures: remaining.map((structure) =>
              structure === promoted
                ? { ...structure, default: true }
                : structure,
            ),
          },
        };
      },
      false,
      "deleteCustomStructure",
    );
  },
});
