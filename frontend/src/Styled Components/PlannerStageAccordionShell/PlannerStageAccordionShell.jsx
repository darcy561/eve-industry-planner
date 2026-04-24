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

import {
  PLANNER_STAGE_DROP_TYPE,
  plannerStageDroppableId,
} from "../../Context/DnDTypes";
import GLOBAL_CONFIG from "../../global-config-app";
import { plannerStageDropZoneSx } from "../../Context/plannerStageDropStyles";
import { useDnD } from "../../Components/Job Planner/Hooks/useDnD";
import { useActivePlannerDragPayload } from "../../Context/PlannerDnDProvider";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Shared workflow-stage accordion row: droppable wrapper, summary, and select-all —
 * used by Job Planner and Group planner so @dnd-kit ids and drop styling stay aligned.
 *
 * When `classicContents` and `compactContents` are set, the shell reads
 * `applicationSettings.enableCompactLayoutView` and renders the matching component with
 * `contentsProps`. Otherwise `children` is used for the details body.
 *
 * @param {Object} props
 * @param {string|number} props.stageId
 * @param {string} props.stageName
 * @param {boolean} props.expanded
 * @param {() => void} props.onToggle - Called when the accordion should toggle (MUI `onChange` is normalized to a no-arg callback).
 * @param {(event: import("react").MouseEvent) => void} props.onSelectAll
 * @param {import("react").ElementType} [props.classicContents]
 * @param {import("react").ElementType} [props.compactContents]
 * @param {Record<string, unknown>} [props.contentsProps] - Spread into whichever stage-contents component is active
 * @param {import("react").ReactNode} [props.children] - AccordionDetails body when classic/compact components are omitted
 */
export function PlannerStageAccordionShell({
  stageId,
  stageName,
  expanded,
  onToggle,
  onSelectAll,
  classicContents: ClassicContents,
  compactContents: CompactContents,
  contentsProps = {},
  children,
}) {
  const enableCompactView = useUsersStore(
    (state) => state.applicationSettings.enableCompactLayoutView
  );

  const Contents =
    ClassicContents && CompactContents
      ? enableCompactView
        ? CompactContents
        : ClassicContents
      : null;
  const { setNodeRef, isOver } = useDroppable({
    id: plannerStageDroppableId(stageId),
    data: {
      type: PLANNER_STAGE_DROP_TYPE,
      stageId,
    },
  });

  const { canDropCard } = useDnD();
  const activeDragPayload = useActivePlannerDragPayload();
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
        expanded={expanded}
        onChange={() => {
          onToggle();
        }}
        square
        spacing={1}
        id={String(stageId)}
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
                {stageName}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
              }}
            >
              <Tooltip
                title={`Select all jobs in the ${stageName} stage.`}
                arrow
                placement="bottom"
              >
                <IconButton
                  component="span"
                  color="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAll(e);
                  }}
                >
                  <SelectAllIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {Contents ? <Contents {...contentsProps} /> : children}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
