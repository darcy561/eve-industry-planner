import {
  Box,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  MenuItem,
  Select,
  Skeleton,
  Switch,
  TextField,
} from "@mui/material";
import { useContext, useEffect, useState } from "react";
import { ApplicationSettingsContext } from "../../../Context/LayoutContext";
import GLOBAL_CONFIG from "../../../global-config-app";
import uploadApplicationSettingsToFirebase from "../../../Functions/Firebase/uploadApplicationSettings";
import { listingType } from "../../../Context/defaultValues";
import { useHelperFunction } from "../../../Hooks/GeneralHooks/useHelperFunctions";
import { EveIDsContext } from "../../../Context/EveDataContext";
import { useCharAssets } from "../../../Hooks/useCharAssets";
import { UsersContext } from "../../../Context/AuthContext";

function JobSettingsFrame() {
  const { users } = useContext(UsersContext);
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );
  const { updateEveIDs } = useContext(EveIDsContext);

  const [defaultMarket, updateDefaultMarket] = useState(
    applicationSettings.defaultMarket
  );
  const [defaultOrders, updateDefaultOrders] = useState(
    applicationSettings.defaultOrders
  );
  const [userAssetLocationResults, updateUserAssetLocationResults] = useState(
    []
  );
  const [defaultAssetLocation, updateDefaultAssetLocation] = useState(
    applicationSettings.defaultAssetLocation
  );
  const [userDataFetched, updateUserDataFetched] = useState(false);
  const { findUniverseItemObject } = useHelperFunction();
  const { getAssetLocationList } = useCharAssets();

  const { MARKET_OPTIONS } = GLOBAL_CONFIG;

  useEffect(() => {
    async function getAsset() {
      updateUserDataFetched(false);
      const { itemLocations, newEveIDs } = await getAssetLocationList();
      updateUserAssetLocationResults(itemLocations);
      updateEveIDs((prev) => ({ ...prev, ...newEveIDs }));
      updateUserDataFetched(true);
    }
    getAsset();
  }, [users]);

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Grid container>
        <Grid item xs={12} sm={6} align="center" sx={{ paddingX: "20px" }}>
          <FormControl fullWidth>
            <Select
              value={defaultMarket}
              variant="standard"
              size="small"
              onChange={(e) => {
                if (!e.target.value) return;
                console.log(e.target.value);
                const newApplicationSettings =
                  applicationSettings.updateDefaultMarket(e.target.value);
                updateDefaultMarket(e.target.value);
                updateApplicationSettings(newApplicationSettings);
                uploadApplicationSettingsToFirebase(newApplicationSettings);
              }}
            >
              {MARKET_OPTIONS.map((option) => (
                <MenuItem key={option.name} value={option.id}>
                  {option.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText variant="standard">
              Default Market Hub
            </FormHelperText>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} align="center" sx={{ paddingX: "20px" }}>
          <FormControl fullWidth>
            <Select
              value={defaultOrders}
              variant="standard"
              size="small"
              onChange={(e) => {
                if (!e.target.value) return;
                const newApplicationSettings =
                  applicationSettings.updateDefaultOrders(e.target.value);
                updateDefaultOrders(e.target.value);
                updateApplicationSettings(newApplicationSettings);
                uploadApplicationSettingsToFirebase(newApplicationSettings);
              }}
            >
              {listingType.map((option) => (
                <MenuItem key={option.name} value={option.id}>
                  {option.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText variant="standard">
              Default Market Orders
            </FormHelperText>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} align="center">
          <FormControlLabel
            label={"Hide Complete Materials"}
            labelPlacement="start"
            control={
              <Switch
                checked={applicationSettings.hideCompleteMaterials}
                color="primary"
                onChange={() => {
                  const newApplicationSettings =
                    applicationSettings.toggleHideCompleteMaterials();
                  updateApplicationSettings(newApplicationSettings);
                  uploadApplicationSettingsToFirebase(newApplicationSettings);
                }}
              />
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} align="center" sx={{ paddingX: "20px" }}>
          {!userDataFetched ? (
            <Skeleton
              variant="rectangular"
              sx={{ height: "100%", width: "100%" }}
            />
          ) : (
            <FormControl fullWidth>
              <Select
                value={defaultAssetLocation}
                variant="standard"
                onChange={(e) => {
                  if (!e.target.value) return;

                  const newApplicationSettings =
                    applicationSettings.updateDefaultAssetLocation(
                      e.target.value
                    );
                  updateDefaultAssetLocation(e.target.value);
                  updateApplicationSettings(newApplicationSettings);
                  uploadApplicationSettingsToFirebase(newApplicationSettings);
                }}
              >
                {userAssetLocationResults.map((entry) => {
                  const locationNameData = findUniverseItemObject(entry);
                  if (
                    !locationNameData ||
                    locationNameData.name === "No Acces To Location"
                  )
                    return null;

                  return (
                    <MenuItem key={entry} value={entry}>
                      {locationNameData.name}
                    </MenuItem>
                  );
                })}
              </Select>
              <FormHelperText variant="standard">
                Default Asset Location
              </FormHelperText>
            </FormControl>
          )}
        </Grid>
        <Grid item xs={12} sm={6} align="center" sx={{paddingX: "20px"}}>
                  <TextField
                      fullWidth
            defaultValue={applicationSettings.citadelBrokersFee}
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
            helperText="Citadel Brokers Fee Percentage"
            type="number"
            onBlur={(e) => {
              if (!e.target.value) return;
              const newApplicationSettings =
                applicationSettings.updateCitadelBrokersFee(
                  Math.round((Number(e.target.value) + Number.EPSILON) * 100) /
                    100
                );
              updateApplicationSettings(newApplicationSettings);
              uploadApplicationSettingsToFirebase(newApplicationSettings);
            }}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default JobSettingsFrame;
