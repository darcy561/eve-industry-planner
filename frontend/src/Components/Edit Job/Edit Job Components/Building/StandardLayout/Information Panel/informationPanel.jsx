import { Typography, Grid } from "@mui/material";
import { LARGE_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { useBuildCost } from "../../../../Edit Job Hooks/useBuildCost";

export function InformationPanel() {
  const { materialCost, installCost, costPerItem } = useBuildCost();

  return (
    <ContentPanel componentName="Information Panel">
      <Grid container sx={{ width: "100%" }}>
        <Grid
          align="center"
          sx={{ marginTop: { xs: 0.5, sm: 0 } }}
          size={{
            xs: 12,
            sm: 4,
          }}
        >
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            Total Material Cost: {formatNumberForLocale(materialCost)}
          </Typography>
        </Grid>
        <Grid
          align="center"
          sx={{ marginTop: { xs: 0.5, lg: 0 } }}
          size={{
            xs: 12,
            sm: 4,
          }}
        >
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            Total Install Costs: {formatNumberForLocale(installCost)}
          </Typography>
        </Grid>
        <Grid
          align="center"
          sx={{ marginTop: { xs: 0.5, lg: 0 } }}
          size={{
            xs: 12,
            sm: 4,
          }}
        >
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
            Estimated Cost Per Item: {formatNumberForLocale(costPerItem)}
          </Typography>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
