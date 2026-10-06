import { Box } from "@mui/material";

import AssignUsersSelect from "../../../Styled Components/Select/users";
import useUsersStore from "../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";

/** The account's own reprocessing setting: the character whose skills the Reprocessing page opens with. */
function ReprocessingSettingsFrame() {
  const defaultReprocessingCharacter = useUsersStore(
    (state) =>
      state.applicationSettings.reprocessingSettings
        .defaultReprocessingCharacter,
  );
  const { setDefaultReprocessingCharacter } =
    useUsersStore.getState().applicationSettings.actions;

  return (
    <Box sx={{ width: { xs: "100%", sm: "50%" } }}>
      <AssignUsersSelect
        value={defaultReprocessingCharacter}
        onChange={(newUserHash) => {
          setDefaultReprocessingCharacter(newUserHash);
          scheduleDebouncedApplicationSettingsSave();
        }}
        formHelperText={"Default Reprocessing Character"}
      />
    </Box>
  );
}

export default ReprocessingSettingsFrame;
