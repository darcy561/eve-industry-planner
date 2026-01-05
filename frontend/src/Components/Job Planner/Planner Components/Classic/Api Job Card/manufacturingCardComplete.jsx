import { Typography, Grid } from "@mui/material";

import { STANDARD_TEXT_FORMAT } from "../../../../../Context/defaultValues";

export function IndustryESICardComplete({ job }) {
  return (
    <Grid container sx={{ paddingLeft: { xs: "0px", sm: "5px" } }} size={12}>
      <Grid container size={12}>
        <Grid size={4}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Runs:
          </Typography>
        </Grid>
        <Grid size={8}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
            {job.runs}
          </Typography>
        </Grid>
      </Grid>
      <Grid container size={12}>
        <Grid size={4}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Status:
          </Typography>
        </Grid>
        <Grid size={8}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
            Delivered
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
}
