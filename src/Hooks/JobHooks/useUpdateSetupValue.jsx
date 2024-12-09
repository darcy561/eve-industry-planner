import { useContext } from "react";
import { useSetupManagement } from "../GeneralHooks/useSetupManagement";
import { jobTypes } from "../../Context/defaultValues";
import { SystemIndexContext } from "../../Context/EveDataContext";
import { useRecalcuateJob } from "../GeneralHooks/useRecalculateJob";
import { ApplicationSettingsContext } from "../../Context/LayoutContext";
import Job from "../../Classes/jobConstructor";
import getSystemIndexes from "../../Functions/System Indexes/findSystemIndex";
import checkJobTypeIsBuildable from "../../Functions/Helper/checkJobTypeIsBuildable";

export function useUpdateSetupValue() {
  const { systemIndexData, updateSystemIndexData } =
    useContext(SystemIndexContext);
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const { recalculateSetup } = useSetupManagement();
  const { recalculateJobForNewTotal } = useRecalcuateJob();

  async function recalcuateJobFromSetup(
    setupObject,
    setupAttribute,
    setupAttributeValue,
    requirements,
    activeJob,
    updateActiveJob,
    requiresSystemData
  ) {
    setupObject[setupAttribute] = setupAttributeValue;

    updateRequirementFields(setupObject, requirements);
    applyCustomStructure(setupObject, setupAttribute, setupAttributeValue);

    const systemIndexResults = await getSystemIndexes(
      setupObject.systemID,
      systemIndexData
    );

    const { jobSetups, newMaterialArray, newTotalProduced } = recalculateSetup(
      setupObject,
      activeJob,
      undefined,
      systemIndexResults
    );
    activeJob.build.setup = jobSetups;
    activeJob.build.materials = newMaterialArray;
    activeJob.build.products.totalQuantity = newTotalProduced;

    updateActiveJob((prev) => new Job(prev));
    updateSystemIndexData((prev) => ({ ...prev, ...systemIndexResults }));
  }

  function recalculateWatchListItems(
    requestedTypeID,
    mainTypeID,
    setupID,
    attribute,
    attributeValue,
    requirements,
    materialObject
  ) {
    let newMaterialObject = { ...materialObject };

    newMaterialObject[requestedTypeID].build.setup[setupID][attribute] =
      attributeValue;
    updateRequirementFields(
      newMaterialObject[requestedTypeID].build.setup[setupID],
      requirements
    );

    applyCustomStructure(
      newMaterialObject[requestedTypeID].build.setup[setupID],
      attribute,
      attributeValue
    );

    const { jobSetups, newMaterialArray, newTotalProduced } = recalculateSetup(
      newMaterialObject[requestedTypeID].build.setup[setupID],
      newMaterialObject[requestedTypeID]
    );

    newMaterialObject[requestedTypeID].build.setup = jobSetups;
    newMaterialObject[requestedTypeID].build.materials = newMaterialArray;
    newMaterialObject[requestedTypeID].build.products.totalQuantity =
      newTotalProduced;

    if (requestedTypeID === mainTypeID) {
      const mainJob = newMaterialObject[mainTypeID];

      for (let material of mainJob.build.materials) {
        if (!checkJobTypeIsBuildable(material.jobType)) continue;

        const materialJob = newMaterialObject[material.typeID];
        recalculateJobForNewTotal(materialJob, material.quantity);
      }
    }

    return newMaterialObject;
  }

  function updateRequirementFields(setupObject, requirements) {
    if (!requirements || !setupObject) return;

    const attributesToCopy = [
      "structureID",
      "rigID",
      "systemTypeID",
      "systemID",
      "taxValue",
    ];

    for (const attribute of attributesToCopy) {
      if (attribute in requirements) {
        setupObject[attribute] = requirements[attribute];
      }
    }
  }

  function applyCustomStructure(setupObject, attribute, attributeValue) {
    if (attribute !== "customStructureID") return;
    if (!attributeValue) {
      setupObject.customStructureID = null;
    } else {
      const selectedStructure =
        applicationSettings.getCustomStructureWithID(attributeValue);

      setupObject.structureID = selectedStructure.structureType;
      setupObject.rigID = selectedStructure.rigType;
      setupObject.systemTypeID = selectedStructure.systemType;
      setupObject.systemID = selectedStructure.systemID;
      setupObject.taxValue = selectedStructure.tax;
    }
  }

  return {
    recalcuateJobFromSetup,
    recalculateWatchListItems,
  };
}
