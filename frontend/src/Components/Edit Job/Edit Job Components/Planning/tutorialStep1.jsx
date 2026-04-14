import { Typography, Grid } from "@mui/material";

export function TutorialStep1(props) {
  const { state } = props;
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
          This is your first step along the way to building your{" "}
          {state.activeJob.name}.{<br />}
          {<br />}
          Use the available options to set up the build and calculate the
          resources that are needed to complete your job.{<br />}
          {<br />}
          With some items you may also want to build the components yourself
          rather than buying these items. Clicking the i icon next to each of
          the components in the Item Cost panel will display a pop out showing
          you the total cost of the materials needed to build the component. The
          total cost is then highlighted in red or green to indicate if it is
          cheaper to buy the materials or purchase the finished product. If you
          are happy with the cost of the item then you simply use the Create Job
          button to create a new job on your planner that is linked to the
          current job you have open. This new job will automatically be created
          to make the total number of items indicated in the Raw Resources
          panel.
        </Typography>
      </Grid>
    </Grid>
  );
}
