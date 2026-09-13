import { Divider, Grid, Stack, TextField, Typography } from "@mui/material";
import {
  PRICING_SIDE,
  PRICING_SIDES,
} from "../../../Functions/MarketData/pricingSide.js";
import ExitRouteSelect from "../../../Styled Components/Select/exitRoute";
import { useTheme } from "@mui/material/styles";
import { useMemo } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule";
import FirstLoginCustomStructures from "./FirstLoginCustomStructures";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../Styled Components/Select/marketListing";
import useAssetLocations from "../../../Hooks/EveEsi/useAssetLocations";
import { SectionPanel } from "../../../Styled Components/Paper/SectionPanel";
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

  const {
    defaultPricing,
    defaultStationIDForAssets,
    defaultCitadelBrokersFee,
    enableCompactLayoutView,
  } = useUsersStore((state) => state.applicationSettings);
  const {
    updatePricingDefault,
    updateDefaultAssetLocation,
    updateCitadelBrokersFee,
    setEnableCompactLayoutView,
  } = useUsersStore((state) => state.applicationSettings.actions);

  const {
    locations,
    isLoading: locationsLoading,
    isError: locationsError,
  } = useAssetLocations();

  return (
    <Stack spacing={2}>
      <SectionPanel
        title="Markets, orders, assets, and broker fees"
        subtitle="Set default settings for market and material sourcing."
      >
        <Typography variant="body2" color="text.secondary">
          These settings are used as defaults within the application and are
          used to in price calculations. Asset location is used as a starting
          station when viewing asset lists.
        </Typography>
        <Grid container spacing={2}>
          {PRICING_SIDES.map(({ side, noun }) => (
            <Grid key={side} container size={{ xs: 12, md: 6 }} spacing={2}>
              <Grid size={6}>
                <MarketLocationSelect
                  {...appShellMarketSelectProps}
                  value={defaultPricing?.[side]?.market}
                  onChange={(e) => {
                    updatePricingDefault(side, "market", e.id);
                    scheduleDebouncedApplicationSettingsSave();
                  }}
                  labelText={`${noun} market`}
                />
              </Grid>
              <Grid size={6}>
                {/* The selling side names a route out rather than a basis: it
                    decides which side of the book the figure comes from and
                    whether a broker fee is charged with it. */}
                {side === PRICING_SIDE.SELLING ? (
                  <ExitRouteSelect
                    {...appShellMarketSelectProps}
                    value={defaultPricing?.[side]?.exit}
                    onChange={(e) => {
                      updatePricingDefault(side, "exit", e.id);
                      scheduleDebouncedApplicationSettingsSave();
                    }}
                    labelText={`${noun} sold by`}
                  />
                ) : (
                  <MarketListingSelect
                    {...appShellMarketSelectProps}
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
          <Grid size={{ xs: 12, md: 6 }}>
            <FirstLoginAssetLocationSelect
              value={defaultStationIDForAssets}
              locations={locations}
              isLoading={locationsLoading}
              isError={locationsError}
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
      </SectionPanel>

      <SectionPanel
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
      </SectionPanel>

      <SectionPanel
        title="Custom structures"
        subtitle="Add structures now so new jobs use your setup."
      >
        <Typography variant="body2" color="text.secondary">
          Structures are used to define rig bonuses, taxes, and system effects
          for your industry calculations. If you skip this for now, you can
          still add or edit structures later in Settings.
        </Typography>
        <FirstLoginCustomStructures />
      </SectionPanel>
    </Stack>
  );
}
