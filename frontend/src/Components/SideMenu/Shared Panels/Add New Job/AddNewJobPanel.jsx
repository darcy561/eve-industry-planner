import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Grid,
  Paper,
  Switch,
  Typography,
  useMediaQuery,
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import { useCachedData } from "../../../../Hooks/App/useCachedData";
import { CACHED_DATA_FILES } from "../../../../Context/defaultValues";
import AddShipFittingPanel from "./addFittingJobs";
import useUsersStore from "../../../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import addNewJobsToPlanner from "../../../../Functions/JobPlanner/addNewJobsToPlanner";
import VirtualisedRecipeSearch from "../../../../Styled Components/autocomplete/virtualisedRecipeSearch";
import toggleRightDrawerColapse from "../../Functions/toggleRightMenuDrawerColapse";

function AddNewJobSharedContentPanel({ state, actions }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const [itemIDsToAdd, updateItemIDsToAdd] = useState([]);
  const [addNewGroupOnBuild, updateAddNewGroupOnBuild] = useState(false);
  const queryClient = useQueryClient();
  const { data: fullItemList } = useCachedData(
    CACHED_DATA_FILES.FULL_ITEM_LIST
  );

  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const deviceBasedWidth = deviceNotMobile ? "100%" : "60%";

  async function addJobs() {
    actions.setSkeletonElementsToDisplay(
      addNewGroupOnBuild ? 1 : itemIDsToAdd.length
    );
    await addNewJobsToPlanner(itemIDsToAdd, queryClient, {
      onBeforeCommit: () => actions.setSkeletonElementsToDisplay(0),
    });
    updateItemIDsToAdd([]);
    toggleRightDrawerColapse(
      1,
      state.rightDrawerContentID,
      (value) => actions.setExpandRightDrawer(value),
      state?.pageRequiresDrawerToBeOpen ?? false
    );
    actions.setRightDrawerContentID(null);
    actions.setSkeletonElementsToDisplay(0);
  }

  function addItemToSelection({ itemID }) {
    if (!itemID) return;
    const newItemsToAdd = itemIDsToAdd.map((item) => ({ ...item }));

    const existingObject = newItemsToAdd.find((i) => i.itemID === itemID);

    if (existingObject) {
      existingObject.itemQty++;
    } else {
      newItemsToAdd.push({
        itemID: itemID,
        itemQty: 1,
        addNewGroup: addNewGroupOnBuild,
        groupID: activeGroupID,
      });
    }

    updateItemIDsToAdd(newItemsToAdd);
  }

  function toggleAddNewGroup() {
    updateItemIDsToAdd((prev) =>
      prev.map((obj) => ({ ...obj, addNewGroup: !addNewGroupOnBuild }))
    );
    updateAddNewGroupOnBuild((prev) => !prev);
  }

  return (
    <Paper
      elevation={3}
      square
      sx={{ padding: 2, height: "100%", width: "100%", overflow: "hidden" }}
    >
      <Box
        sx={{
          height: "100%",
          width: deviceBasedWidth,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search and Chips Section - 50% */}
        <Box
          sx={{
            flex: "0 0 50%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box sx={{ flexShrink: 0 }}>
            <Grid container>
              <Grid size={12}>
                <Typography>Add New Jobs</Typography>
              </Grid>
              <Grid size={12}>
                <VirtualisedRecipeSearch onSelect={addItemToSelection} />
              </Grid>
              <Grid
                sx={{
                  display: "flex",
                  justifyContent: "space-evenly",
                  paddingY: 2,
                }}
                size={12}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={itemIDsToAdd.length < 1}
                  onClick={addJobs}
                >
                  Add
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={itemIDsToAdd.length < 1}
                  onClick={() => updateItemIDsToAdd([])}
                >
                  Clear
                </Button>
                {!activeGroupID && (
                  <FormControlLabel
                    control={
                      <Switch
                        color="primary"
                        size="small"
                        checked={addNewGroupOnBuild}
                        onChange={toggleAddNewGroup}
                      />
                    }
                    label={
                      <Typography variant="caption">Add To Group</Typography>
                    }
                    labelPlacement="end"
                  />
                )}
              </Grid>
            </Grid>
          </Box>
          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              minHeight: 0,
            }}
          >
            <Grid container size={12}>
              {itemIDsToAdd.map((itemObj) => {
                const itemName = fullItemList[itemObj.itemID]?.name;
                return (
                  <Grid key={itemObj.itemID} size="auto">
                    <Chip
                      label={itemName}
                      size="small"
                      deleteIcon={<ClearIcon sx={{ color: "error.main" }} />}
                      onDelete={() => {
                        updateItemIDsToAdd((prev) =>
                          prev.filter((i) => i.itemID !== itemObj.itemID)
                        );
                      }}
                      avatar={
                        <Avatar
                          src={`https://image.eveonline.com/Type/${itemObj.itemID}_32.png`}
                        />
                      }
                      variant="outlined"
                      sx={{
                        margin: 0.5,
                        boxShadow: 3,
                        "& .MuiChip-deleteIcon": {
                          color: "error.main",
                        },
                        "&:hover": {
                          "& .MuiChip-label": {
                            color: "primary.main",
                          },
                        },
                      }}
                    />
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </Box>

        {/* Fittings Section - 50% */}
        <Box
          sx={{
            flex: "0 0 50%",
            minHeight: 0,
          }}
        >
          <AddShipFittingPanel
            updateItemIDsToAdd={updateItemIDsToAdd}
            addNewGroupOnBuild={addNewGroupOnBuild}
          />
        </Box>
      </Box>
    </Paper>
  );
}

export default AddNewJobSharedContentPanel;
