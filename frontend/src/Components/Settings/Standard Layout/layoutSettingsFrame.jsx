import { FormControlLabel, Switch, Grid } from "@mui/material";

import { useGlobalDebounce } from "../../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../../Context/debounceKeys";
import useUsersStore from "../../../Zustand/usersStore";
import uploadApplicationSettingsToFirebase from "../../../Functions/Firebase/uploadApplicationSettings";

function LayoutSettingsFrame() {
  const { hideTutorials, enableCompactView } = useUsersStore(
    (state) => state.applicationSettings
  );

  const { toggleHideTutorials, toggleEnableCompactView } =
    useUsersStore((state) => state.applicationSettings.actions);

  // Global debounced save function
  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await uploadApplicationSettingsToFirebase();
    },
    2000
  );

  return (
    <Grid container>
      <Grid
        align="center"
        size={{
          xs: 12,
          sm: 6
        }}>
        <FormControlLabel
          label={"Enable Help Cards"}
          labelPlacement="start"
          control={
            <Switch
              checked={!hideTutorials}
              color="primary"
              onChange={() => {
                toggleHideTutorials();
                debouncedSaveSettings();
              }}
            />
          }
        />
      </Grid>
      <Grid
        align="center"
        size={{
          xs: 12,
          sm: 6
        }}>
        <FormControlLabel
          label={"Enable Compact View"}
          labelPlacement="start"
          control={
            <Switch
              checked={enableCompactView}
              onChange={() => {
                toggleEnableCompactView();
                debouncedSaveSettings();
              }}
            />
          }
        />
      </Grid>
    </Grid>
  );
}

export default LayoutSettingsFrame;
