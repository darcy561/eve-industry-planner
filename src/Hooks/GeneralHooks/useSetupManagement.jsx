import { useBlueprintCalc } from "../useBlueprintCalc";
import { useInstallCostsCalc } from "./useInstallCostCalc";
import { useJobBuild } from "../useJobBuild";
import { useHelperFunction } from "./useHelperFunctions";
import Setup from "../../Classes/jobSetupConstructor";

export function useSetupManagement() {
  const { calculateResources, calculateTime } = useBlueprintCalc();
  const { calculateInstallCostFromJob } = useInstallCostsCalc();
  const {
    addItemBlueprint,
    addDefaultStructure,
    recalculateItemQty,
    calculateJobMaterialQuantities,
  } = useJobBuild();
  const { findParentUser } = useHelperFunction();

  const parentUser = findParentUser();

  function recalculateSetup(
    chosenSetup,
    chosenJob,
    alternativvePriceData,
    alternativeSystemIndexData
  ) {
    chosenSetup.materialCount = calculateResources(chosenSetup);
    chosenSetup.estimatedTime = calculateTime(chosenSetup, chosenJob.skills);
    chosenSetup.estimatedInstallCost = calculateInstallCostFromJob(
      chosenSetup,
      alternativvePriceData,
      alternativeSystemIndexData
    );
    chosenJob.build.products.totalQuantity = Object.values(
      chosenJob.build.setup
    ).reduce((prev, { runCount, jobCount }) => {
      return (prev += chosenJob.itemsProducedPerRun * runCount * jobCount);
    }, 0);

    const newTotalQuantities = calculateJobMaterialQuantities(
      chosenJob.build.setup
    );

    for (const material of chosenJob.build.materials) {
      const materialId = material.typeID.toString();
      if (materialId in newTotalQuantities) {
        material.quantity = newTotalQuantities[materialId];
      }
    }
  }

  function addNewSetup(selectedJob) {
    const existingMaterialsLocation = selectedJob.rawData.materials;
    const rawTimeValue = selectedJob.rawData.time;

    const requiredQuantity = selectedJob.rawData.products[0].quantity;

    const { ME, TE } = addItemBlueprint(
      selectedJob.jobType,
      selectedJob.blueprintTypeID
    );
    const structureData = addDefaultStructure(selectedJob.jobType);

    const setupQuantities = recalculateItemQty(
      selectedJob.maxProductionLimit,
      selectedJob.rawData.products[0].quantity,
      requiredQuantity
    );

    const newSetup = new Setup({
      ME,
      TE,
      ...structureData,
      ...setupQuantities[0],
      characterToUse: parentUser.CharacterHash,
      rawTimeValue,
      jobType: selectedJob.jobType,
    });

    existingMaterialsLocation.forEach((material) => {
      newSetup.materialCount[material.typeID] = {
        typeID: material.typeID,
        quantity: material.quantity,
        rawQuantity: material.quantity,
      };
    });

    newSetup.estimatedTime = calculateTime(newSetup, selectedJob.skills);
    newSetup.materialCount = calculateResources(newSetup);
    newSetup.estimatedInstallCost = calculateInstallCostFromJob(newSetup);

    const { jobSetups, newMaterialArray, newTotalProduced } = recalculateSetup(
      newSetup,
      selectedJob
    );

    return { jobSetups, newMaterialArray, newTotalProduced };
  }

  function deleteActiveSetup(chosenJob, activeSetup) {
    let jobSetups = { ...chosenJob.build.setup };
    const itemsProducedPerRun = chosenJob.itemsProducedPerRun;
    let newMaterialArray = [...chosenJob.build.materials];
    let preventUpdate = false;

    if (Object.keys(chosenJob.build.setup).length === 1) {
      preventUpdate = true;
      return { preventUpdate };
    }

    delete jobSetups[activeSetup];

    const newTotalProduced = Object.values(jobSetups).reduce(
      (prev, { runCount, jobCount }) => {
        return (prev += itemsProducedPerRun * runCount * jobCount);
      },
      0
    );

    const newTotalQuantities = calculateJobMaterialQuantities(jobSetups);

    for (const material of newMaterialArray) {
      const materialId = material.typeID.toString();
      if (materialId in newTotalQuantities) {
        material.quantity = newTotalQuantities[materialId];
      }
    }

    const replacementSetupID = Object.keys(jobSetups)[0];

    return {
      jobSetups,
      newMaterialArray,
      newTotalProduced,
      preventUpdate,
      replacementSetupID,
    };
  }

  return {
    addNewSetup,
    deleteActiveSetup,
    recalculateSetup,
  };
}
