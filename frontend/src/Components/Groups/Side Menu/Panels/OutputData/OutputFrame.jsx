import { Box, useMediaQuery } from "@mui/material";
import { useMemo } from "react";
import OutputJobCard from "./OutputCard";
import ContentPanel from "../../../../../Styled Components/Paper/ContentPanel";

function OutputJobsInfoPanel({ state, actions, groupJobs }) {
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const deviceBasedWidth = deviceNotMobile ? "100%" : "60%";

  const outputJobs = useMemo(() => {
    return groupJobs.filter((job) => job.parentJobs.length === 0);
  }, [groupJobs]);

  return (
    <ContentPanel
      componentName="Output Jobs Info Panel"
      paperSx={{ padding: 1 }}
    >
      <Box sx={{ height: "100%", width: deviceBasedWidth }}>
        {outputJobs.map((job) => {
          return (
            <OutputJobCard
              key={job.jobID}
              inputJob={job}
              state={state}
              actions={actions}
            />
          );
        })}
      </Box>
    </ContentPanel>
  );
}

export default OutputJobsInfoPanel;
