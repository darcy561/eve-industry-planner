import useUsersStore from "../../../Zustand/usersStore";
import {
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { saveApplicationSettings } from "../../../Functions/Endpoints/Pirivate/userDocument";
import { useGlobalDebounce } from "../../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../../Context/debounceKeys";

export function StatusSettings({
  statusData,
  updateStatusData,
  statusSettingsTrigger,
  updateStatusSettingsTrigger,
}) {
  const { jobStatus } = useUsersStore((state) => state.users);

  const { updateJobStatus } = useUsersStore.getState().users.actions;

  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await saveApplicationSettings();
    },
    2000
  );

  return (
    <Dialog
      open={statusSettingsTrigger}
      slotProps={{
        paper: { sx: { padding: "15px" } }
      }}
    >
      <DialogTitle align="center">Settings</DialogTitle>
      <Typography variant="body2">Name:</Typography>
      <TextField
        variant="standard"
        size="small"
        defaultValue={statusData.name}
        onChange={(e) => {
          updateStatusData((prev) => ({
            ...prev,
            name: e.target.value,
          }));
        }}
      />
      <Typography variant="body2">Display Open ESI Jobs:</Typography>
      <Switch
        checked={statusData.openAPIJobs}
        color="primary"
        onChange={(e) => {
          updateStatusData((prev) => ({
            ...prev,
            openAPIJobs: e.target.checked,
          }));
        }}
      />
      <Typography variant="body2">Display Complete ESI Jobs:</Typography>
      <Switch
        checked={statusData.completeAPIJobs}
        color="primary"
        onChange={(e) => {
          updateStatusData((prev) => ({
            ...prev,
            completeAPIJobs: e.target.checked,
          }));
        }}
      />
      <DialogActions>
        <Button
          onClick={() => {
            updateStatusSettingsTrigger(false);
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={async () => {
            const index = jobStatus.findIndex((i) => i.id === statusData.id);
            const newStatusArray = jobStatus;
            newStatusArray[index] = statusData;
            updateJobStatus(newStatusArray);
            debouncedSaveSettings();
            updateStatusSettingsTrigger(false);
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
