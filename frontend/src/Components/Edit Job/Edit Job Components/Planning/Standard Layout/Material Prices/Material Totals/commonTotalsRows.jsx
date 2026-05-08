import { Typography, Grid } from "@mui/material";
import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";

export function CommonTotalsRows_MaterialPrices({
  textStyle,
  displayColor,
  totalInstallCosts,
  totalPrice,
  totalMarketPrice,
  totalQuantity,
  totalPriceLabel = "Total Cost",
  totalPerItemLabel = "Total Cost Per Item",
}) {
  return (
    <>
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>
          Estimated Install Cost{" "}
        </Typography>
        <Typography sx={{ typography: textStyle }}>
          {formatNumberForLocale(totalInstallCosts)}
        </Typography>
      </Grid>
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>
          {totalPriceLabel}
        </Typography>
        <Typography sx={{ typography: textStyle, color: displayColor }}>
          {formatNumberForLocale(totalPrice)}
        </Typography>
      </Grid>
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>
          {totalPerItemLabel}
        </Typography>
        <Typography sx={{ typography: textStyle, color: displayColor }}>
          {formatNumberForLocale(totalPrice / totalQuantity)}
        </Typography>
      </Grid>
      <Grid sx={{ marginTop: 1 }} size={12}>
        <Typography sx={{ typography: textStyle }}>Profit/Loss</Typography>
        <Typography sx={{ typography: textStyle, color: displayColor }}>
          {formatNumberForLocale(totalMarketPrice - totalPrice)}
        </Typography>
      </Grid>
    </>
  );
}
