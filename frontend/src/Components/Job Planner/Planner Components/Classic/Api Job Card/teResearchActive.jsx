import { Typography, Grid } from "@mui/material";
import { formatTimeRemaining } from "../../../../../Functions/Helper/numberParser";
import { STANDARD_TEXT_FORMAT } from "../../../../../Context/defaultValues";

export function TeResearchESICardActive({ job }) {
  const timeRemaining = formatTimeRemaining(Date.parse(job.end_date));


  return (
    <Grid container sx={{ paddingLeft: { xs: "0px", sm: "5px" } }} size={12}>
      <Grid container size={12}>
        <Grid size={8}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Time Efficiency:
          </Typography>
        </Grid>
        <Grid size={4}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
            {job.runs}
          </Typography>
        </Grid>
      </Grid>
      <Grid container size={12}>
        <Grid size={4}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Remaining:
          </Typography>
        </Grid>
        <Grid size={8}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
            {timeRemaining !== "Complete" ? timeRemaining : "Ready To Deliver"}
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
}
