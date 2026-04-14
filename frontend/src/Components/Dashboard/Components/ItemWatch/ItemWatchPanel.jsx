import {
  Box,
  Grid,
  IconButton,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import { AddWatchItemDialog } from "./AddItemDialog/dialogFrame";
import { useState } from "react";
import { AddGroupDialog } from "./addGroupDialog";
import { GroupSettingsDialog } from "./groupSettings";
import { WatchlistContainer } from "./itemWatchContainer";
import useUsersStore from "../../../../Zustand/usersStore";
import ContentPanel from "../../../../Styled Components/Paper/ContentPanel";

export function ItemWatchPanel() {
  const [openDialog, setOpenDialog] = useState(false);
  const [watchlistItemToEdit, updateWatchlistItemToEdit] = useState(null);
  const [addNewGroupTrigger, updateAddNewGroupTrigger] = useState(false);
  const [groupSettingsTrigger, updateGroupSettingsTrigger] = useState(false);
  const [groupSettingsContent, updateGroupSettingsContent] = useState({
    name: "",
  });

  return (
    <ContentPanel title="Item Watchlist" componentName="Item Watchlist" paperSx={{ position: "relative" }}>
      <AddWatchItemDialog
        openDialog={openDialog}
        setOpenDialog={setOpenDialog}
        watchlistItemToEdit={watchlistItemToEdit}
        updateWatchlistItemToEdit={updateWatchlistItemToEdit}
      />
      <AddGroupDialog
        addNewGroupTrigger={addNewGroupTrigger}
        updateAddNewGroupTrigger={updateAddNewGroupTrigger}
      />
      <GroupSettingsDialog
        groupSettingsTrigger={groupSettingsTrigger}
        updateGroupSettingsTrigger={updateGroupSettingsTrigger}
        groupSettingsContent={groupSettingsContent}
      />
      <Grid container>
        <Box sx={{ position: "absolute", top: "10px", right: "10px" }}>
          <Tooltip title="Add New Watchlist Group" arrow placement="bottom">
            <IconButton
              color="primary"
              onClick={() => {
                updateAddNewGroupTrigger((prev) => !prev);
              }}
            >
              <PlaylistAddIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Item To Watchlist" arrow placement="bottom">
            <IconButton
              color="primary"
              onClick={() => {
                setOpenDialog(true);
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <Grid container size={12}>
          <WatchlistContainer
            updateGroupSettingsTrigger={updateGroupSettingsTrigger}
            groupSettingsContent={groupSettingsContent}
            updateGroupSettingsContent={updateGroupSettingsContent}
            setOpenDialog={setOpenDialog}
            updateWatchlistItemToEdit={updateWatchlistItemToEdit}
          />
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
