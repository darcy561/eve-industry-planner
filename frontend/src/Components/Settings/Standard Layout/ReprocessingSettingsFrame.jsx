import { Grid } from "@mui/material";

import AssignUsersSelect from "../../../Styled Components/Select/users";
import useUsersStore from "../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";

function ReprocessingSettingsFrame() {
  const defaultReprocessingCharacter = useUsersStore(
    (state) => state.applicationSettings.defaultReprocessingCharacter
  );
  const { setDefaultReprocessingCharacter } =
    useUsersStore.getState().applicationSettings.actions;

  return (
    <Grid container spacing={2} sx={{
      alignItems: "center"
    }}>
      <Grid item xs={12} sm={6}>
        <AssignUsersSelect
          value={defaultReprocessingCharacter}
          onChange={async (newUserHash) => {
            setDefaultReprocessingCharacter(newUserHash);
            scheduleDebouncedApplicationSettingsSave();
          }}
          formHelperText={"Default Reprocessing Character"}
        />
      </Grid>
    </Grid>
  );
}

export default ReprocessingSettingsFrame;
