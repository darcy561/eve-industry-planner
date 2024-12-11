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
import { useContext, useState } from "react";
import { ApplicationSettingsContext } from "../../../Context/LayoutContext";
import uploadApplicationSettingsToFirebase from "../../../Functions/Firebase/uploadApplicationSettings";
import { blueprintOptions } from "../../../Context/defaultValues";
import uuid from "react-uuid";
import VirtualisedRecipeSearch from "../../../Styled Components/autocomplete/virtualisedRecipeSearch";
import fullItemList from "../../../RawData/fullItemList.json";
import ClearIcon from "@mui/icons-material/Clear";

function BlueprintSettingsFrame() {
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );
  const [defaultMaterialEfficiency, updateDefaultMaterialEfficiency] = useState(
    applicationSettings.defaultMaterialEfficiencyValue
  );

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Grid container>
        <Grid item xs={12} sm={6} align="center" sx={{ paddingX: "20px" }}>
          <FormControl fullWidth>
            <Select
              value={defaultMaterialEfficiency}
              variant="standard"
              onChange={(e) => {
                if (!e.target.value) return;
                const newApplicationSettings =
                  applicationSettings.updateDefaultMaterialEfficiencyValue(
                    e.target.value
                  );
                updateDefaultMaterialEfficiency(e.target.value);
                updateApplicationSettings(newApplicationSettings);
                uploadApplicationSettingsToFirebase(newApplicationSettings);
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
        <Grid item xs={12} sm={6} align="center">
          <FormControlLabel
            label={"Automatically Recalculate Jobs"}
            labelPlacement="start"
            control={
              <Switch
                disabled
                checked={applicationSettings.automaticJobRecalculation}
              />
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} align="center">
          <FormControlLabel
            label={"Ignore Items Without Blueprints"}
            labelPlacement="start"
            control={
              <Switch
                disabled
                checked={applicationSettings.ignoreItemsWithoutBlueprits}
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
              item
              xs={12}
              sm={6}
              sx={{ display: "flex", alignItems: "center" }}
            >
              <Typography variant="h6" color="primary">
                Materials To Ignore
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <VirtualisedRecipeSearch
                onSelect={(value) => {
                  const newApplicationSettings =
                    applicationSettings.addExemptTypeID(value.itemID);
                  updateApplicationSettings(newApplicationSettings);
                  uploadApplicationSettingsToFirebase(newApplicationSettings);
                }}
              />
            </Grid>
            <Grid item xs={12} sx={{ marginTop: { xs: "0px", sm: "20px" } }}>
              <Typography>
                Materials added to this list will be skipped by the application
                when it automatically builds the needed jobs, any child jobs
                that these may create will not be calculated. These items can
                still be added manually where needed.
              </Typography>
            </Grid>
          </Grid>
        </Box>
        <Box sx={{ marginTop: "20px" }}>
          {[...applicationSettings.exemptTypeIDs].map((id) => {
            const itemName = fullItemList[id]?.name || "Unknown Item";

            return (
              <Chip
                key={id}
                label={itemName}
                size="small"
                variant="outlined"
                deleteIcon={<ClearIcon />}
                onDelete={() => {
                  const newApplicationSettings =
                    applicationSettings.removeExemptTypeID(id);
                  updateApplicationSettings(newApplicationSettings);
                  uploadApplicationSettingsToFirebase(newApplicationSettings);
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
