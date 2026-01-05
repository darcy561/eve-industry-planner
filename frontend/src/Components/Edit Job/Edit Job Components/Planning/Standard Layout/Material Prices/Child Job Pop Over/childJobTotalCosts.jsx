import { Typography, Grid } from "@mui/material";

import { SMALL_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";

export function ChildJobMaterialTotalCosts_ChildJobPopoverFrame({
  currentMaterialPrice,
  totalCostOfMaterials,
  totalInstallCosts,
  totalCostPerItem,
}) {
  const colorSelection =
    currentMaterialPrice <= totalCostPerItem ? "error.main" : "success.main";

  return (
    <Grid container sx={{ marginTop: "20px" }}>
      <Grid container sx={{ marginTop: "5px" }} size={12}>
        <Grid
          size={{
            xs: 12,
            sm: 8
          }}>
          <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
            Total Materials
          </Typography>
        </Grid>
        <Grid
          align="right"
          size={{
            xs: 12,
            sm: 4
          }}>
          <Typography
            sx={{ typography: SMALL_TEXT_FORMAT }}
            align="right"
            color={colorSelection}
          >
            {formatNumberForLocale(totalCostOfMaterials)}
          </Typography>
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 8
          }}>
          <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
            Total Install Cost
          </Typography>
        </Grid>
        <Grid
          align="right"
          size={{
            xs: 12,
            sm: 4
          }}>
          <Typography
            sx={{ typography: SMALL_TEXT_FORMAT }}
            align="right"
            color={colorSelection}
          >
            {formatNumberForLocale(totalInstallCosts)}
          </Typography>
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 8
          }}>
          <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
            Total Estimated Cost
          </Typography>
        </Grid>
        <Grid
          align="right"
          size={{
            xs: 12,
            sm: 4
          }}>
          <Typography
            sx={{ typography: SMALL_TEXT_FORMAT }}
            align="right"
            color={colorSelection}
          >
            {formatNumberForLocale(totalCostOfMaterials + totalInstallCosts)}
          </Typography>
        </Grid>
        <Grid container sx={{ marginTop: "10px" }} size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
              {`Total Price Per Item`}
            </Typography>
          </Grid>

          <Grid
            align="right"
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: SMALL_TEXT_FORMAT }}
              align="right"
              color={colorSelection}
            >
              {formatNumberForLocale(totalCostPerItem)}
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}
