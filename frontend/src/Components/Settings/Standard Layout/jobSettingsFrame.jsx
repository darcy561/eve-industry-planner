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
import { useEffect, useState } from "react";
import { scheduleDebouncedApplicationSettingsSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../Styled Components/Select/marketListing";
import useUsersStore from "../../../Zustand/usersStore";
import { useGetAllCharacterAssets } from "../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import CustomSystemIndexes from "./Job Settings/customSystemIndexes";
import CustomExtrasFrame from "./Job Settings/customExtrasFrame";
import { getAssetLocationList } from "../../../Functions/Assets/getAssetLocations";
import { isNoAccessLocation } from "../../../Functions/Assets/assetLocationConstants";

function JobSettingsFrame() {
  const [userAssetLocationResults, updateUserAssetLocationResults] = useState(
    []
  );

  const {
    defaultMarketLocation: defaultMarket,
    defaultOrderType: defaultOrders,
    defaultStationIDForAssets: defaultAssetLocation,
    hideCompleteMaterials,
    defaultCitadelBrokersFee: citadelBrokersFee,
  } = useUsersStore((state) => state.applicationSettings);

  const characters = useUsersStore((state) => state.account.characters);

  const {
    updateDefaultMarket,
    updateDefaultOrders,
    updateDefaultAssetLocation,
    toggleHideCompleteMaterials,
    updateCitadelBrokersFee,
  } = useUsersStore((state) => state.applicationSettings.actions);

  const { isLoading: userAssetsLoading, isError: userAssetsError, data: userAssetsData } = useGetAllCharacterAssets()

  useEffect(() => {
    async function getAsset() {
      if (!userAssetsLoading && userAssetsData) {
        const { itemLocations, newEveIDs } = await getAssetLocationList(userAssetsData);
        updateUserAssetLocationResults(itemLocations);
        useUsersStore.getState().worldData.actions.addUniverseIDs(newEveIDs);
      }
    }
    getAsset();
  }, [userAssetsLoading, userAssetsData, characters]);

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
          <MarketLocationSelect
            value={defaultMarket}
            onChange={(e) => {
              updateDefaultMarket(e.id);
              scheduleDebouncedApplicationSettingsSave();
            }}
            labelText="Default Market Hub"
          />
        </Grid>
        <Grid
          align="center"
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <MarketListingSelect
            value={defaultOrders}
            onChange={(e) => {
              updateDefaultOrders(e.id);
              scheduleDebouncedApplicationSettingsSave();
            }}
            labelText="Default Market Orders"
          />
        </Grid>
        <Grid
          align="center"
          size={{
            xs: 12,
            sm: 6
          }}>
          <FormControlLabel
            label={"Hide Complete Materials"}
            labelPlacement="start"
            control={
              <Switch
                checked={hideCompleteMaterials}
                color="primary"
                onChange={() => {
                  toggleHideCompleteMaterials();
                  scheduleDebouncedApplicationSettingsSave();
                }}
              />
            }
          />
        </Grid>
        <Grid
          align="center"
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          {userAssetsLoading ? (
            <Skeleton
              variant="rectangular"
              sx={{ height: "100%", width: "100%" }}
            />
          ) : (
            <FormControl fullWidth>
              <Select
                value={userAssetLocationResults.includes(defaultAssetLocation) ? defaultAssetLocation : ""}
                variant="standard"
                onChange={(e) => {
                  if (!e.target.value) return;
                  updateDefaultAssetLocation(e.target.value);
                  scheduleDebouncedApplicationSettingsSave();
                }}
              >
                {userAssetLocationResults.map((entry) => {
                  const locationNameData = useUsersStore.getState().worldData.actions.findUniverseData(entry);
                  if (
                    !locationNameData ||
                    isNoAccessLocation(locationNameData)
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
        <Grid
          align="center"
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <TextField
            fullWidth
            defaultValue={citadelBrokersFee}
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
              updateCitadelBrokersFee(
                Math.round((Number(e.target.value) + Number.EPSILON) * 100) /
                100
              );
              scheduleDebouncedApplicationSettingsSave();
            }}
          />
        </Grid>
      </Grid>
      <CustomSystemIndexes />
      <CustomExtrasFrame />
    </Box>
  );
}

export default JobSettingsFrame;
