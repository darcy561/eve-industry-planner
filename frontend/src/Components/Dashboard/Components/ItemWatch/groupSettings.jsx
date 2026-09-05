import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import useUsersStore from "../../../../Zustand/usersStore";
import { putWatchlistDeprecatedToApi } from "../../../../Functions/Endpoints/Private/watchlistDeprecated.js";
import DOMPurify from "dompurify";

export function GroupSettingsDialogue({
  groupSettingsTrigger,
  updateGroupSettingsTrigger,
  groupSettingsContent,
}) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const { setUserWatchlist, setUserWatchlistGroups, setUserWatchlistItems } =
    useUsersStore.getState().jobData.actions;
  const [setName, updateSetName] = useState(groupSettingsContent.name);

  useEffect(() => {
    function updateSettingsState() {
      updateSetName(groupSettingsContent.name);
    }
    updateSettingsState();
  }, [groupSettingsContent]);

  const handleClose = () => {
    updateGroupSettingsTrigger((prev) => !prev);
  };

  return (
    <Dialog open={groupSettingsTrigger} onClose={handleClose}>
      <DialogContent>
        <TextField
          defaultValue={setName}
          size="small"
          vairant="standard"
          helperText="Group Name"
          type="text"
          sx={{
            "& .MuiFormHelperText-root": {
              color: (theme) => theme.palette.secondary.main,
            },
            "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
            {
              display: "none",
            },
          }}
          onChange={(e) => {
            updateSetName(e.target.value);
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button
          color="error"
          variant="outlined"
          size="small"
          sx={{ marginRight: "20px" }}
          onClick={async () => {
            let newUserWatchlistGroups = [...userWatchlist.groups];
            let newUserWatchlistItems = [...userWatchlist.items];
            let index = newUserWatchlistGroups.findIndex(
              (i) => i.id === groupSettingsContent.id
            );
            newUserWatchlistGroups.splice(index, 1);

            newUserWatchlistItems.forEach((entry) => {
              if (entry.group === groupSettingsContent.id) {
                entry.group = 0;
              }
            });
            setUserWatchlist(newUserWatchlistItems, newUserWatchlistGroups);
            await putWatchlistDeprecatedToApi(
              newUserWatchlistGroups,
              newUserWatchlistItems
            );
            handleClose();
          }}
        >
          Delete
        </Button>
        <Button size="small" onClick={handleClose}>
          Close
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={async () => {
            let newUserWatchlistGroups = [...userWatchlist.groups];
            let index = newUserWatchlistGroups.findIndex(
              (i) => i.id === groupSettingsContent.id
            );
            newUserWatchlistGroups[index].name = DOMPurify.sanitize(setName, {
              ALLOWED_TAGS: [],
              ALLOWED_ATTR: [],
            });
            setUserWatchlistGroups(newUserWatchlistGroups);
            await putWatchlistDeprecatedToApi(
              newUserWatchlistGroups,
              userWatchlist.items
            );
            handleClose();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
