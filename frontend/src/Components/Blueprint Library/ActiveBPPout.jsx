import { Paper, Popover, Typography, Grid } from "@mui/material";
import { formatNumberForLocale, formatTimeRemaining } from "../../Functions/Helper/numberParser";

export function ActiveBPPopout({
  blueprint,
  esiJob,
  displayPopover,
  updateDisplayPopover,
}) {

  const timeRemaining = formatTimeRemaining(Date.parse(esiJob.end_date));

  return (
    <Popover
      id={blueprint.item_id}
      open={Boolean(displayPopover)}
      anchorEl={displayPopover}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{
        vertical: "bottom",
        horizontal: "right",
      }}
      onClose={() => {
        updateDisplayPopover(null);
      }}
    >
      <Paper
        square
        sx={{ padding: "20px", maxWidth: { xs: "350px", sm: "450px" } }}
      >
        <Grid container direction="row">
          <Grid sx={{ marginBottom: "10px" }} size={12}>
            <Typography variant="h5" align="center" color="primary">
              {esiJob.activity_id === 1
                ? "Manufacturing Job"
                : esiJob.activity_id === 3
                ? "Time Efficiency Research"
                : esiJob.activity_id === 4
                ? "Material Efficiency Research"
                : esiJob.activity_id === 9
                ? "Reaction Job"
                : null}
            </Typography>
          </Grid>
          <Grid container align="center" size={12}>
            <Grid size={12}>
              <Typography>Runs: {esiJob.runs}</Typography>
            </Grid>
            <Grid size={12}>
              <Typography>{esiJob.facility_name}</Typography>
            </Grid>
            <Grid size={12}>
              <Typography>
                Install Cost: {formatNumberForLocale(esiJob.cost)}
              </Typography>
            </Grid>
            <Grid size={12}>
              <Typography>
                Status:{" "}
                {timeRemaining === "complete" ? "Ready to Deliver" : "Active"}
              </Typography>
            </Grid>
            {timeRemaining !== "complete" && (
              <Grid size={12}>
                <Typography>Time Remaining: {timeRemaining}</Typography>
              </Grid>
            )}
          </Grid>
        </Grid>
      </Paper>
    </Popover>
  );
}
