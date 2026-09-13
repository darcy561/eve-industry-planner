import { Box, FormControlLabel, Grid, Switch, TextField } from "@mui/material";
import {
  PRICING_SIDE,
  PRICING_SIDES,
} from "../../../Functions/MarketData/pricingSide.js";
import ExitRouteSelect from "../../../Styled Components/Select/exitRoute";
import { scheduleDebouncedApplicationSettingsSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../Styled Components/Select/marketListing";
import AssignUsersSelect from "../../../Styled Components/Select/users";
import useUsersStore from "../../../Zustand/usersStore";
import useAssetLocations from "../../../Hooks/EveEsi/useAssetLocations";
import VirtualisedLocationSearch from "../../../Styled Components/autocomplete/virtualisedLocationSearch";
import CustomSystemIndexes from "./Job Settings/customSystemIndexes";
import CustomExtrasFrame from "./Job Settings/customExtrasFrame";
import MarketGroupPricing from "./Job Settings/marketGroupPricing";

function JobSettingsFrame() {
  const {
    defaultPricing,
    defaultStationIDForAssets: defaultAssetLocation,
    hideCompleteMaterials,
    defaultCitadelBrokersFee: citadelBrokersFee,
    defaultMarketCharacter,
  } = useUsersStore((state) => state.applicationSettings);

  const {
    updatePricingDefault,
    updateDefaultAssetLocation,
    toggleHideCompleteMaterials,
    updateCitadelBrokersFee,
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
        {PRICING_SIDES.map(({ side, noun }) => (
          <Grid
            key={side}
            container
            sx={{ paddingX: "20px" }}
            size={{ xs: 12, sm: 6 }}
          >
            <Grid align="center" size={6}>
              <MarketLocationSelect
                value={defaultPricing?.[side]?.market}
                onChange={(e) => {
                  updatePricingDefault(side, "market", e.id);
                  scheduleDebouncedApplicationSettingsSave();
                }}
                labelText={`${noun} market`}
              />
            </Grid>
            <Grid align="center" size={6}>
              {/* The selling side names a route out rather than a basis: it
                  decides which side of the book the figure comes from and
                  whether a broker fee is charged with it. */}
              {side === PRICING_SIDE.SELLING ? (
                <ExitRouteSelect
                  value={defaultPricing?.[side]?.exit}
                  onChange={(e) => {
                    updatePricingDefault(side, "exit", e.id);
                    scheduleDebouncedApplicationSettingsSave();
                  }}
                  labelText={`${noun} sold by`}
                />
              ) : (
                <MarketListingSelect
                  value={defaultPricing?.[side]?.basis}
                  onChange={(e) => {
                    updatePricingDefault(side, "basis", e.id);
                    scheduleDebouncedApplicationSettingsSave();
                  }}
                  labelText={`${noun} prices`}
                />
              )}
            </Grid>
          </Grid>
        ))}
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
                  100,
              );
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
