import { Grid } from "@mui/material";
import { useMemo } from "react";

import { TutorialStep2 } from "../tutorialStep2";
import { PurchasingDataPanel_EditJob } from "./Purchasing Data Panel/purchsingDataPanel";
import { InventionCostsCard } from "./Invention Costs/inventionCostsCard";
import { MaterialCardFrame_Purchasing } from "./Material Cards/materialCardFrame";
import useUsersStore from "../../../../../Zustand/usersStore";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";
import getCurrentLinkedChildJobIDsForMaterial from "./Material Cards/functions/getCurrentLinkedChildJobIDsForMaterial.js.js";
import JobSetupInfoFrame from "./JobSetupInfo/JobSetupInfoFrame";

export function Purchasing_StandardLayout_EditJob(props) {
  const { state } = props;
  const hideCompleteMaterials = useUsersStore(
    (state) => state.applicationSettings.hideCompleteMaterials
  );
  const { jobArray } = useUsersStore((state) => state.jobData);

  // Helper function to calculate child job data for a material
  const calculateChildJobData = (material) => {
    let childJobs = [];
    let childJobProductionTotal = 0;
    let remainingTotalToBeImported = 0;
    const childJobLocation = getCurrentLinkedChildJobIDsForMaterial(
      material.typeID,
      state.activeJob,
      state.temporaryChildJobs,
      state.parentChildToEdit
    );

    if (childJobLocation.length > 0) {
      function filterJobs(jobList) {
        return jobList.filter((job) => childJobLocation.includes(job.jobID));
      }

      if (!state.activeJob.includedInGroup) {
        childJobs = filterJobs(jobArray);
        childJobProductionTotal = childJobs.reduce(
          (total, job) => total + job.totalQuantityProduced(),
          0
        );
        remainingTotalToBeImported = childJobs.reduce((total, job) => {
          const matchingCostImport = material.purchasing.find(
            (i) => i.childID === job.jobID
          );

          if (!matchingCostImport) {
            return (total += job.totalQuantityProduced());
          }
          return total;
        }, 0);
      } else {
        childJobs = filterJobs([
          ...jobArray,
          ...Object.values(state.temporaryChildJobs),
        ]);
        childJobProductionTotal = childJobs.reduce((total, job) => {
          return (total += job.totalQuantityProduced());
        }, 0);

        remainingTotalToBeImported = childJobs.reduce((total, job) => {
          const matchingCostImport = material.purchasing.find(
            (i) => i.childID === job.jobID
          );

          if (!matchingCostImport) {
            return (total += job.totalQuantityProduced());
          }
          return total;
        }, 0);
      }
    }
    return {
      childJobs,
      childJobProductionTotal,
      remainingTotalToBeImported,
    };
  };

  // Helper function to determine material status for sorting
  const getMaterialStatus = (material) => {
    const { childJobs, childJobProductionTotal, remainingTotalToBeImported } =
      calculateChildJobData(material);

    // Check if complete
    let isComplete = false;
    if (childJobs.length === 0) {
      isComplete = material.quantityPurchased >= material.quantity;
    } else {
      if (childJobProductionTotal >= material.quantity) {
        isComplete = remainingTotalToBeImported === 0;
      } else {
        const shortfall = material.quantity - childJobProductionTotal;
        isComplete =
          material.quantityPurchased >= shortfall &&
          remainingTotalToBeImported === 0;
      }
    }

    // Check if waiting for child job costs
    let isWaitingForCosts = false;
    if (childJobs.length > 0) {
      // Check if costs are not imported
      let costNotImported = true;
      for (const job of childJobs) {
        const matchedCostImport = material.purchasing.find(
          (i) => i.childID === job.jobID
        );
        if (matchedCostImport) {
          costNotImported = false;
          break;
        }
      }

      if (costNotImported) {
        if (childJobProductionTotal >= material.quantity) {
          isWaitingForCosts = true;
        } else {
          const shortfall = material.quantity - childJobProductionTotal;
          isWaitingForCosts = material.quantityPurchased >= shortfall;
        }
      }
    }

    // Check if needs prices
    let needsPrices = false;
    if (childJobs.length === 0) {
      needsPrices = material.quantityPurchased < material.quantity;
    } else {
      if (childJobProductionTotal < material.quantity) {
        const shortfall = material.quantity - childJobProductionTotal;
        needsPrices = material.quantityPurchased < shortfall;
      }
    }

    // Return status priority: 0 = needs prices, 1 = waiting for costs, 2 = complete
    if (needsPrices) return 0;
    if (isWaitingForCosts) return 1;
    if (isComplete) return 2;
    return 0; // Default to needs prices if unclear
  };

  // Memoized sorted materials array
  const sortedMaterials = useMemo(() => {
    const materials = state.activeJob.build.materials
      .map((material, index) => ({ material, originalIndex: index }))
      .filter(({ material }) => {
        if (
          !hideCompleteMaterials ||
          (hideCompleteMaterials &&
            material.quantityPurchased < material.quantity)
        ) {
          return true;
        }
        return false;
      });

    // Sort by status priority, then alphabetically within each group
    return materials.sort((a, b) => {
      const statusA = getMaterialStatus(a.material);
      const statusB = getMaterialStatus(b.material);

      // First sort by status
      if (statusA !== statusB) {
        return statusA - statusB;
      }

      // Then sort alphabetically by name
      return a.material.name.localeCompare(b.material.name);
    });
  }, [
    state.activeJob.build.materials,
    state.activeJob,
    state.temporaryChildJobs,
    state.parentChildToEdit,
    hideCompleteMaterials,
    jobArray,
  ]);

  return (
    <Grid container spacing={2} sx={{ width: "100%", flexGrow: 1 }}>
      <TutorialTemplate TutorialContent={<TutorialStep2 />} />

      <Grid size={12}>
        <PurchasingDataPanel_EditJob {...props} />
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
        {sortedMaterials.map(({ material, originalIndex }) => {
          return (
            <MaterialCardFrame_Purchasing
              {...props}
              key={material.typeID}
              material={material}
              materialIndex={originalIndex}
            />
          );
        })}
        <InventionCostsCard {...props} />
      </Grid>
      <Grid size={12}>
        <JobSetupInfoFrame {...props} />
      </Grid>
    </Grid>
  );
}
