import { Typography, Grid } from "@mui/material";

export function TutorialStep4({ state }) {
  return (
    <Grid container sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Grid size={12} sx={{ flexShrink: 0 }}>
        <Typography
          color="primary"
          sx={{ typography: { xs: "body2", sm: "body1" } }}
        >
          <b>Help:</b>
        </Typography>
      </Grid>
      <Grid sx={{ flex: 1, overflow: "auto", minHeight: 0 }} size={12}>
        <Typography 
          sx={{ 
            typography: { xs: "caption", sm: "body2" },
            wordWrap: "break-word",
            overflowWrap: "break-word"
          }}
        >
          You have now finished building your {state.activeJob.name}. This stage
          completes the build cost calculations before moving on to selling or
          using the item in another job.{<br />}
          {<br />}
          You'll see the total material cost, installation costs from linked
          industry jobs, and any additional costs.{<br />}
          {<br />}
          The extra costs section lets you add or subtract amounts from the
          build costs, such as hauling fees or installation costs for older jobs
          not in the ESI data.{<br />}
          {<br />}
          For logged-in users, the Archive Job button removes the job from your
          planner while keeping it in the database. This helps track build cost
          history for comparing with current market prices.
        </Typography>
      </Grid>
    </Grid>
  );
}
