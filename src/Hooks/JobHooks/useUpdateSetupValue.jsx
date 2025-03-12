import { useContext } from "react";
import { useSetupManagement } from "../GeneralHooks/useSetupManagement";
import { SystemIndexContext } from "../../Context/EveDataContext";
import { useRecalcuateJob } from "../GeneralHooks/useRecalculateJob";
import Job from "../../Classes/jobConstructor";
import getSystemIndexes from "../../Functions/System Indexes/findSystemIndex";
import checkJobTypeIsBuildable from "../../Functions/Helper/checkJobTypeIsBuildable";

export function useUpdateSetupValue() {
  const { systemIndexData, updateSystemIndexData } =
    useContext(SystemIndexContext);
  const { recalculateSetup } = useSetupManagement();
  const { recalculateJobForNewTotal } = useRecalcuateJob();

  async function recalcuateJobFromSetup(
    setupObject,
    activeJob,
    updateActiveJob
  ) {
    const systemIndexResults = await getSystemIndexes(
      setupObject.systemID,
      systemIndexData
    );

    recalculateSetup(setupObject, activeJob, undefined, systemIndexResults);

    updateActiveJob((prev) => new Job(prev));
    updateSystemIndexData((prev) => ({ ...prev, ...systemIndexResults }));
  }

  function recalculateWatchListItems(
    requestedTypeID,
    mainTypeID,
    setupID,
    materialObject
  ) {
    recalculateSetup(
      materialObject[requestedTypeID].build.setup[setupID],
      materialObject[requestedTypeID]
    );

    if (requestedTypeID === mainTypeID) {
      const mainJob = materialObject[mainTypeID];

      for (let material of mainJob.build.materials) {
        if (!checkJobTypeIsBuildable(material.jobType)) continue;

        const materialJob = materialObject[material.typeID];
        recalculateJobForNewTotal(materialJob, material.quantity);
      }
    }
  }

  return {
    recalcuateJobFromSetup,
    recalculateWatchListItems,
  };
}
