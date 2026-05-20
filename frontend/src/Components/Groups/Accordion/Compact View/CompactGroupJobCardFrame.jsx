import { useMemo } from "react";
import { JobCardUiSource } from "../../../../Context/DnDTypes";
import {
  plannerDragPassThroughSx,
  usePlannerJobCardDrag,
} from "../../../Job Planner/Hooks/useDnD";
import { jobTypes } from "../../../../Context/defaultValues";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Grid,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import { grey } from "@mui/material/colors";
import GLOBAL_CONFIG from "../../../../global-config-app";
import { useNavigate } from "@tanstack/react-router";
import getTooltipContent from "./jobCardTooltips";
import useUsersStore from "../../../../Zustand/usersStore";
import deleteJobsFromPlanner from "../../../../Functions/JobPlanner/deleteMultipleJobs";
import { getJobTypeAccentColor } from "../../../../Functions/Helper/jobTypeDividerColor";
import { useJobCardLockState } from "../../../../Hooks/DocumentLock/useDocumentLockState";

export function CompactGroupJobCardFrame({
  job,
  highlightedItems,
  groupReadOnly = false,
  editReturnPageView,
}) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { multiSelect } = useUsersStore((state) => state.jobData);
  /**
   * `cardLocked` gates destructive affordances (multi-select, delete) that
   * require an exclusive lock. The Edit/View button stays enabled — the edit
   * page itself handles the read-only path via `useDocumentLock`, so we let the
   * user open the job to view its details and switch to editing if/when the
   * lock becomes available.
   *
   * `useJobCardLockState` subscribes to the per-job lock and composes the
   * group cascade flag the parent passes in, returning the scope-aware
   * read-only copy used by the Tooltip below.
   */
  const { cardLocked, reason: cardLockReason } = useJobCardLockState({
    jobID: job.jobID,
    groupReadOnly,
  });
  const { addToMultiSelect, removeFromMultiSelect } =
    useUsersStore.getState().jobData.actions;
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));
  const {
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    style: dragStyle,
  } = usePlannerJobCardDrag(job, {
    uiListSource: JobCardUiSource.groupJobObjects,
  });
  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  const jobCardChecked = useMemo(() => {
    return multiSelect.includes(job.jobID);
  }, [multiSelect]);

  const isHighlighted = highlightedItems.has(job.jobID);

  const tooltipContent = getTooltipContent(job);

  const navigate = useNavigate();

  function getCardColor(theme, jobType) {
    switch (jobType) {
      case jobTypes.manufacturing:
      case jobTypes.reaction: {
        const accent = getJobTypeAccentColor(theme, jobType);
        return theme.palette.mode === PRIMARY_THEME
          ? `linear-gradient(to right, ${accent} 30%, ${grey[900]} 60%)`
          : `linear-gradient(to right, ${accent} 30%, white 60%)`;
      }
      default:
        return "transparent";
    }
  }

  function onJobClick() {
    navigate({
      to: "/editjob/$jobID",
      params: { jobID: job.jobID },
      search: {
        activeGroup: activeGroupID,
        ...(editReturnPageView ? { pageView: editReturnPageView } : {}),
      },
    });
  }

  return (
    <Card
      ref={setNodeRef}
      style={dragStyle}
      {...listeners}
      {...attributes}
      elevation={2}
      square
      sx={(theme) => {
        const isDarkMode = theme.palette.mode === PRIMARY_THEME;
        const backgroundColor =
          jobCardChecked || isDragging || isHighlighted
            ? isDarkMode
              ? grey[900]
              : grey[300]
            : undefined;
        const borderColor = isDarkMode ? grey[700] : grey[400];
        return {
          marginTop: "5px",
          marginBottom: "5px",
          cursor: cardLocked ? "not-allowed" : "grab",
          backgroundColor,
          transition: "border 0.3s ease",
          border: `2px solid transparent`,
          "&:hover": {
            border: `2px solid ${borderColor}`,
          },
          ...plannerDragPassThroughSx(isDragging),
        };
      }}
    >
      <Grid container size={12}>
        <Grid
          align="center"
          size={{
            xs: 2,
            sm: 1,
          }}
        >
          <Checkbox
            disabled={cardLocked}
            sx={{
              color: (theme) =>
                theme.palette.mode === PRIMARY_THEME
                  ? theme.palette.primary.main
                  : theme.palette.secondary.main,
            }}
            checked={jobCardChecked}
            onChange={(event) => {
              if (event.target.checked) {
                addToMultiSelect(job.jobID);
              } else {
                removeFromMultiSelect(job.jobID);
              }
            }}
          />
        </Grid>
        <Grid container size={isMobile ? 7 : 8} sx={{
          alignItems: "center"
        }}>
          <Typography sx={{ typography: { xs: "body2", sm: "body1" } }}>
            {job.name}
          </Typography>
        </Grid>
        {!isMobile && (
          <Grid
            size={1}
            sx={{
              alignItems: "center",
              justifyContent: "center",
              display: "flex",
              minHeight: "100%"
            }}>
            <Tooltip title={tooltipContent} arrow placement="left">
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <InfoIcon fontSize="small" color="primary" />
              </Box>
            </Tooltip>
          </Grid>
        )}
        <Grid
          container
          align="center"
          size={isMobile ? 3 : 1}
          sx={{
            alignItems: "center",
            justifyContent: "center"
          }}>
          <Tooltip
            title={cardLockReason}
            arrow
            disableHoverListener={!cardLocked}
          >
            <Button
              color={cardLocked ? "warning" : "primary"}
              onClick={onJobClick}
            >
              {cardLocked ? "View" : "Edit"}
            </Button>
          </Tooltip>
        </Grid>
        {!isMobile && (
          <Grid container align="center" size={1} sx={{
            alignItems: "center"
          }}>
            <IconButton
              disabled={cardLocked}
              sx={{
                color: (theme) =>
                  theme.palette.mode === PRIMARY_THEME
                    ? theme.palette.primary.main
                    : theme.palette.secondary.main,
                "&:Hover": {
                  color: "error.main",
                },
              }}
              onClick={async () => {
                await deleteJobsFromPlanner(job.jobID);
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Grid>
        )}
        <Grid
          sx={{
            height: "2px",
            width: "100%",
            background: (theme) => getCardColor(theme, job.jobType),
          }}
          size={12}
        />
      </Grid>
    </Card>
  );
}
