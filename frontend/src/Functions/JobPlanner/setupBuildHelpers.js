import Setup from "../../Classes/jobSetup";
import useUsersStore from "../../Zustand/usersStore";
import {
  findHighestMaterialEfficiencyBlueprint,
  getDefaultStrutureForJobType,
  calculateSetupQuantitiesFromRequiredQuantity,
} from "../Job Build/setupHelpers";

export function buildSetupContextForJob(job, requiredQuantity, queryClient) {
  const { ME, TE } = findHighestMaterialEfficiencyBlueprint(
    job.jobType,
    job.blueprintTypeID,
    queryClient
  );
  const structureData = getDefaultStrutureForJobType(job.jobType);
  const setupQuantities = calculateSetupQuantitiesFromRequiredQuantity(
    job.maxProductionLimit,
    job.rawData.products[0].quantity,
    requiredQuantity
  );

  return {
    ME,
    TE,
    structureData,
    setupQuantities,
    rawTimeValue: job.rawData.time,
  };
}

export function buildSetupFromQuantity(
  job,
  setupQuantity,
  queryClient,
  context,
  overrides = {}
) {
  const newSetup = new Setup({
    ME: context.ME,
    TE: context.TE,
    ...context.structureData,
    ...setupQuantity,
    systemID: overrides.systemID ?? context.structureData.systemID,
    characterToUse:
      overrides.characterToUse ??
      useUsersStore.getState().account.actions.getMainCharacterHash(),
    rawTimeValue: context.rawTimeValue,
    jobType: job.jobType,
  });

  newSetup.applyInitialRawMaterialQuantities(job.rawData.materials);
  newSetup.recalculate(job.skills, queryClient);
  return newSetup;
}
