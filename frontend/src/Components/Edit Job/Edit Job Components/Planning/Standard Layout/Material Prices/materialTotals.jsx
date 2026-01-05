import { Grid } from "@mui/material";

import { useMaterialCostCalculations } from "../../../../../../Hooks/GroupHooks/useMaterialCostCalculations";
import { useJobManagement } from "../../../../../../Hooks/useJobManagement";
import { MaterialTotalsWithMarketPrices_MaterialPrices } from "./Material Totals/withMarketPrices";
import { MaterialTotalsWithChildJobs_MaterialPrices } from "./Material Totals/withChildJobs";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function MaterialTotals_MaterialPricesPanel(props) {
  const { state, actions, marketSelect, listingSelect } = props;
  const { calculateMaterialCostFromChildJobs } = useMaterialCostCalculations();
  const { findAllChildJobCountOrIDs } = useJobManagement();

  const totalInstallCosts = Object.values(state.activeJob.build.setup).reduce(
    (prev, setup) => {
      return (prev += setup.estimatedInstallCost * setup.jobCount);
    },
    0
  );

  const totalMaterialCost = state.activeJob.build.materials.reduce(
    (prev, { typeID, quantity }) => {
      const materialPriceObject = useUsersStore
        .getState()
        .worldData.actions.findMarketData(typeID);
      if (!materialPriceObject) return prev;
      const currentMaterialPrice =
        materialPriceObject[marketSelect][listingSelect];

      return prev + currentMaterialPrice * quantity;
    },
    0
  );

  const totalBuildCost = state.activeJob.build.materials.reduce(
    (prev, material) => {
      const matchedChildJobIDs = actions.getCurrentMaterialChildJobs(
        material.typeID
      );

      return (prev += calculateMaterialCostFromChildJobs(
        material,
        matchedChildJobIDs,
        state.temporaryChildJobs[material.typeID],
        [],
        marketSelect,
        listingSelect
      ));
    },
    0
  )

  const totalMarketPrice =
    useUsersStore
      .getState()
      .worldData.actions.findMarketData(state.activeJob.itemID)?.[marketSelect][
      listingSelect
    ] * state.activeJob.build.products.totalQuantity || 0;

  const { childJobCount } = findAllChildJobCountOrIDs(
    state.activeJob.build.childJobs,
    state.temporaryChildJobs,
    state.parentChildToEdit.childJobs
  );

  return (
    <Grid container size={12} sx={{ marginTop: 2 }}>
      <Grid container size={{ xs: 12, sm: 6 }} align="center" spacing={1}>
        <MaterialTotalsWithChildJobs_MaterialPrices
          {...props}
          childJobCount={childJobCount}
          totalBuildCost={totalBuildCost}
          totalInstallCosts={totalInstallCosts}
          totalMarketPrice={totalMarketPrice}
          totalMaterialCost={totalMaterialCost}
        />
      </Grid>
      <Grid container size={{ xs: 12, sm: 6 }} align="center" spacing={1}>
        <MaterialTotalsWithMarketPrices_MaterialPrices
          {...props}
          totalMaterialCost={totalMaterialCost}
          totalInstallCosts={totalInstallCosts}
          totalMarketPrice={totalMarketPrice}
          totalBuildCost={totalBuildCost}
        />
      </Grid>
    </Grid>
  );
}
