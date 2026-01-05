import { Typography, Grid } from "@mui/material";
import { LARGE_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function InformationPanel({ state }) {
  return (
    <ContentPanel componentName="Information Panel">
      <Grid container sx={{ width: "100%" }}>
        <Grid
          align="center"
          sx={{ marginTop: { xs: 0.5, sm: 0 } }}
          size={{
            xs: 12,
            sm: 4
          }}>
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            Total Material Cost:{" "}
            {formatNumberForLocale(
              state.activeJob.build.costs.totalPurchaseCost
            )}
          </Typography>
        </Grid>
        <Grid
          align="center"
          sx={{ marginTop: { xs: 0.5, lg: 0 } }}
          size={{
            xs: 12,
            sm: 4
          }}>
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            Total Install Costs:{" "}
            {formatNumberForLocale(state.activeJob.build.costs.installCosts)}
          </Typography>
        </Grid>
        <Grid
          align="center"
          sx={{ marginTop: { xs: 0.5, lg: 0 } }}
          size={{
            xs: 12,
            sm: 4
          }}>
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            Total Cost Per Item:{" "}
            {formatNumberForLocale(
              (state.activeJob.build.costs.totalPurchaseCost +
                state.activeJob.build.costs.installCosts) /
              state.activeJob.build.products.totalQuantity
            )}
          </Typography>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
