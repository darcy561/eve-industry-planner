import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
  IconButton,
  Tooltip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SettingsIcon from "@mui/icons-material/Settings";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import { StatusSettings } from "./StatusSettings";
import { ClassicAccordionContents } from "./Classic/classicContents";
import { useDrop } from "react-dnd";
import { useDnD } from "../../../Hooks/useDnD";
import { ItemTypes } from "../../../Context/DnDTypes";
import { grey } from "@mui/material/colors";
import GLOBAL_CONFIG from "../../../global-config-app";
import { CompactAccordionContents } from "./Compact/CompactContents";
import useUsersStore from "../../../Zustand/usersStore";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";

export function PlannerAccordion({ skeletonElementsToDisplay }) {
  const enableCompactView = useUsersStore(
    (state) => state.applicationSettings.enableCompactView
  );
  const { userJobSnapshot, jobArray } = useUsersStore((state) => state.jobData);
  const { jobStatus, isLoggedIn } = useUsersStore((state) => state.users);
  const { updateJobStatus } = useUsersStore.getState().users.actions;
  const addToMultiSelect =
    useUsersStore.getState().jobData.actions.addToMultiSelect;
  const [statusSettingsTrigger, updateStatusSettingsTrigger] = useState(false);
  const [statusData, updateStatusData] = useState({
    id: 0,
    name: "",
    sortOrder: 0,
    expanded: true,
    openAPIJobs: false,
    completeAPIJobs: false,
  });
  const { canDropCard, recieveJobCardToStage } = useDnD();
  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  function handleExpand(statusID) {
    const index = jobStatus.findIndex((x) => x.id === statusID);
    let newStatusArray = [...jobStatus];
    newStatusArray[index].expanded = !newStatusArray[index].expanded;
    updateJobStatus(newStatusArray);
  }

  return (
    <ContentPanel
      componentName="PlannerAccordion"
      paperSx={{
        padding: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          width: "100%",
        }}
      >
        {jobStatus.map((status) => {
          const [{ isOver, canDrop }, drop] = useDrop(
            () => ({
              accept: [ItemTypes.jobCard, ItemTypes.groupCard],
              drop: (item) => {
                recieveJobCardToStage(item, status);
              },
              canDrop: (item) => canDropCard(item, status),
              collect: (monitor) => ({
                isOver: !!monitor.isOver(),
                canDrop: !!monitor.canDrop(),
              }),
            }),
            [status, userJobSnapshot, jobArray]
          );
          return (
            <Accordion
              ref={drop}
              expanded={status.expanded}
              onChange={() => handleExpand(status.id)}
              square
              spacing={1}
              id={status.id}
              key={status.id}
              disableGutters
              sx={{
                ...(canDrop &&
                  !isOver && {
                  backgroundColor: (theme) =>
                    theme.palette.mode !== "dark" ? grey[400] : grey[700],
                }),
                ...(canDrop &&
                  isOver && {
                  backgroundColor: (theme) =>
                    theme.palette.mode !== "dark" ? grey[600] : grey[600],
                }),
                "& .MuiAccordionSummary-root:hover": {
                  cursor: "default",
                },
                flexGrow: 1,
                flexShrink: 0,
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
                          addToMultiSelect(
                            userJobSnapshot
                              .filter((job) => job.jobStatus === status.id)
                              .map((job) => job.jobID)
                          )
                        }}
                      >
                        <SelectAllIcon />
                      </IconButton>
                    </Tooltip>
                    {isLoggedIn && (
                      <Tooltip
                        title="Change status settings"
                        arrow
                        placement="bottom"
                      >
                        <IconButton
                          color="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateStatusData(status);
                            updateStatusSettingsTrigger(true);
                          }}
                        >
                          <SettingsIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {enableCompactView ? (
                  <CompactAccordionContents
                    status={status}
                    skeletonElementsToDisplay={skeletonElementsToDisplay}
                  />
                ) : (
                  <ClassicAccordionContents
                    status={status}
                    skeletonElementsToDisplay={skeletonElementsToDisplay}
                  />
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
      <StatusSettings
        statusData={statusData}
        updateStatusData={updateStatusData}
        statusSettingsTrigger={statusSettingsTrigger}
        updateStatusSettingsTrigger={updateStatusSettingsTrigger}
      />
    </ContentPanel>
  );
}
