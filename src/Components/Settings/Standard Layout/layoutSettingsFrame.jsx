import { useContext } from "react";
import { Box, FormControlLabel, Grid, Switch } from "@mui/material";
import { ApplicationSettingsContext } from "../../../Context/LayoutContext";
import uploadApplicationSettingsToFirebase from "../../../Functions/Firebase/uploadApplicationSettings";

function LayoutSettingsFrame() {
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );

  return (
    // <Box sx={{ width: "100%", height: "100%" }}>
      <Grid container>
        <Grid item xs={12} sm={6} align="center">
          <FormControlLabel
            label={"Enable Help Cards"}
            labelPlacement="start"
            control={
              <Switch
                checked={!applicationSettings.hideTutorials}
                color="primary"
                onChange={(e) => {
                  const newApplicationSettings =
                    applicationSettings.toggleHideTutorials();
                  updateApplicationSettings(newApplicationSettings);
                  uploadApplicationSettingsToFirebase(newApplicationSettings);
                }}
              />
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} align="center">
          <FormControlLabel
            label={"Enable Compact View"}
            labelPlacement="start"
            control={
              <Switch
                checked={applicationSettings.enableCompactView}
                onChange={(e) => {
                  const newApplicationSettings =
                    applicationSettings.toggleEnableCompactView();
                  updateApplicationSettings(newApplicationSettings);
                  uploadApplicationSettingsToFirebase(newApplicationSettings);
                }}
              />    
            }
          />
        </Grid>
      </Grid>
    // </Box>
  );
}

export default LayoutSettingsFrame;
