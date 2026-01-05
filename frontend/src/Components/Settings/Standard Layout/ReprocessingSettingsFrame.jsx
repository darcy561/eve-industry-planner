import { Grid } from "@mui/material";

import AssignUsersSelect from "../../../Styled Components/Select/users";
import uploadApplicationSettingsToFirebase from "../../../Functions/Firebase/uploadApplicationSettings";
import useUsersStore from "../../../Zustand/usersStore";
import { useGlobalDebounce } from "../../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../../Context/debounceKeys";

function ReprocessingSettingsFrame() {
  const defaultReprocessingCharacter = useUsersStore(
    (state) => state.applicationSettings.defaultReprocessingCharacter
  );
  const { setDefaultReprocessingCharacter } =
    useUsersStore.getState().applicationSettings.actions;

  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await uploadApplicationSettingsToFirebase();
    },
    2000
  );

  return (
    <Grid container spacing={2} alignItems="center">
      <Grid item xs={12} sm={6}>
        <AssignUsersSelect
          value={defaultReprocessingCharacter}
          onChange={async (newUserHash) => {
            setDefaultReprocessingCharacter(newUserHash);
            debouncedSaveSettings();
          }}
          formHelperText={"Default Reprocessing Character"}
        />
      </Grid> 
    </Grid>
  );
}

export default ReprocessingSettingsFrame;
