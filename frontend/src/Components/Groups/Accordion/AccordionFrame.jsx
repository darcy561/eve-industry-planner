import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import GLOBAL_CONFIG from "../../../global-config-app";
import { ClassicGroupAccordionContent } from "./Classic View/ClassicGroupAccordionContent";
import { CompactGroupAccordionContent } from "./Compact View/CompactGroupAccordionContent";
import useUsersStore from "../../../Zustand/usersStore";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";

function GroupAccordionFrame({
  state, groupJobs,
}) {
  const { skeletonElementsToDisplay, highlightedItems } = state;
  const jobStatus = useUsersStore((state) => state.users.jobStatus);
  const addToMultiSelect =
    useUsersStore.getState().jobData.actions.addToMultiSelect;
  const enableCompactView = useUsersStore(
    (state) => state.applicationSettings.enableCompactLayoutView
  );
  const [notExpanded, updateNotExpanded] = useState([]);

  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  return (
    <ContentPanel
      componentName="Group Accordion Frame"
      paperSx={{ padding: 0 }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          width: "100%",
          height: "100%",
        }}
      >
        {jobStatus.map((status) => {
          const statusJobs = groupJobs.filter((i) => i.jobStatus === status.id);
          if (status.id === 4) return null;
          return (
            <Accordion
              expanded={!notExpanded.includes(status.id)}
              onChange={() => {
                updateNotExpanded((prev) => {
                  if (prev.includes(status.id)) {
                    return prev.filter((i) => i !== status.id);
                  } else {
                    return [...prev, status.id];
                  }
                });
              }}
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
                    <ExpandMoreIcon />
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
                      component="span"
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
                        onClick={(e) => {
                          e.stopPropagation();
                          addToMultiSelect(statusJobs.map((job) => job.jobID));
                        }}
                      >
                        <SelectAllIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {enableCompactView ? (
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
      </Box>
    </ContentPanel>
  );
}

export default GroupAccordionFrame;
