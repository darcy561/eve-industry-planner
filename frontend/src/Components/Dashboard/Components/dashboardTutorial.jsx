import { Typography, Grid } from "@mui/material";

export function TutorialDashboard() {
  return (
    <Grid container>
      <Grid size={12}>
        <Typography variant="body2">
          Welcome to your Dashboard!
          {<br />}
          {<br />}
          Here you will find a break down of the information from the jobs
          on your Job Planner. Use the navigation menu found in the top
          left hand corner to switch to the Job Planner.
          {<br />}
          {<br />}
          New Job Transactions - This displays any new transactions that
          have happened for jobs that have a market order linked to it.
          Visit the Job Planner page and edit a job for more information
          on linking market orders.
        </Typography>
      </Grid>
    </Grid>
  );
}
