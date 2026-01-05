import { Typography, Grid } from "@mui/material";
import { STANDARD_TEXT_FORMAT } from "../../../Context/defaultValues";

export function TutorialContent_JobPlanner() {
  return (
    <Grid container spacing={2} sx={{ height: "100%", width: "100%" }}>
      <Grid size={12}>
        <Grid container spacing={2} direction="column">
          <Grid size={12}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Welcome to the Job Planner!
            </Typography>
          </Grid>

          <Grid size={12}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              The Job Planner is organised into five stages, with each of material represented as a job card. As you progress through the process of building materials, it moves through each stage in the planner. To get started, add new jobs by clicking "Add New Job" from the menu on the left.
            </Typography>
          </Grid>

          <Grid size={12}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Use the checkbox in the corner of job cards to select single or multiple cards and quickly apply actions from the options menu. Hover over each button for more details about its functionality.
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}
