import { Typography, Grid } from "@mui/material";

import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";
import { getTotalsDisplayColor } from "../Helpers/materialTotalsHelpers";
import { CommonTotalsRows_MaterialPrices } from "./commonTotalsRows";

export function MaterialTotalsWithChildJobs_MaterialPrices({
  state,
  childJobCount,
  totalBuildCost,
  totalInstallCosts,
  totalMarketPrice,
  totalPrice,
  alternateTotal,
}) {
  const displayChildJobData = childJobCount > 0 ? "block" : "none";
  const textStyle = { xs: "caption", sm: "body2" };
  const displayColor = getTotalsDisplayColor({
    comparisonTotal: totalPrice,
    alternateTotal,
    sellTotal: totalMarketPrice,
  });

  return (
    <Grid container sx={{ display: displayChildJobData }} size={12}>
      <Grid size={12}>
        <Typography sx={{ typography: textStyle }}>
          Total Estimated Material Price With Child Jobs
        </Typography>
        <Typography sx={{ typography: textStyle }}>
          {formatNumberForLocale(totalBuildCost)}
        </Typography>
      </Grid>
      <CommonTotalsRows_MaterialPrices
        textStyle={textStyle}
        displayColor={displayColor}
        totalInstallCosts={totalInstallCosts}
        totalPrice={totalPrice}
        totalMarketPrice={totalMarketPrice}
        totalQuantity={state.activeJob.build.products.totalQuantity}
        totalPriceLabel="Total Estimated Cost With Child Jobs"
        totalPerItemLabel="Total Estimated Price Per Item With Child Jobs"
      />
    </Grid>
  );
}
