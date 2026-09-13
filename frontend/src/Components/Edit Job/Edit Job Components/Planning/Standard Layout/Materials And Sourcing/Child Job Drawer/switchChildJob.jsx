import { IconButton, Typography, Grid } from "@mui/material";
import ExplainerTooltip from "../../../../../../../Styled Components/Tooltip/ExplainerTooltip";

import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import { STANDARD_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";

export function ChildJobSwitcher({
  childJobObjects,
  jobDisplay,
  setJobDisplay,
}) {
  if (childJobObjects.length > 1) {
    return (
      <Grid container sx={{ marginTop: "10px" }} size={12}>
        <Grid size={1}>
          <ExplainerTooltip title="Previous child job">
            <IconButton
              aria-label="Previous child job"
              disabled={jobDisplay === 0}
              onClick={() => {
                setJobDisplay((prev) => prev - 1);
              }}
            >
              <ArrowBackOutlinedIcon />
            </IconButton>
          </ExplainerTooltip>
        </Grid>
        <Grid
          container
          size={10}
          sx={{
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* Which of them, not just that there are several: the arrows are
              otherwise the only clue that the drawer holds more than one. */}
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {`Child job ${jobDisplay + 1} of ${childJobObjects.length}`}
          </Typography>
        </Grid>
        <Grid size={1}>
          <ExplainerTooltip title="Next child job">
            <IconButton
              aria-label="Next child job"
              disabled={jobDisplay >= childJobObjects.length - 1}
              onClick={() => {
                setJobDisplay((prev) => prev + 1);
              }}
            >
              <ArrowForwardOutlinedIcon />
            </IconButton>
          </ExplainerTooltip>
        </Grid>
      </Grid>
    );
  }
}
