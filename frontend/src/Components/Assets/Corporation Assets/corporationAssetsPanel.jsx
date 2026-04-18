import { useState } from "react";
import { TabContext, TabPanel } from "@mui/lab";
import { Tab, Tabs, useMediaQuery, Grid } from "@mui/material";

import { OfficesPage_Corporation } from "./Standard Layout/officesPage";
import { AssetLocationFlagPage_Corporation } from "./Standard Layout/assetLocationFlagPage";
import CorporationSelect from "../../../Styled Components/Select/corporations";
import useUsersStore from "../../../Zustand/usersStore";

export function CorporationAssetsPanel() {
  const [tabSelect, updateTabSelect] = useState("Offices");

  const [selectedCorporation, updateSelectedCorporation] = useState(
    useUsersStore.getState().account.actions.getMainCorporation()?.corporation_id || null
  );

  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  function onTabChange(event, newValue) {
    updateTabSelect(newValue);
  }

  return (
    <Grid container>
      <Grid align={deviceNotMobile ? "right" : "center"} size={12}>
        <CorporationSelect
          value={selectedCorporation}
          onChange={updateSelectedCorporation}
        />
      </Grid>
      <Grid size={12}>
        <TabContext value={tabSelect}>
          <Tabs
            value={tabSelect}
            onChange={onTabChange}
            variant={deviceNotMobile ? "standard" : "scrollable"}
          >
            <Tab key={"offices"} label="Offices" value="Offices" />
            <Tab key={"deliveries"} label="Deliveries" value="Deliveries" />;
            <Tab key={"asset-safety"} label="Asset Safety" value="Asset Safety" />;
          </Tabs>
          <TabPanel
            key={"offices"}
            value="Offices"
            sx={{ paddingRight: 0, paddingLeft: 0 }}
          >
            <OfficesPage_Corporation
              selectedCorporation={selectedCorporation}
            />
          </TabPanel>
          <TabPanel
            key={"deliveries"}
            value="Deliveries"
            sx={{ paddingRight: 0, paddingLeft: 0 }}
          >
            <AssetLocationFlagPage_Corporation
              selectedCorporation={selectedCorporation}
              assetLocationFlagRequest={"CorpDeliveries"}
            />
          </TabPanel>
          <TabPanel
            key={"asset-safety"}
            value="Asset Safety"
            sx={{ paddingRight: 0, paddingLeft: 0 }}
          >
            <AssetLocationFlagPage_Corporation
              selectedCorporation={selectedCorporation}
              assetLocationFlagRequest={"AssetSafety"}
            />
          </TabPanel>
        </TabContext>
      </Grid>
    </Grid>
  );
}
