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
    calculateJobTotalMaterialQuantities,
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

    recalculateTotalQuantityProduced(chosenJob);

    updateTotalMaterialQuantities(chosenJob);
  }

  function addNewSetup(chosenJob) {
    const rawTimeValue = chosenJob.rawData.time;

    const requiredQuantity = chosenJob.rawData.products[0].quantity;

    const { ME, TE } = addItemBlueprint(
      chosenJob.jobType,
      chosenJob.blueprintTypeID
    );
    const structureData = addDefaultStructure(chosenJob.jobType);

    const setupQuantities = recalculateItemQty(
      chosenJob.maxProductionLimit,
      chosenJob.rawData.products[0].quantity,
      requiredQuantity
    );

    const newSetup = new Setup({
      ME,
      TE,
      ...structureData,
      ...setupQuantities[0],
      characterToUse: parentUser.CharacterHash,
      rawTimeValue,
      jobType: chosenJob.jobType,
    });

    chosenJob.rawData.materials.forEach((material) => {
      newSetup.materialCount[material.typeID] = {
        typeID: material.typeID,
        quantity: material.quantity,
        rawQuantity: material.quantity,
      };
    });

    newSetup.estimatedTime = calculateTime(newSetup, chosenJob.skills);
    newSetup.materialCount = calculateResources(newSetup);
    newSetup.estimatedInstallCost = calculateInstallCostFromJob(newSetup);

    chosenJob.build.setup[newSetup.id] = newSetup;
    
    chosenJob.layout.setupToEdit = newSetup.id

    recalculateTotalQuantityProduced(chosenJob);

    updateTotalMaterialQuantities(chosenJob);
  }

  function deleteActiveSetup(chosenJob, activeSetup) {
    if (Object.keys(chosenJob.build.setup).length === 1) {
      return false;
    }

    delete chosenJob.build.setup[activeSetup];

    chosenJob.layout.setupToEdit = Object.keys(chosenJob.build.setup).at(-1);

    recalculateTotalQuantityProduced(chosenJob);

    updateTotalMaterialQuantities(chosenJob);

    return true;
  }

  function recalculateTotalQuantityProduced(inputJob) {
    inputJob.build.products.totalQuantity = Object.values(
      inputJob.build.setup
    ).reduce((prev, { runCount, jobCount }) => {
      return (prev += inputJob.itemsProducedPerRun * runCount * jobCount);
    }, 0);
  }

  function updateTotalMaterialQuantities(inputjob) {
    const newTotalQuantities = calculateJobTotalMaterialQuantities(
      inputjob.build.setup
    );

    for (const material of inputjob.build.materials) {
      const materialId = material.typeID.toString();
      if (materialId in newTotalQuantities) {
        material.quantity = newTotalQuantities[materialId];
      }
    }
  }

  return {
    addNewSetup,
    deleteActiveSetup,
    recalculateSetup,
  };
}
