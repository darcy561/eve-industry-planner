import { useState } from "react";
import { TabContext, TabPanel } from "@mui/lab";
import { Tab, Tabs, useMediaQuery, Grid } from "@mui/material";

import { AssetLocationFlagPage_Character } from "./Standard Layout/assetLocationFlagPage";
import { AssetsPage_Character } from "./Standard Layout/assetsPage";
import AssignUsersSelect from "../../../Styled Components/Select/users";

export function CharacterAssetsPanel({ parentUser }) {
  const [tabSelect, updateTabSelect] = useState("Assets");

  const [selectedCharacter, updateSelectedCharacter] = useState(
    parentUser.CharacterHash
  );
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  function onTabChange(event, newValue) {
    updateTabSelect(newValue);
  }

  return (
    <Grid container>
      <Grid align={deviceNotMobile ? "right" : "center"} size={12}>
        <AssignUsersSelect
          value={selectedCharacter}
          onChange={updateSelectedCharacter}
        />
      </Grid>
      <Grid size={12}>
        <TabContext value={tabSelect}>
          <Tabs
            value={tabSelect}
            onChange={onTabChange}
            variant={deviceNotMobile ? "standard" : "scrollable"}
          >
            <Tab key={"assets"} label="Assets" value="Assets" />;
            <Tab key={"deliveries"} label="Deliveries" value="Deliveries" />;
            <Tab
              key={"asset-safety"}
              label="Asset Safety"
              value="Asset Safety"
            />
            ;
          </Tabs>
          <TabPanel
            key={"assets"}
            value="Assets"
            sx={{ paddingRight: 0, paddingLeft: 0 }}
          >
            <AssetsPage_Character selectedCharacter={selectedCharacter} />
          </TabPanel>
          <TabPanel
            key={"deliveries"}
            value="Deliveries"
            sx={{ paddingRight: 0, paddingLeft: 0 }}
          >
            <AssetLocationFlagPage_Character
              selectedCharacter={selectedCharacter}
              assetLocationFlagRequest={"Deliveries"}
            />
          </TabPanel>
          <TabPanel
            key={"asset-safety"}
            value="Asset Safety"
            sx={{ paddingRight: 0, paddingLeft: 0 }}
          >
            <AssetLocationFlagPage_Character
              selectedCharacter={selectedCharacter}
              assetLocationFlagRequest={"AssetSafety"}
            />
          </TabPanel>
        </TabContext>
      </Grid>
    </Grid>
  );
}
