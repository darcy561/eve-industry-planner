import { useContext, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import { JobStatusContext } from "../../../Context/JobContext";
import GLOBAL_CONFIG from "../../../global-config-app";
import {
  ApplicationSettingsContext,
  MultiSelectJobPlannerContext,
} from "../../../Context/LayoutContext";
import { ClassicGroupAccordionContent } from "./Classic View/ClassicGroupAccordionContent";
import { CompactGroupAccordionContent } from "./Compact View/CompactGroupAccordionContent";

function GroupAccordionFrame({
  skeletonElementsToDisplay,
  groupJobs,
  highlightedItems,
}) {
  const { jobStatus } = useContext(JobStatusContext);
  const { multiSelectJobPlanner, updateMultiSelectJobPlanner } = useContext(
    MultiSelectJobPlannerContext
  );
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const [notExpanded, updateNotExpanded] = useState([]);

  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        order: { xs: 2, md: 1 },
      }}
    >
      <Paper
        elevation={3}
        square
        sx={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {jobStatus.map((status) => {
          const statusJobs = groupJobs.filter((i) => i.jobStatus === status.id);
          if (status.id === 4) return null;
          return (
            <Accordion
              expanded={!notExpanded.includes(status.id)}
              square
              spacing={1}
              id={status.id}
              key={status.id}
              disableGutters
              sx={{
                flexGrow: 1,
                flexShrink: 0,
                "& .MuiAccordionSummary-root:hover": {
                  cursor: "default",
                },
              }}
            >
              <AccordionSummary
                expandIcon={
                  <Tooltip
                    title="Collapse/Expand Stage"
                    arrow
                    placement="bottom"
                  >
                    <IconButton
                      color="secondary"
                      onClick={() => {
                        updateNotExpanded((prev) => {
                          if (prev.includes(status.id)) {
                            return prev.filter((i) => i !== status.id);
                          } else {
                            return [...prev, status.id];
                          }
                        });
                      }}
                    >
                      <ExpandMoreIcon />
                    </IconButton>
                  </Tooltip>
                }
                aria-label="Expand Icon"
              >
                <Box
                  sx={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "row",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flex: "1 1 95%",
                      flexDirection: "row",
                    }}
                  >
                    <Typography
                      variant="h4"
                      sx={{
                        color: (theme) =>
                          theme.palette.mode === PRIMARY_THEME
                            ? "secondary"
                            : theme.palette.primary.main,
                      }}
                    >
                      {status.name}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "row",
                    }}
                  >
                    <Tooltip
                      title={`Select all jobs in the ${status.name} stage.`}
                      arrow
                      placement="bottom"
                    >
                      <IconButton
                        color="secondary"
                        onClick={() => {
                          updateMultiSelectJobPlanner([
                            ...new Set([
                              ...multiSelectJobPlanner,
                              ...statusJobs.map((job) => job.jobID),
                            ]),
                          ]);
                        }}
                      >
                        <SelectAllIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {applicationSettings.enableCompactView ? (
                  <CompactGroupAccordionContent
                    status={status}
                    statusJobs={statusJobs}
                    skeletonElementsToDisplay={skeletonElementsToDisplay}
                    highlightedItems={highlightedItems}
                  />
                ) : (
                  <ClassicGroupAccordionContent
                    status={status}
                    statusJobs={statusJobs}
                    skeletonElementsToDisplay={skeletonElementsToDisplay}
                    highlightedItems={highlightedItems}
                  />
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Paper>
    </Box>
  );
}

export default GroupAccordionFrame;
