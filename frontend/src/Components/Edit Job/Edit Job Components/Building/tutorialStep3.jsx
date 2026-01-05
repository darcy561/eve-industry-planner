import { Typography, Grid } from "@mui/material";


export function TutorialStep3({ state }) {
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
          Now that you have acquired the items and hauled them back to your
          chosen system, it is time to build your {state.activeJob.name}. Start
          your job running within the Eve Online client.{<br />}
          {<br />}
          In the Available Jobs panel, you'll see current industry jobs from the
          Eve ESI that match your build. Use the link icon to attach relevant
          jobs, which will import installation costs to your total build costs.
          {<br />}
          {<br />}
          You can only attach the same number of ESI jobs as the job slots you
          selected in the first step.{<br />}
          {<br />}
          If you don't see any jobs available, refresh the ESI data using the
          refresh icon at the top of the page. Some jobs may take time to appear
          on the ESI.
        </Typography>
      </Grid>
    </Grid>
  );
}
