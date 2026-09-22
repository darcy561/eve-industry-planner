import { Box, FormControlLabel, Grid, Switch } from "@mui/material";
import { scheduleDebouncedApplicationSettingsSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import AssignUsersSelect from "../../../Styled Components/Select/users";
import useUsersStore from "../../../Zustand/usersStore";
import useAssetLocations from "../../../Hooks/EveEsi/useAssetLocations";
import VirtualisedLocationSearch from "../../../Styled Components/autocomplete/virtualisedLocationSearch";
import CustomSystemIndexes from "./Job Settings/customSystemIndexes";
import CustomExtrasFrame from "./Job Settings/customExtrasFrame";
import MarketGroupPricing from "./Job Settings/marketGroupPricing";

function JobSettingsFrame() {
  const {
    defaultStationIDForAssets: defaultAssetLocation,
    hideCompleteMaterials,
    defaultMarketCharacter,
  } = useUsersStore((state) => state.applicationSettings);

  const {
    updateDefaultAssetLocation,
    toggleHideCompleteMaterials,
    setDefaultMarketCharacter,
  } = useUsersStore((state) => state.applicationSettings.actions);

  const {
    locations,
    isLoading: locationsLoading,
    isError: locationsError,
  } = useAssetLocations();

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Grid container>
        <Grid
          align="center"
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          <FormControlLabel
            label={"Hide Complete Materials"}
            labelPlacement="start"
            control={
              <Switch
                checked={hideCompleteMaterials}
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
            sm: 6,
          }}
        >
          <VirtualisedLocationSearch
            places={locations}
            value={defaultAssetLocation}
            isLoading={locationsLoading}
            isError={locationsError}
            label="Default Asset Location"
            onChange={(locationId) => {
              if (!locationId) return;
              updateDefaultAssetLocation(locationId);
              scheduleDebouncedApplicationSettingsSave();
            }}
          />
        </Grid>
        <Grid
          align="center"
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {/* The seller, not the builder: market skills and the standings grind
              usually sit on a trading alt, and a fee derived from whoever runs
              the job quotes the untrained rate on most accounts. */}
          <AssignUsersSelect
            value={defaultMarketCharacter}
            onChange={(characterHash) => {
              setDefaultMarketCharacter(characterHash);
              scheduleDebouncedApplicationSettingsSave();
            }}
            formHelperText="Default Market Character"
          />
        </Grid>
      </Grid>
      <CustomSystemIndexes />
      <CustomExtrasFrame />
      <Box sx={{ marginTop: "20px" }}>
        <MarketGroupPricing />
      </Box>
    </Box>
  );
}

export default JobSettingsFrame;
