import { Typography, Grid } from "@mui/material";

import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";
import { getTotalsDisplayColor } from "../Helpers/materialTotalsHelpers";
import { getListingModeLabel } from "../Helpers/marketLabelHelpers";
import { CommonTotalsRows_MaterialPrices } from "./commonTotalsRows";

export function MaterialTotalsWithMarketPrices_MaterialPrices({
  state,
  listingSelect,
  totalMaterialCost,
  totalInstallCosts,
  totalMarketPrice,
  totalPrice,
  alternateTotal,
}) {
  const textStyle = { xs: "caption", sm: "body2" };
  const formatedMarketTitle = getListingModeLabel(
    typeof listingSelect === "string" && listingSelect.length > 0
      ? listingSelect
      : "buy"
  );
  const displayColor = getTotalsDisplayColor({
    comparisonTotal: totalPrice,
    alternateTotal,
    sellTotal: totalMarketPrice,
  });

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
      <CommonTotalsRows_MaterialPrices
        textStyle={textStyle}
        displayColor={displayColor}
        totalInstallCosts={totalInstallCosts}
        totalPrice={totalPrice}
        totalMarketPrice={totalMarketPrice}
        totalQuantity={state.activeJob.totalQuantityProduced}
      />
    </Grid>
  );
}
