import { Grid } from "@mui/material";
import { MaterialTotalsWithMarketPrices_MaterialPrices } from "./Material Totals/withMarketPrices";
import { MaterialTotalsWithChildJobs_MaterialPrices } from "./Material Totals/withChildJobs";

export function MaterialTotals_MaterialPricesPanel(props) {
  const { state, totals } = props;
  const {
    childJobCount,
    totalBuildCost,
    totalInstallCosts,
    totalMarketPrice,
    totalMaterialCost,
    totalPriceMarketMode,
    totalPriceChildMode,
  } = totals;

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
          totalPrice={totalPriceChildMode}
          alternateTotal={totalPriceMarketMode}
        />
      </Grid>
      <Grid container size={{ xs: 12, sm: 6 }} align="center" spacing={1}>
        <MaterialTotalsWithMarketPrices_MaterialPrices
          {...props}
          totalMaterialCost={totalMaterialCost}
          totalInstallCosts={totalInstallCosts}
          totalMarketPrice={totalMarketPrice}
          totalBuildCost={totalBuildCost}
          totalPrice={totalPriceMarketMode}
          alternateTotal={totalPriceChildMode}
        />
      </Grid>
    </Grid>
  );
}
