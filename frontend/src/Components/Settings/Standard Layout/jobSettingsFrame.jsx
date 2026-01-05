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
import uploadApplicationSettingsToFirebase from "../../../Functions/Firebase/uploadApplicationSettings";
import { useGlobalDebounce } from "../../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../../Context/debounceKeys";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../Styled Components/Select/marketListing";
import useUsersStore from "../../../Zustand/usersStore";
import { useGetAllCharacterAssets } from "../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import CustomSystemIndexes from "./Job Settings/customSystemIndexes";
import CustomExtrasFrame from "./Job Settings/customExtrasFrame";
import { getAssetLocationList } from "../../../Functions/Assets/getAssetLocations";

function JobSettingsFrame() {
  const [userAssetLocationResults, updateUserAssetLocationResults] = useState(
    []
  );

  // Global debounced save function for application settings
  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await uploadApplicationSettingsToFirebase();
    },
    2000
  );

  const {
    defaultMarket,
    defaultOrders,
    defaultAssetLocation,
    hideCompleteMaterials,
    citadelBrokersFee,
  } = useUsersStore((state) => state.applicationSettings);

  const users = useUsersStore((state) => state.users.userArray);

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
  }, [userAssetsLoading, userAssetsData, users]);

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
              debouncedSaveSettings();
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
              debouncedSaveSettings();
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
                  debouncedSaveSettings();
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
                  debouncedSaveSettings();
                }}
              >
                {userAssetLocationResults.map((entry) => {
                  const locationNameData = useUsersStore.getState().worldData.actions.findUniverseData(entry);
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
              debouncedSaveSettings();
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
