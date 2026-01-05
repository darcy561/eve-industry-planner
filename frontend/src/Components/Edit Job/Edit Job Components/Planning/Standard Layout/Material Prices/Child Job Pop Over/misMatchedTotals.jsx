import { Typography, Grid } from "@mui/material";

import { SMALL_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";

export function DisplayMismatchedChildTotals_ChildJobPopoverFrame({
  materialQuantity,
  totalItemsProduced,
  totalCostPerItem,
}) {
  if (materialQuantity !== totalItemsProduced) {
    return (
      <Grid container sx={{ marginTop: "20px" }}>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
              Total Items Produced By Child Job{" "}
            </Typography>
          </Grid>
          <Grid
            align="right"
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
              {formatNumberForLocale(totalItemsProduced, { max: 0 })}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
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
            <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
              {formatNumberForLocale(totalCostPerItem)}
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    );
  }
}
