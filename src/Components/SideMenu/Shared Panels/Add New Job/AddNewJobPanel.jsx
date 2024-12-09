import { useContext, useState } from "react";
import useRightContentDrawer from "../../Hooks/rightContentMenuHooks";
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
import fullItemList from "../../../../RawData/fullItemList.json";
import uuid from "react-uuid";
import AddShipFittingPanel from "./addFittingJobs";
import { ActiveJobContext } from "../../../../Context/JobContext";
import useBuildNewJobs from "../../../../Hooks/JobHooks/useBuildNewJobs";
import VirtualisedRecipeSearch from "../../../../Styled Components/autocomplete/virtualisedRecipeSearch";

function AddNewJobSharedContentPanel({
  hideContentPanel,
  contentID,
  updateContentID,
  setSkeletonElementsToDisplay,
  pageRequiresDrawerToBeOpen,
}) {
  const { activeGroup } = useContext(ActiveJobContext);
  const [itemIDsToAdd, updateItemIDsToAdd] = useState([]);
  const [addNewGroupOnBuild, updateAddNewGroupOnBuild] = useState(false);
  const { addNewJobsToPlanner } = useBuildNewJobs();
  const { toggleRightDrawerColapse } = useRightContentDrawer();

  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const deviceBasedWidth = deviceNotMobile ? "100%" : "60%";

  async function addJobs() {
    setSkeletonElementsToDisplay(addNewGroupOnBuild ? 1 : itemIDsToAdd.length);
    await addNewJobsToPlanner(itemIDsToAdd);
    updateItemIDsToAdd([]);
    toggleRightDrawerColapse(
      1,
      contentID,
      hideContentPanel,
      pageRequiresDrawerToBeOpen
    );
    updateContentID(null);
    setSkeletonElementsToDisplay(0);
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
        groupID: activeGroup,
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
      <Box sx={{ height: "100%", width: deviceBasedWidth }}>
        <Box
          sx={{
            height: "40%",
            width: "100%",
            overflowX: "hidden",
            overflowY: "auto",
          }}
        >
          <Grid
            container
            item
            sx={{
              alignContent: "flex-start",
            }}
          >
            <Grid container item>
              <Grid item xs={12}>
                <Typography>Add New Jobs</Typography>
              </Grid>
              <Grid
                item
                xs={12}
                sx={{
                  paddingBottom: 2,
                }}
              >
                <VirtualisedRecipeSearch onSelect={addItemToSelection} />
              </Grid>
              <Grid
                item
                xs={12}
                sx={{ display: "flex", justifyContent: "space-evenly" }}
              >
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
                {!activeGroup && (
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
            <Grid container item xs={12} sx={{}}>
              {itemIDsToAdd.map((itemObj) => {
                const itemName = fullItemList[itemObj.itemID]?.name;
                return (
                  <Grid item xs="auto" key={uuid()}>
                    <Chip
                      label={itemName}
                      size="small"
                      deleteIcon={<ClearIcon />}
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
          </Grid>
        </Box>
        <AddShipFittingPanel
          updateItemIDsToAdd={updateItemIDsToAdd}
          addNewGroupOnBuild={addNewGroupOnBuild}
        />
      </Box>
    </Paper>
  );
}

export default AddNewJobSharedContentPanel;
