import { useState } from "react";
import { Header } from "../Header";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Box, Paper, Tab, useMediaQuery } from "@mui/material";
import { Footer } from "../Footer/Footer";
import LayoutSettingsFrame from "./Standard Layout/layoutSettingsFrame";
import JobSettingsFrame from "./Standard Layout/jobSettingsFrame";
import CustomStructuresFrame from "./Standard Layout/customStructuresFrame";
import BlueprintSettingsFrame from "./Standard Layout/blueprintSettingsFrame";

function SettingsPageV2({ colorMode }) {
  const [selectedTab, changeSelectedTab] = useState("0");

  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  function updateTab(event, newValue) {
    changeSelectedTab(newValue);
  }
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100vh",
      }}
    >
      <Header colorMode={colorMode} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          marginTop: 8,
          width: "100%",
          padding: 2,
        }}
      >
        <Paper
          square
          elevation={3}
          sx={{
            height: "100%",
            width: "100%",
            padding: 2,
            display: "flex",
            flexDirection: "column",
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
              </Box>
            </Box>
          </TabContext>
        </Paper>
        <Box sx={{ marginTop: 2 }}>
          <Footer />
        </Box>
      </Box>
    </Box>
  );
}

export default SettingsPageV2;
