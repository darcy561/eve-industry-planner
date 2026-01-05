import { useState } from "react";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Box, Tab, useMediaQuery } from "@mui/material";
import LayoutSettingsFrame from "./Standard Layout/layoutSettingsFrame";
import JobSettingsFrame from "./Standard Layout/jobSettingsFrame";
import CustomStructuresFrame from "./Standard Layout/customStructuresFrame";
import BlueprintSettingsFrame from "./Standard Layout/blueprintSettingsFrame";
import ReprocessingSettingsFrame from "./Standard Layout/ReprocessingSettingsFrame";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";

function SettingsPage() {
  const [selectedTab, changeSelectedTab] = useState("0");

  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  function updateTab(event, newValue) {
    changeSelectedTab(newValue);
  }
  return (
    <DefaultPageLayout>
      <ContentPanel
        componentName="Settings Page"
        paperSx={{
          overflow: "hidden",
        }}
      >
        <TabContext value={selectedTab}>
          <Box
            sx={{
              display: "flex",
              flexDirection: deviceNotMobile ? "row" : "column",
              flexGrow: 1,
              height: "100%",
            }}
          >
            <Box
              sx={{
                height: deviceNotMobile ? "100%" : "10%",
                width: deviceNotMobile ? "15%" : "100%",
                overflowY: "auto",
              }}
            >
              <TabList
                variant="scrollable"
                value={selectedTab}
                onChange={updateTab}
                orientation={deviceNotMobile ? "vertical" : "horizontal"}
                allowScrollButtonsMobile
              >
                <Tab label={"Layout Settings"} wrapped value={"0"} />
                <Tab label={"Job Settings"} wrapped value={"1"} />
                <Tab label={"Custom Structures"} wrapped value={"2"} />
                <Tab label={"Blueprint Settings"} wrapped value={"3"} />
                <Tab label={"Reprocessing Settings"} wrapped value={"4"} />
              </TabList>
            </Box>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: deviceNotMobile ? "85%" : "100%",
                overflowY: "auto",
                padding: deviceNotMobile ? 2 : 0,
              }}
            >
              <TabPanel value={"0"}>
                <LayoutSettingsFrame />
              </TabPanel>
              <TabPanel value={"1"}>
                <JobSettingsFrame />
              </TabPanel>
              <TabPanel value={"2"}>
                <CustomStructuresFrame />
              </TabPanel>
              <TabPanel value={"3"}>
                <BlueprintSettingsFrame />
              </TabPanel>
              <TabPanel value={"4"}>
                <ReprocessingSettingsFrame />
              </TabPanel>
            </Box>
          </Box>
        </TabContext>
      </ContentPanel>
    </DefaultPageLayout>
  );
}
export default SettingsPage;
