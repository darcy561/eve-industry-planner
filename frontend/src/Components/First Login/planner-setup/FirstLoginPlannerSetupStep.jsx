import { Divider, Grid, Stack, TextField, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule";
import FirstLoginCustomStructures from "./FirstLoginCustomStructures";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../Styled Components/Select/marketListing";
import { useGetAllCharacterAssets } from "../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import { getAssetLocationList } from "../../../Functions/Assets/getAssetLocations";
import { FirstLoginSetupSection } from "../shared/FirstLoginSetupSection";
import { FirstLoginJobCardPreview } from "./FirstLoginJobCardPreview";
import { FirstLoginAssetLocationSelect } from "../shared/FirstLoginAssetLocationSelect";
import {
  appShellTextFieldOutlinedSx,
  getAppShellMarketSelectProps,
} from "../../../Context/appShell";
import { FirstLoginPlannerLayoutChoice } from "./FirstLoginPlannerLayoutChoice";

export function FirstLoginPlannerSetupStep() {
  const theme = useTheme();
  const appShellMarketSelectProps = useMemo(
    () => getAppShellMarketSelectProps(theme),
    [theme],
  );

  const [userAssetLocationResults, setUserAssetLocationResults] = useState([]);

  const {
    defaultMarketLocation,
    defaultOrderType,
    defaultStationIDForAssets,
    defaultCitadelBrokersFee,
    enableCompactLayoutView,
  } = useUsersStore((state) => state.applicationSettings);
  const {
    updateDefaultMarket,
    updateDefaultOrders,
    updateDefaultAssetLocation,
    updateCitadelBrokersFee,
    setEnableCompactLayoutView,
  } = useUsersStore((state) => state.applicationSettings.actions);

  const { isLoading: userAssetsLoading, data: userAssetsData } =
    useGetAllCharacterAssets();

  useEffect(() => {
    async function loadAssetLocations() {
      if (userAssetsLoading || !userAssetsData) return;
      const { itemLocations, newEveIDs } =
        await getAssetLocationList(userAssetsData);
      setUserAssetLocationResults(itemLocations);
      useUsersStore.getState().worldData.actions.addUniverseIDs(newEveIDs);
    }
    void loadAssetLocations();
  }, [userAssetsLoading, userAssetsData]);

  return (
    <Stack spacing={2}>
      <FirstLoginSetupSection
        title="Markets, orders, assets, and broker fees"
        subtitle="Set default settings for market and material sourcing."
      >
        <Typography variant="body2" color="text.secondary">
          These settings are used as defaults within the application and are
          used to in price calculations. Asset location is used as a starting
          station when viewing asset lists.
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <MarketLocationSelect
              {...appShellMarketSelectProps}
              value={defaultMarketLocation}
              onChange={(e) => {
                updateDefaultMarket(e.id);
                scheduleDebouncedApplicationSettingsSave();
              }}
              labelText="Default Market Hub"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <MarketListingSelect
              {...appShellMarketSelectProps}
              value={defaultOrderType}
              onChange={(e) => {
                updateDefaultOrders(e.id);
                scheduleDebouncedApplicationSettingsSave();
              }}
              labelText="Default Market Orders"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FirstLoginAssetLocationSelect
              value={defaultStationIDForAssets}
              locationIds={userAssetLocationResults}
              onChange={(locationId) => {
                updateDefaultAssetLocation(locationId);
                scheduleDebouncedApplicationSettingsSave();
              }}
              labelText="Default Asset Location"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              variant="outlined"
              size="small"
              type="number"
              defaultValue={defaultCitadelBrokersFee}
              label="Citadel brokers fee"
              helperText="Percentage applied for citadel broker calculations"
              sx={(t) => appShellTextFieldOutlinedSx(t)}
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
        </Grid>
      </FirstLoginSetupSection>

      <FirstLoginSetupSection
        title="Planner layout and cards"
        subtitle="Choose the design of the job cards on the planner."
      >
        <FirstLoginPlannerLayoutChoice
          compact={enableCompactLayoutView}
          onSelectClassic={() => {
            setEnableCompactLayoutView(false);
            scheduleDebouncedApplicationSettingsSave();
          }}
          onSelectCompact={() => {
            setEnableCompactLayoutView(true);
            scheduleDebouncedApplicationSettingsSave();
          }}
        />
        <Divider sx={{ my: 1 }} />
        <Typography variant="subtitle2" color="primary">
          Preview
        </Typography>
        <FirstLoginJobCardPreview layoutCompact={enableCompactLayoutView} />
      </FirstLoginSetupSection>

      <FirstLoginSetupSection
        title="Custom structures"
        subtitle="Add structures now so new jobs use your setup."
      >
        <Typography variant="body2" color="text.secondary">
          Structures are used to define rig bonuses, taxes, and system effects
          for your industry calculations. If you skip this for now, you can
          still add or edit structures later in Settings.
        </Typography>
        <FirstLoginCustomStructures />
      </FirstLoginSetupSection>
    </Stack>
  );
}
