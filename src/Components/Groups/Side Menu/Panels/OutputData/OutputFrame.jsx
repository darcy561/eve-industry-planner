import { Box, Paper, useMediaQuery } from "@mui/material";
import { useMemo } from "react";
import OutputJobCard from "./OutputCard";

function OutputJobsInfoPanel({
  groupJobs,
  updateHighlightedItem,
  highlightedItems,
}) {
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const deviceBasedWidth = deviceNotMobile ? "100%" : "60%";

  const outputJobs = useMemo(() => {
    return groupJobs.filter((job) => job.parentJob.length === 0);
  }, [groupJobs]);

  return (
    <Paper
      elevation={3}
      square
      sx={{ padding: 1, height: "100%", width: "100%", }}
    >
      <Box sx={{ height: "100%", width: deviceBasedWidth }}>
        {outputJobs.map((job) => {
          return (
            <OutputJobCard
              key={job.jobID}
              inputJob={job}
              updateHighlightedItem={updateHighlightedItem}
              highlightedItems={highlightedItems}
            />
          );
        })}
      </Box>
    </Paper>
  );
}

export default OutputJobsInfoPanel;
