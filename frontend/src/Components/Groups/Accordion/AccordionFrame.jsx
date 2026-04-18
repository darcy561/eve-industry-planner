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
import { useDroppable } from "@dnd-kit/core";
import GLOBAL_CONFIG from "../../../global-config-app";
import { ClassicGroupAccordionContent } from "./Classic View/ClassicGroupAccordionContent";
import { CompactGroupAccordionContent } from "./Compact View/CompactGroupAccordionContent";
import useUsersStore from "../../../Zustand/usersStore";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { useJobStatuses } from "../../../Hooks/useJobStatuses";
import { useDnD } from "../../../Hooks/useDnD";
import {
  PLANNER_STAGE_DROP_TYPE,
  plannerStageDroppableId,
} from "../../../Context/DnDTypes";
import { useActivePlannerDragPayload } from "../../../Context/PlannerDnDProvider";
import { plannerStageDropZoneSx } from "../../../Context/plannerStageDropStyles";

/**
 * One workflow stage on the group page: must register the same droppable ids as the job planner
 * (`planner-stage-{n}`) so @dnd-kit collision detection can resolve drops when dragging group job cards.
 */
function GroupStageAccordionRow({
  status,
  statusJobs,
  state,
  notExpanded,
  updateNotExpanded,
  enableCompactView,
}) {
  const { skeletonElementsToDisplay, highlightedItems } = state;
  const stageId = status.id;
  const { setNodeRef, isOver } = useDroppable({
    id: plannerStageDroppableId(stageId),
    data: {
      type: PLANNER_STAGE_DROP_TYPE,
      stageId,
    },
  });

  const { canDropCard } = useDnD();
  const activeDragPayload = useActivePlannerDragPayload();
  const addToMultiSelect =
    useUsersStore.getState().jobData.actions.addToMultiSelect;
  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  const canAcceptHere = Boolean(
    activeDragPayload && canDropCard(activeDragPayload, { id: stageId })
  );

  return (
    <Box
      ref={setNodeRef}
      sx={(theme) => ({
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        flexShrink: 0,
        minHeight: 0,
        ...plannerStageDropZoneSx(theme, {
          activeDragPayload,
          isOver,
          canAcceptHere,
        }),
      })}
    >
      <Accordion
        expanded={!notExpanded.includes(status.id)}
        onChange={() => {
          updateNotExpanded((prev) => {
            if (prev.includes(status.id)) {
              return prev.filter((i) => i !== status.id);
            }
            return [...prev, status.id];
          });
        }}
        square
        spacing={1}
        id={status.id}
        disableGutters
        sx={{
          flexGrow: 1,
          flexShrink: 0,
          "& .MuiAccordionSummary-root:hover": {
            cursor: activeDragPayload ? "inherit" : "default",
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
                  component="span"
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
    </Box>
  );
}

function GroupAccordionFrame({
  state, groupJobs,
}) {
  const { skeletonElementsToDisplay, highlightedItems } = state;
  const { jobStatuses } = useJobStatuses();
  const enableCompactView = useUsersStore(
    (state) => state.applicationSettings.enableCompactLayoutView
  );
  const [notExpanded, updateNotExpanded] = useState([]);

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
        {jobStatuses.map((status) => {
          const statusJobs = groupJobs.filter(
            (i) => Number(i.jobStatus) === Number(status.id)
          );
          if (status.id === 4) return null;
          return (
            <GroupStageAccordionRow
              key={status.id}
              status={status}
              statusJobs={statusJobs}
              state={{
                skeletonElementsToDisplay,
                highlightedItems,
              }}
              notExpanded={notExpanded}
              updateNotExpanded={updateNotExpanded}
              enableCompactView={enableCompactView}
            />
          );
        })}
      </Box>
    </ContentPanel>
  );
}

export default GroupAccordionFrame;
