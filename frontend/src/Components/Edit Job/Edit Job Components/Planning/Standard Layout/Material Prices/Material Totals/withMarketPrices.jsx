import { Typography, Grid } from "@mui/material";

import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";

export function MaterialTotalsWithMarketPrices_MaterialPrices({
  state,
  listingSelect,
  totalMaterialCost,
  totalInstallCosts,
  totalMarketPrice,
  totalBuildCost,
}) {
  const totalPrice = totalMaterialCost + totalInstallCosts + state.activeJob.build.costs.extrasTotal;

  const textStyle = { xs: "caption", sm: "body2" };
  const formatedMarketTitle =
    listingSelect.charAt(0).toUpperCase() + listingSelect.slice(1);
  const displayColor = getDisplayColor();

  function getDisplayColor() {
    if (totalPrice < totalMarketPrice) {
      return totalBuildCost + totalInstallCosts + state.activeJob.build.costs.extrasTotal < totalPrice
        ? "orange"
        : "success.main";
    } else {
      return "error.main";
    }
  }

  return (
    <Grid container sx={{ marginTop: { xs: 2, sm: 0 } }} size={12}>
      <Grid size={12}>
        <Typography sx={{ typography: textStyle }}>
          {`Total Material ${formatedMarketTitle} Price`}
        </Typography>
        <Typography sx={{ typography: textStyle }}>
          {formatNumberForLocale(totalMaterialCost)}
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
        <Typography sx={{ typography: textStyle }}>Total Cost</Typography>
        <Typography
          sx={{
            typography: textStyle,
            color: displayColor,
          }}
        >
          {formatNumberForLocale(totalPrice)}
        </Typography>
      </Grid>
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>
          Total Cost Per Item
        </Typography>
        <Typography sx={{ typography: textStyle, color: displayColor }}>
          {formatNumberForLocale(
            totalPrice / state.activeJob.build.products.totalQuantity
          )}
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
