import { useContext, useState } from "react";
import {
  Avatar,
  Button,
  Chip,
  FormControlLabel,
  Grid,
  Paper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import itemList from "../../../RawData/searchIndex.json";
import useBuildNewJobs from "../../../Hooks/JobHooks/useBuildNewJobs";
import fullItemList from "../../../RawData/fullItemList.json";
import uuid from "react-uuid";
import ClearIcon from "@mui/icons-material/Clear";
import { ActiveJobContext } from "../../../Context/JobContext";
import VirtualisedRecipeSearch from "../../../Styled Components/autocomplete/virtualisedRecipeSearch";

export function SearchBar({
  updateRightContentMenuContentID,
  setSkeletonElementsToDisplay,
}) {
  const { activeGroup } = useContext(ActiveJobContext);
  const [itemIDsToAdd, updateItemIDsToAdd] = useState([]);
  const [addNewGroupOnBuild, updateAddNewGroupOnBuild] = useState(false);
  const { addNewJobsToPlanner } = useBuildNewJobs();

  async function addJobs() {
    setSkeletonElementsToDisplay(addNewGroupOnBuild ? 1 : itemIDsToAdd.length);
    await addNewJobsToPlanner(itemIDsToAdd);
    updateItemIDsToAdd([]);
    updateRightContentMenuContentID(null);
    setSkeletonElementsToDisplay(0);
  }

  function addItemToSelection(inputID) {
    const newItemsToAdd = itemIDsToAdd.map((obj) => ({ ...obj }));

    const existingObject = newItemsToAdd.find((i) => i.itemID === inputID);

    if (existingObject) {
      existingObject.itemQty++;
    } else {
      newItemsToAdd.push({
        itemID: inputID,
        itemQty: 1,
        addNewGroup: addNewGroupOnBuild,
        groupID: activeGroup,
      });
    }

    updateItemIDsToAdd(newItemsToAdd);
  }

  function toggleAddNewGroup() {
    const newItemsToAdd = [...itemIDsToAdd];

    newItemsToAdd.forEach((obj) => (obj.addNewGroup = !addNewGroupOnBuild));

    updateItemIDsToAdd(newItemsToAdd);
    updateAddNewGroupOnBuild((prev) => !prev);
  }

  return (
    <Paper
      sx={{
        padding: "20px",
        marginTop: "5px",
        marginRight: { md: "10px" },
        marginLeft: { md: "10px" },
      }}
      elevation={3}
      square
    >
      <Grid container direction="row" alignItems="center">
        <Grid container item xs={12}>
          <Grid item xs={12} sx={{ marginBottom: 1 }}>
            <VirtualisedRecipeSearch
              onSelect={(value) => {
                if (!value) return;
                addItemToSelection(value.itemID);
              }}
            />
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
                label={<Typography variant="caption">Add To Group</Typography>}
                labelPlacement="bottom"
              />
            )}
          </Grid>
          <Grid container item xs={12} sx={{ marginTop: 2 }}>
            {itemIDsToAdd.map((itemObj) => {
              const itemName = fullItemList[itemObj.itemID]?.name;
              return (
                <Grid item xs={"auto"} key={uuid()}>
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
                      "& .MuiChip-deleteIcon": {
                        color: "error.main",
                      },
                      boxShadow: 3,
                    }}
                  />
                </Grid>
              );
            })}
          </Grid>
        </Grid>
      </Grid>
    </Paper>
  );
}
