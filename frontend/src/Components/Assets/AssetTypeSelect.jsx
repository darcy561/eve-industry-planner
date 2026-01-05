import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { TabContext, TabPanel } from "@mui/lab";
import { CharacterAssetsPanel } from "./Character Assets/characterAssetsPanel";
import { CorporationAssetsPanel } from "./Corporation Assets/corporationAssetsPanel";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";

export function AssetTypeSelectPanel({ parentUser }) {
  const [tabSelect, updateTabSelect] = useState("0");

  function onTabChange(event, newValue) {
    updateTabSelect(newValue);
  }

  return (
    <ContentPanel
      componentName="Asset Type Select"
      paperSx={{ overflow: "hidden" }}
    >
      <TabContext value={tabSelect}>
        <Box sx={{ width: "100%" }}>
          <Tabs value={tabSelect} onChange={onTabChange} variant="fullWidth">
            <Tab label="Character Assets" value={"0"} />
            <Tab label="Corporation Assets" value={"1"} />
          </Tabs>
        </Box>
        <Box sx={{ width: "100%" }}>
          <TabPanel value={"0"} sx={{ paddingRight: 0, paddingLeft: 0 }}>
            <CharacterAssetsPanel parentUser={parentUser} />
          </TabPanel>
          <TabPanel value={"1"} sx={{ paddingRight: 0, paddingLeft: 0 }}>
            <CorporationAssetsPanel parentUser={parentUser} />
          </TabPanel>
        </Box>
      </TabContext>
    </ContentPanel>
  );
}
