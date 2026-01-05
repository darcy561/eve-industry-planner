import { Typography, Grid } from "@mui/material";

import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";

export function MaterialTotalsWithChildJobs_MaterialPrices({
  state,
  childJobCount,
  totalBuildCost,
  totalInstallCosts,
  totalMarketPrice,
  totalMaterialCost,
}) {
  const totalPrice = totalBuildCost + totalInstallCosts + state.activeJob.build.costs.extrasTotal;

  const displayChildJobData = childJobCount > 0 ? "block" : "none";
  const textStyle = { xs: "caption", sm: "body2" };
  const displayColor = getDisplayColor();

  function getDisplayColor() {
    if (totalPrice < totalMarketPrice) {
      return totalPrice > totalMaterialCost + totalInstallCosts + state.activeJob.build.costs.extrasTotal
        ? "orange"
        : "success.main";
    } else {
      return "error.main";
    }
  }

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
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>
          Total Install Costs
        </Typography>
        <Typography sx={{ typography: textStyle }}>
          {formatNumberForLocale(totalInstallCosts)}
        </Typography>
      </Grid>
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>
          Total Estimated Cost With Child Jobs
        </Typography>
        <Typography sx={{ typography: textStyle, color: displayColor }}>
          {formatNumberForLocale(totalPrice)}
        </Typography>
      </Grid>
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>
          Total Estimated Price Per Item With Child Jobs
        </Typography>
        <Typography sx={{ typography: textStyle, color: displayColor }}>
          {formatNumberForLocale(totalPrice / state.activeJob.build.products.totalQuantity)}
        </Typography>
      </Grid>
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>Profit/Loss</Typography>
        <Typography sx={{ typography: textStyle, color: displayColor }}>
          {formatNumberForLocale(totalMarketPrice - totalPrice)}
        </Typography>
      </Grid>
    </Grid>
  );
}
