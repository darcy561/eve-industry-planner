import { Typography, Grid } from "@mui/material";


export function TutorialStep2() {
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
          Now that you know what you are building, it is time to acquire the
          necessary parts.{<br />}
          {<br />}
          Use the material cards to enter the quantity and price for each item.
          Click the <b>+</b> to add entries to your job, and use the <b>X</b> to
          remove them if needed.{<br />}
          {<br />}
          For manufacturing or reaction jobs, you'll see an icon showing the
          number of child jobs. Click this to manage your child jobs.{<br />}
          {<br />}
          The total cost for each material is calculated as you add entries,
          contributing to the overall job cost and individual item price.
          {<br />}
          {<br />}
          Use the "Hide Completed Purchases" toggle to focus on items you still
          need to acquire.
        </Typography>
      </Grid>
    </Grid>
  );
}
