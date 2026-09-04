import { useState } from "react";
import { TabContext, TabPanel } from "@mui/lab";
import { Box, Tab, Tabs } from "@mui/material";
import { AvailableJobsTab } from "./availableJobs";
import { LinkedJobsTab } from "./linkedJobs";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function TabPanel_Building(props) {
  const { state, actions, jobMatches } = props;
  const [currentTab, updateTab] = useState(initialTab());

  const totalJobCount = state.activeJob.totalJobSlots;

  function initialTab() {
    if (state.activeJob.layout.esiJobTab) {
      return state.activeJob.layout.esiJobTab;
    } else if (state.activeJob.apiJobs.size < state.activeJob.totalJobSlots) {
      return "0";
    } else {
      return "1";
    }
  }
  const handleChange = (event, newValue) => {
    updateTab(newValue);
    state.activeJob.layout.esiJobTab = newValue;
    actions.updateActiveJob(state.activeJob);
  };

  return (
    <ContentPanel componentName="Tab Panel" paperSx={{ minHeight: "35vh", padding: 1 }}>
      <TabContext value={currentTab}>
        <Box sx={{ width: "100%" }}>
          <Tabs value={currentTab} onChange={handleChange} variant="fullWidth">
            <Tab
              label={
                jobMatches.length === 1
                  ? `${jobMatches.length} Available ESI Job`
                  : `${jobMatches.length} Available ESI Jobs`
              }
              value="0"
            />
            <Tab
              label={
                state.activeJob.build.costs.linkedJobs.length === 1
                  ? `${state.activeJob.build.costs.linkedJobs.length}/${totalJobCount} Linked ESI Job`
                  : `${state.activeJob.build.costs.linkedJobs.length}/${totalJobCount} Linked ESI Jobs`
              }
              value="1"
            />
          </Tabs>
        </Box>
        <Box sx={{ width: "100%" }}>
          <TabPanel value="0">
            <AvailableJobsTab {...props} />
          </TabPanel>
          <TabPanel value="1">
            <LinkedJobsTab {...props} />
          </TabPanel>
        </Box>
      </TabContext>
    </ContentPanel>
  );
}
