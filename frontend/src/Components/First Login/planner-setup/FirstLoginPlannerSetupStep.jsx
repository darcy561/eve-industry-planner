import { Divider, Grid, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useMemo } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule";
import CustomStructuresForm from "../../Settings/Standard Layout/Custom Structures/CustomStructuresForm";
import PricedAgainst from "../../Settings/Standard Layout/Market Locations/pricedAgainst";
import UnsavedCitadelFee from "../../Settings/Standard Layout/Market Locations/unsavedCitadelFee";
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

  const { defaultStationIDForAssets, enableCompactLayoutView } = useUsersStore(
    (state) => state.applicationSettings,
  );
  const { updateDefaultAssetLocation, setEnableCompactLayoutView } =
    useUsersStore((state) => state.applicationSettings.actions);

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
          <Grid size={12}>
            <PricedAgainst selectProps={appShellMarketSelectProps} />
          </Grid>
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
            <UnsavedCitadelFee
              fieldProps={{
                variant: "outlined",
                sx: (t) => appShellTextFieldOutlinedSx(t),
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
        <CustomStructuresForm />
      </SectionPanel>
    </Stack>
  );
}
