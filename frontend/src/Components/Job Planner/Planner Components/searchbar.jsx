import { useState } from "react";
import {
  Button,
  Chip,
  FormControlLabel,
  Grid,
  Switch,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useItemList, useItemNames } from "../../../Hooks/Static/useItems";
import ClearIcon from "@mui/icons-material/Clear";
import useUsersStore from "../../../Zustand/usersStore";
import VirtualisedRecipeSearch from "../../../Styled Components/autocomplete/virtualisedRecipeSearch";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { useActiveGroupLockReadOnly } from "../../../Hooks/DocumentLock/useDocumentLockState";
import addNewJobsToPlanner from "../../../Functions/JobPlanner/addNewJobsToPlanner";
import EveImageAvatar from "../../../Styled Components/Avatar/EveImageAvatar";

export function SearchBar({ actions }) {
  const readOnly = useActiveGroupLockReadOnly();
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const [itemIDsToAdd, updateItemIDsToAdd] = useState([]);
  const [addNewGroupOnBuild, updateAddNewGroupOnBuild] = useState(false);
  const queryClient = useQueryClient();
  const { isLoading, isError } = useItemList();
  const itemNames = useItemNames(itemIDsToAdd.map(({ itemID }) => itemID));

  async function addJobs() {
    if (isLoading) return;
    actions.setSkeletonElementsToDisplay(
      addNewGroupOnBuild ? 1 : itemIDsToAdd.length,
    );
    await addNewJobsToPlanner(itemIDsToAdd, queryClient, {
      onBeforeCommit: () => actions.setSkeletonElementsToDisplay(0),
    });
    updateItemIDsToAdd([]);
    actions.setRightDrawerContentID(null);
    actions.setSkeletonElementsToDisplay(0);
  }

  function addItemToSelection(inputID) {
    if (isLoading) return;
    const newItemsToAdd = itemIDsToAdd.map((obj) => ({ ...obj }));

    const existingObject = newItemsToAdd.find((i) => i.itemID === inputID);

    if (existingObject) {
      existingObject.itemQty++;
    } else {
      newItemsToAdd.push({
        itemID: inputID,
        itemQty: 1,
        addNewGroup: addNewGroupOnBuild,
        groupID: activeGroupID,
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
    <ContentPanel
      componentName="SearchBar"
      isLoading={isLoading}
      isError={isError}
    >
      <Grid
        container
        sx={{
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <Grid container size={12}>
          <Grid sx={{ marginBottom: 1 }} size={12}>
            <VirtualisedRecipeSearch
              onSelect={(value) => {
                if (!value || readOnly) return;
                addItemToSelection(value.itemID);
              }}
            />
          </Grid>
          <Grid
            sx={{ display: "flex", justifyContent: "space-evenly" }}
            size={12}
          >
            <Button
              size="small"
              variant="contained"
              disabled={readOnly || itemIDsToAdd.length < 1}
              onClick={addJobs}
            >
              Add
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={readOnly || itemIDsToAdd.length < 1}
              onClick={() => updateItemIDsToAdd([])}
            >
              Clear
            </Button>
            {!activeGroupID && (
              <FormControlLabel
                control={
                  <Switch
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
          <Grid container sx={{ marginTop: 2 }} size={12}>
            {itemIDsToAdd.map((itemObj) => {
              const itemName = itemNames[itemObj.itemID];
              return (
                <Grid key={itemObj.itemID} size="auto">
                  <Chip
                    label={itemName}
                    size="small"
                    deleteIcon={<ClearIcon />}
                    onDelete={() => {
                      updateItemIDsToAdd((prev) =>
                        prev.filter((i) => i.itemID !== itemObj.itemID),
                      );
                    }}
                    avatar={<EveImageAvatar type={itemObj.itemID} size={18} />}
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
    </ContentPanel>
  );
}
