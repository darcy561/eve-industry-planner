import { IconButton, Typography, Grid } from "@mui/material";

import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import { STANDARD_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";

export function ChildJobSwitcher_ChildJobPopoverFrame({
  childJobObjects,
  jobDisplay,
  setJobDisplay,
}) {
  if (childJobObjects.length > 1) {
    return (
      <Grid container sx={{ marginTop: "10px" }} size={12}>
        <Grid size={1}>
          <IconButton
            disabled={jobDisplay === 0}
            onClick={() => {
              setJobDisplay((prev) => prev - 1);
            }}
          >
            <ArrowBackOutlinedIcon />
          </IconButton>
        </Grid>
        <Grid
          container
          size={10}
          sx={{
            justifyContent: "center",
            alignItems: "center"
          }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Toggle Child Jobs
          </Typography>
        </Grid>
        <Grid size={1}>
          <IconButton
            disabled={jobDisplay === childJobObjects.length}
            onClick={() => {
              setJobDisplay((prev) => prev + 1);
            }}
          >
            <ArrowForwardOutlinedIcon />
          </IconButton>
        </Grid>
      </Grid>
    );
  }
}
