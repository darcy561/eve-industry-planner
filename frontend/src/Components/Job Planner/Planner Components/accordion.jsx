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
import SelectAllIcon from "@mui/icons-material/SelectAll";
import { useDroppable } from "@dnd-kit/core";
import { useDnD } from "../../../Hooks/useDnD";
import {
  PLANNER_STAGE_DROP_TYPE,
  plannerStageDroppableId,
} from "../../../Context/DnDTypes";
import GLOBAL_CONFIG from "../../../global-config-app";
import { plannerStageDropZoneSx } from "../../../Context/plannerStageDropStyles";
import { CompactAccordionContents } from "./Compact/CompactContents";
import { ClassicAccordionContents } from "./Classic/classicContents";
import useUsersStore from "../../../Zustand/usersStore";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { useJobStatuses } from "../../../Hooks/useJobStatuses";
import { useActivePlannerDragPayload } from "../../../Context/PlannerDnDProvider";

function PlannerStageAccordionRow({
  status,
  skeletonElementsToDisplay,
  enableCompactView,
  userJobSnapshot,
  toggleExpanded,
}) {
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
        expanded={status.expanded}
        onChange={() => toggleExpanded(status.id)}
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
                    addToMultiSelect(
                      userJobSnapshot
                        .filter(
                          (job) =>
                            Number(job.jobStatus) === Number(status.id)
                        )
                        .map((job) => job.jobID)
                    );
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
    </Box>
  );
}

export function PlannerAccordion({ skeletonElementsToDisplay }) {
  const enableCompactView = useUsersStore(
    (state) => state.applicationSettings.enableCompactLayoutView
  );
  const userJobSnapshot = useUsersStore((state) => state.jobData.userJobSnapshot);
  const { jobStatuses, toggleExpanded } = useJobStatuses();

  return (
    <ContentPanel
      componentName="PlannerAccordion"
      paperSx={{
        padding: 0,
      }}
      contentGridSx={{
        overflow: "visible",
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
        {jobStatuses.map((status) => (
          <PlannerStageAccordionRow
            key={status.id}
            status={status}
            skeletonElementsToDisplay={skeletonElementsToDisplay}
            enableCompactView={enableCompactView}
            userJobSnapshot={userJobSnapshot}
            toggleExpanded={toggleExpanded}
          />
        ))}
      </Box>
    </ContentPanel>
  );
}
