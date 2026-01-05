import useUsersStore from "../../Zustand/usersStore";
import { jobTypes } from "../../Context/defaultValues";
import { getAllCachedCharacterBlueprints } from "../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { getAllCachedCorporationBlueprints } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";

export function checkForDefaultMaterialEfficiecyValue(inputJobType) {
  if (
    useUsersStore.getState().applicationSettings
      .defaultMaterialEfficiencyValue &&
    inputJobType === jobTypes.manufacturing
  ) {
    return useUsersStore.getState().applicationSettings
      .defaultMaterialEfficiencyValue;
  }
  return 0;
}

export function findHighestMaterialEfficiencyBlueprint(
  inputJobType,
  blueprintTypeID,
  queryClient
) {
  const defaultReturn = {
    ME: checkForDefaultMaterialEfficiecyValue(inputJobType),
    TE: 0,
  };

  if (
    inputJobType !== jobTypes.manufacturing ||
    !useUsersStore.getState().users.isLoggedIn
  ) {
    return defaultReturn;
  }

  const characterBlueprints = getAllCachedCharacterBlueprints(queryClient);
  const corporationBlueprints = getAllCachedCorporationBlueprints(queryClient);

  const filteredBlueprints = [
    ...Object.values(characterBlueprints.data).flat(),
    ...Object.values(corporationBlueprints.data).flat(),
  ].filter((entry) => entry.type_id === blueprintTypeID);

  if (filteredBlueprints.length < 1) {
    return defaultReturn;
  }

  filteredBlueprints.sort(
    (a, b) =>
      a.quantity.toString().localeCompare(b.quantity.toString()) ||
      b.material_efficiency - a.material_efficiency ||
      b.time_efficiency - a.time_efficiency
  );

  return {
    ME: filteredBlueprints[0].material_efficiency,
    TE: filteredBlueprints[0].time_efficiency / 2,
  };
}

export function getDefaultStrutureForJobType(inputJobType) {
  const matchedStructure = useUsersStore
    .getState()
    .applicationSettings.actions.getDefaultCustomStructureWithJobType(
      inputJobType
    );

  if (!matchedStructure) return {};

  return {
    rigID: matchedStructure.rigType,
    structureID: matchedStructure.structureType,
    systemTypeID: matchedStructure.systemType,
    systemID: matchedStructure.systemID,
    taxValue: matchedStructure.tax,
    customStructureID: matchedStructure.id,
  };
}

export function calculateSetupQuantitiesFromRequiredQuantity(
  maxProductionLimit,
  baseQuantity,
  itemQuantityRequired
) {
  const jobs = [];
  const totalPerMaxRuns = maxProductionLimit * baseQuantity;
  const numMaxRuns = Math.floor(itemQuantityRequired / totalPerMaxRuns);
  let leftOvers = 0;
  let singleJobRequired = false;

  if (totalPerMaxRuns > itemQuantityRequired) {
    jobs.push({
      runCount: Math.ceil(itemQuantityRequired / baseQuantity),
      jobCount: 1,
    });
    singleJobRequired = true;
  } else {
    leftOvers = itemQuantityRequired - totalPerMaxRuns * numMaxRuns;
  }

  if (!singleJobRequired) {
    jobs.push({
      runCount: maxProductionLimit,
      jobCount: numMaxRuns,
    });
  }
  if (leftOvers > 0) {
    jobs.push({
      runCount: Math.ceil(leftOvers / baseQuantity),
      jobCount: 1,
    });
  }

  return jobs;
}
