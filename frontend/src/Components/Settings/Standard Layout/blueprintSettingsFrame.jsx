import {
  Avatar,
  Box,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  MenuItem,
  Select,
  Switch,
  Typography,
} from "@mui/material";
import { useState, useCallback } from "react";
import uploadApplicationSettingsToFirebase from "../../../Functions/Firebase/uploadApplicationSettings";
import { blueprintOptions } from "../../../Context/defaultValues";
import uuid from "react-uuid";
import VirtualisedRecipeSearch from "../../../Styled Components/autocomplete/virtualisedRecipeSearch";
import { useCachedData } from "../../../Hooks/useCachedData";
import { CACHED_DATA_FILES } from "../../../Context/defaultValues";
import ClearIcon from "@mui/icons-material/Clear";
import useUsersStore from "../../../Zustand/usersStore";
import { shallow } from "zustand/shallow";

function BlueprintSettingsFrame() {
  const defaultMaterialEfficiencyValue = useUsersStore(
    (state) => state.applicationSettings.defaultMaterialEfficiencyValue
  );
  const ignoreItemsWithoutBlueprints = useUsersStore(
    (state) => state.applicationSettings.ignoreItemsWithoutBlueprints
  );
  const automaticJobRecalculation = useUsersStore(
    (state) => state.applicationSettings.automaticJobRecalculation
  );
  const exemptTypeIDs = useUsersStore(
    (state) => state.applicationSettings.exemptTypeIDs
  );

  const {
    updateDefaultMaterialEfficiencyValue,
    toggleAutomaticJobRecalculation,
    addExemptTypeID,
    toggleIgnoreItemsWithoutBlueprints,
    removeExemptTypeID,
  } = useUsersStore.getState().applicationSettings.actions;

  const { data: fullItemList } = useCachedData(
    CACHED_DATA_FILES.FULL_ITEM_LIST
  );

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Grid container>
        <Grid
          align="center"
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <FormControl fullWidth>
            <Select
              value={defaultMaterialEfficiencyValue}
              variant="standard"
              onChange={async (e) => {
                if (!e.target.value) return;
                updateDefaultMaterialEfficiencyValue(e.target.value);
                await uploadApplicationSettingsToFirebase();
              }}
            >
              {blueprintOptions.me.map((i) => (
                <MenuItem key={uuid()} value={i.value}>
                  {i.label}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText variant="standard">
              Default Material Efficiency Value
            </FormHelperText>
          </FormControl>
        </Grid>
        <Grid
          align="center"
          size={{
            xs: 12,
            sm: 6
          }}>
          <FormControlLabel
            label={"Automatically Recalculate Jobs"}
            labelPlacement="start"
            control={
              <Switch
                color="primary"
                checked={automaticJobRecalculation}
                onChange={async () => {
                  toggleAutomaticJobRecalculation();
                  await uploadApplicationSettingsToFirebase();
                }}
              />
            }
          />
        </Grid>
        <Grid
          align="center"
          size={{
            xs: 12,
            sm: 6
          }}>
          <FormControlLabel
            label={"Ignore Items Without Blueprints"}
            labelPlacement="start"
            control={
              <Switch
                color="primary"
                checked={ignoreItemsWithoutBlueprints}
                onChange={async () => {
                  toggleIgnoreItemsWithoutBlueprints();
                  await uploadApplicationSettingsToFirebase();
                }}
              />
            }
          />
        </Grid>
      </Grid>
      <Divider sx={{ marginY: "20px" }} />
      <Box>
        <Box>
          <Grid container>
            <Grid
              sx={{ display: "flex", alignItems: "center" }}
              size={{
                xs: 12,
                sm: 6
              }}>
              <Typography variant="h6" color="primary">
                Materials To Ignore
              </Typography>
            </Grid>
            <Grid
              size={{
                xs: 12,
                sm: 6
              }}>
              <VirtualisedRecipeSearch
                onSelect={async (value) => {
                  addExemptTypeID(value.itemID);
                  await uploadApplicationSettingsToFirebase();
                }}
                ignoreSelectionOverides={true}
              />
            </Grid>
            <Grid sx={{ marginTop: { xs: "0px", sm: "20px" } }} size={12}>
              <Typography>
                Materials added to this list will be excluded when the application automatically builds jobs. Any child jobs they might generate will also be skipped. These items can still be added manually if needed.
              </Typography>
            </Grid>
          </Grid>
        </Box>
        <Box sx={{ marginTop: "20px" }}>
          {[...exemptTypeIDs].map((id) => {
            const itemName = fullItemList?.[id]?.name || "Unknown Item";

            return (
              <Chip
                key={id}
                label={itemName}
                size="small"
                variant="outlined"
                deleteIcon={<ClearIcon />}
                onDelete={async () => {
                  removeExemptTypeID(id);
                  await uploadApplicationSettingsToFirebase();
                }}
                avatar={
                  <Avatar
                    src={`https://image.eveonline.com/Type/${id}_32.png`}
                  />
                }
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
            );
          })}
        </Box>
      </Box>
      <Divider sx={{ marginY: "20px" }} />
    </Box>
  );
}

export default BlueprintSettingsFrame;
