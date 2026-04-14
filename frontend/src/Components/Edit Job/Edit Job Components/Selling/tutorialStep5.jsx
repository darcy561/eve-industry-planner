import { Typography, Grid } from "@mui/material";

export function TutorialStep5() {
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
          Set up your market orders in the game as usual. Once they appear on the ESI, the Available Orders panel will show your item's orders. Link orders to your job to include broker fees in the total cost.{<br />}
          {<br />}
          After linking a market order, the New Transactions panel shows unlinked transactions from your journal at the same location. Link transactions to include associated taxes in the job cost.{<br />}
          {<br />}
          As items sell and transactions are linked, the total sales and average item price are calculated. This uses build costs, broker fees, and taxes to determine your overall profit/loss.{<br />}
          {<br />}
          Once everything is sold, you can either delete the job or archive it to save the data for future reference, just like in the previous step.
        </Typography>
      </Grid>
    </Grid>
  );
}
