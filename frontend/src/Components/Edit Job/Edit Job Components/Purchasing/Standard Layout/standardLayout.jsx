import { Grid } from "@mui/material";
import { useMemo } from "react";

import { TutorialStep2 } from "../tutorialStep2";
import { PurchasingDataPanel_EditJob } from "./Purchasing Data Panel/purchsingDataPanel";
import { InventionCostsCard } from "./Invention Costs/inventionCostsCard";
import { MaterialCardFrame_Purchasing } from "./Material Cards/materialCardFrame";
import useUsersStore from "../../../../../Zustand/usersStore";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";
import { childJobIDsAfterEdits } from "../../../Edit Job Hooks/jobSelectors";
import { useJobDraft } from "../../../Edit Job Hooks/useJobDraft";
import { materialRequirementOf } from "../../../Edit Job Hooks/jobSelectors";
import {
  quantityPurchased,
  quantityRemaining,
} from "../../../Edit Job Hooks/materialSelectors";
import { childJobSupplyForMaterial } from "./Material Cards/functions/childJobSupplyForMaterial.js";
import JobSetupInfoFrame from "./JobSetupInfo/JobSetupInfoFrame";

export function Purchasing_StandardLayout_EditJob() {
  const childJobEdits = useUsersStore(
    (store) => store.editSession.parentChildToEdit.childJobs,
  );
  const temporaryChildJobs = useUsersStore(
    (store) => store.editSession.temporaryChildJobs,
  );
  const hideCompleteMaterials = useUsersStore(
    (state) => state.applicationSettings.hideCompleteMaterials,
  );
  const { jobArray } = useUsersStore((state) => state.jobData);
  const jobID = useJobDraft((job) => job.jobID);
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const materials = useJobDraft((job) => job.build.materials);
  const linkedChildJobs = useJobDraft((job) => job.build.childJobs);
  const setups = useJobDraft((job) => job.build.setup);

  // Helper function to calculate child job data for a material
  const calculateChildJobData = (material) => {
    let childJobs = [];
    let remainingTotalToBeImported = 0;
    const childJobLocation = childJobIDsAfterEdits(
      linkedChildJobs[material.typeID],
      childJobEdits[material.typeID],
      temporaryChildJobs[material.typeID],
    );

    if (childJobLocation.length > 0) {
      function filterJobs(jobList) {
        return jobList.filter((job) => childJobLocation.includes(job.jobID));
      }

      if (!includedInGroup) {
        childJobs = filterJobs(jobArray);
        remainingTotalToBeImported = childJobs.reduce((total, job) => {
          const matchingCostImport = Object.values(material.purchasing).find(
            (i) => i.childID === job.jobID,
          );

          if (!matchingCostImport) {
            return total + job.totalQuantityProduced;
          }
          return total;
        }, 0);
      } else {
        childJobs = filterJobs([
          ...jobArray,
          ...Object.values(temporaryChildJobs),
        ]);
        remainingTotalToBeImported = childJobs.reduce((total, job) => {
          const matchingCostImport = Object.values(material.purchasing).find(
            (i) => i.childID === job.jobID,
          );

          if (!matchingCostImport) {
            return total + job.totalQuantityProduced;
          }
          return total;
        }, 0);
      }
    }
    return {
      childJobs,
      remainingTotalToBeImported,
    };
  };

  // The same reading the card gives a material: what still has to be bought,
  // what is waiting on a child job's cost, and what is done.
  const getMaterialStatus = (material) => {
    const { childJobs, remainingTotalToBeImported } =
      calculateChildJobData(material);
    const stillNeeded = quantityRemaining(
      material,
      materialRequirementOf(setups, material.typeID),
    );
    const childSupply = childJobSupplyForMaterial(
      jobID,
      material,
      stillNeeded,
      childJobs,
    );

    const stillToBuy = Math.max(
      0,
      stillNeeded - (childJobs.length === 0 ? 0 : childSupply.min),
    );
    if (stillToBuy > 0) return 0;

    if (childJobs.length > 0 && remainingTotalToBeImported > 0) return 1;

    return 2;
  };

  // What still needs buying first, then the rest in name order.
  const sortedMaterials = useMemo(() => {
    const rows = Object.values(materials).filter(
      (material) =>
        !hideCompleteMaterials ||
        quantityPurchased(
          material,
          materialRequirementOf(setups, material.typeID),
        ) < materialRequirementOf(setups, material.typeID),
    );

    return rows.sort((a, b) => {
      const statusA = getMaterialStatus(a);
      const statusB = getMaterialStatus(b);
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      return a.name.localeCompare(b.name);
    });
    // `getMaterialStatus` is rebuilt every render and closes over exactly the
    // values below, so listing it would recompute this on every render and
    // defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    materials,
    setups,
    linkedChildJobs,
    temporaryChildJobs,
    childJobEdits,
    hideCompleteMaterials,
    jobArray,
  ]);

  return (
    <Grid container spacing={2} sx={{ width: "100%", flexGrow: 1 }}>
      <TutorialTemplate TutorialContent={<TutorialStep2 />} />

      <Grid size={12}>
        <PurchasingDataPanel_EditJob />
      </Grid>
      <Grid
        container
        spacing={1}
        sx={{
          width: "100%",
          height: "100%",
          overflowY: { xs: "scroll", sm: "visible" },
          paddingRight: { xs: 0.5, sm: 0 },
          marginTop: { xs: 2, sm: 0 },
          marginBottom: { xs: 6, sm: 0 },
          maxHeight: { xs: 600, sm: "none" },
        }}
      >
        {sortedMaterials.map((material) => (
          <MaterialCardFrame_Purchasing
            key={material.typeID}
            material={material}
          />
        ))}
        <InventionCostsCard />
      </Grid>
      <Grid size={12}>
        <JobSetupInfoFrame />
      </Grid>
    </Grid>
  );
}
