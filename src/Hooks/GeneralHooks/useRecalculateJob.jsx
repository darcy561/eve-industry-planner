import { useJobBuild } from "../useJobBuild";
import { useInstallCostsCalc } from "./useInstallCostCalc";
import { useBlueprintCalc } from "../useBlueprintCalc";
import Setup from "../../Classes/jobSetupConstructor";
import { useHelperFunction } from "./useHelperFunctions";

export function useRecalcuateJob() {
  const {
    addItemBlueprint,
    addDefaultStructure,
    calculateJobMaterialQuantities,
    recalculateItemQty,
  } = useJobBuild();
  const { calculateTime, calculateResources } = useBlueprintCalc();
  const { calculateInstallCostFromJob } = useInstallCostsCalc();
  const { findParentUser } = useHelperFunction();

  const parentUser = findParentUser();

  function recalculateJobForNewTotal(inputJob, requiredQuantity) {
    if (!inputJob || !requiredQuantity) return;

    const newSetupQuantities = recalculateItemQty(
      inputJob.maxProductionLimit,
      inputJob.rawData.products[0].quantity,
      requiredQuantity
    );

    const { ME, TE } = addItemBlueprint(
      inputJob.jobType,
      inputJob.blueprintTypeID
    );
    const structureData = addDefaultStructure(inputJob.jobType);
    const rawTimeValue = inputJob.rawData.time;

    inputJob.build.setup = {};
    newSetupQuantities.forEach((newItem, index) => {
      const newSetup = new Setup({
        ME,
        TE,
        ...structureData,
        ...newItem,
        characterToUse: parentUser.CharacterHash,
        ...inputJob.rawData.time,
        jobType: inputJob.jobType,
        rawTimeValue,
      });

      inputJob.rawData.materials.forEach((material) => {
        newSetup.materialCount[material.typeID] = {
          typeID: material.typeID,
          quantity: material.quantity,
          rawQuantity: material.quantity,
        };
      });

      newSetup.estimatedTime = calculateTime(newSetup, inputJob.skills);
      newSetup.materialCount = calculateResources(newSetup);
      newSetup.estimatedInstallCost = calculateInstallCostFromJob(newSetup);

      inputJob.build.setup[newSetup.id] = newSetup;

      if (!index) {
        inputJob.layout.setupToEdit = newSetup.id;
      }
    });

    const newTotalQuantities = calculateJobMaterialQuantities(
      inputJob.build.setup
    );
    for (const material of inputJob.build.materials) {
      const materialID = material.typeID.toString();
      if (materialID in newTotalQuantities) {
        material.quantity = newTotalQuantities[materialID];
      }
    }

    inputJob.build.products.totalQuantity = Object.values(
      inputJob.build.setup
    ).reduce((prev, { runCount, jobCount }) => {
      return prev + inputJob.itemsProducedPerRun * runCount * jobCount;
    }, 0);
  }

  return {
    recalculateJobForNewTotal,
  };
}
