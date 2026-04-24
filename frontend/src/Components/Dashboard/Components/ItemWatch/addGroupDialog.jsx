import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  TextField,
} from "@mui/material";
import { useState } from "react";
import { putWatchlistDeprecatedToApi } from "../../../../Functions/Endpoints/Pirivate/watchlistDeprecated.js";
import useUsersStore from "../../../../Zustand/usersStore";
import { AppEvent } from "../../../../analytics/appEventNames";
import { trackAppEvent } from "../../../../analytics/trackAppEvent";
import DOMPurify from "dompurify";

export function AddGroupDialog({
  addNewGroupTrigger,
  updateAddNewGroupTrigger,
}) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const { setUserWatchlistGroups } = useUsersStore.getState().jobData.actions;
  const [setName, updateSetName] = useState("");
  const handleClose = () => {
    updateSetName("");
    updateAddNewGroupTrigger((prev) => !prev);
  };
  return (
    <Dialog open={addNewGroupTrigger} onClose={handleClose}>
      <DialogContent>
        <TextField
          defaultValue={setName}
          size="small"
          variant="standard"
          sx={{
            "& .MuiFormHelperText-root": {
              color: (theme) => theme.palette.secondary.main,
            },
            "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
              {
                display: "none",
              },
          }}
          helperText="Group Name"
          type="text"
          onChange={(e) => {
            updateSetName(e.target.value);
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={handleClose}>
          Close
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={async () => {
            let newUserWatchlistGroups = [...userWatchlist.groups];
            newUserWatchlistGroups.push({
              id: Date.now(),
              name: DOMPurify.sanitize(setName, {
                ALLOWED_TAGS: [],
                ALLOWED_ATTR: [],
              }),
              expanded: true,
            });
            newUserWatchlistGroups.sort((a, b) => {
              if (a.name < b.name) {
                return -1;
              }
              if (a.name > b.name) {
                return 1;
              }
              return 0;
            });
            setUserWatchlistGroups(newUserWatchlistGroups);
            await putWatchlistDeprecatedToApi(
              newUserWatchlistGroups,
              userWatchlist.items
            );
            trackAppEvent(AppEvent.NEW_WATCHLIST_GROUP);
            handleClose();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
