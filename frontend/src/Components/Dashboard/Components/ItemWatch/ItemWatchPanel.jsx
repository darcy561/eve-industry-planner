import {
  Box,
  Grid,
  IconButton,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import { AddWatchItemDialogue } from "./AddItemDialogue/dialogueFrame";
import { useState } from "react";
import { AddGroupDialogue } from "./addGroupDialogue";
import { GroupSettingsDialogue } from "./groupSettings";
import { WatchlistContainer } from "./itemWatchContainer";
import useUsersStore from "../../../../Zustand/usersStore";
import ContentPanel from "../../../../Styled Components/Paper/ContentPanel";

export function ItemWatchPanel() {
  const [openDialogue, setOpenDialogue] = useState(false);
  const [watchlistItemToEdit, updateWatchlistItemToEdit] = useState(null);
  const [addNewGroupTrigger, updateAddNewGroupTrigger] = useState(false);
  const [groupSettingsTrigger, updateGroupSettingsTrigger] = useState(false);
  const [groupSettingsContent, updateGroupSettingsContent] = useState({
    name: "",
  });

  return (
    <ContentPanel title="Item Watchlist" componentName="Item Watchlist" paperSx={{ position: "relative" }}>
      <AddWatchItemDialogue
        openDialogue={openDialogue}
        setOpenDialogue={setOpenDialogue}
        watchlistItemToEdit={watchlistItemToEdit}
        updateWatchlistItemToEdit={updateWatchlistItemToEdit}
      />
      <AddGroupDialogue
        addNewGroupTrigger={addNewGroupTrigger}
        updateAddNewGroupTrigger={updateAddNewGroupTrigger}
      />
      <GroupSettingsDialogue
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
                setOpenDialogue(true);
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
            setOpenDialogue={setOpenDialogue}
            updateWatchlistItemToEdit={updateWatchlistItemToEdit}
          />
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
