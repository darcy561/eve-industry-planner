import { useState } from "react";
import { TabContext, TabPanel } from "@mui/lab";
import { Box, Tab, Tabs } from "@mui/material";
import { AvailableJobsTab } from "./availableJobs";
import { LinkedJobsTab } from "./linkedJobs";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { setJobLayout } from "../../../../Edit Job Hooks/jobCommands";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";
import { jobSlotsOf } from "../../../../Edit Job Hooks/jobSelectors";

export function TabPanel_Building({ jobMatches, isLoading, isError, error }) {
  // Only what the tabs draw is passed on; both read the job themselves.
  const esiState = { jobMatches, isLoading, isError, error };
  const setup = useJobDraft((job) => job.build.setup);
  const industryJobs = useJobDraft((job) => job.esi.industryJobs);
  const esiJobTab = useJobDraft((job) => job.layout.esiJobTab);
  const actions = useJobActions();

  const totalJobCount = jobSlotsOf(setup);
  const linkedJobCount = Object.keys(industryJobs).length;

  // The tab the reader last left open, or the one with something to do on it.
  const [currentTab, updateTab] = useState(
    () => esiJobTab ?? (linkedJobCount < totalJobCount ? "0" : "1"),
  );
  const handleChange = (event, newValue) => {
    updateTab(newValue);
    actions.run(setJobLayout({ esiJobTab: newValue }));
  };

  return (
    <ContentPanel
      componentName="Tab Panel"
      paperSx={{ minHeight: "35vh", padding: 1 }}
    >
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
                linkedJobCount === 1
                  ? `${linkedJobCount}/${totalJobCount} Linked ESI Job`
                  : `${linkedJobCount}/${totalJobCount} Linked ESI Jobs`
              }
              value="1"
            />
          </Tabs>
        </Box>
        <Box sx={{ width: "100%" }}>
          <TabPanel value="0">
            <AvailableJobsTab {...esiState} />
          </TabPanel>
          <TabPanel value="1">
            <LinkedJobsTab {...esiState} />
          </TabPanel>
        </Box>
      </TabContext>
    </ContentPanel>
  );
}
