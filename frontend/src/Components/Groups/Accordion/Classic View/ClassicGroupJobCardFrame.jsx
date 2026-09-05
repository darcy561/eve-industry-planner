import { useMemo } from "react";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Grid,
  Grow,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { grey } from "@mui/material/colors";
import { jobTypes, STANDARD_TEXT_FORMAT } from "../../../../Context/defaultValues";
import GroupStep2JobCard from "./JobCards/groupStep2";
import GroupStep3JobCard from "./JobCards/groupStep3";
import GroupStep4JobCard from "./JobCards/groupStep4";
import GroupStep5JobCard from "./JobCards/groupStep5";
import { JobCardUiSource } from "../../../../Context/DnDTypes";
import {
  plannerDragPassThroughSx,
  usePlannerJobCardDrag,
} from "../../../Job Planner/Hooks/useDnD";
import GLOBAL_CONFIG from "../../../../global-config-app";
import GroupStep1JobCard from "./JobCards/groupStep1";
import { useNavigate } from "@tanstack/react-router";
import useUsersStore from "../../../../Zustand/usersStore";
import deleteJobsFromPlanner from "../../../../Functions/JobPlanner/deleteMultipleJobs";
import ContentPanel from "../../../../Styled Components/Paper/ContentPanel";
import { getJobTypeAccentColour } from "../../../../Functions/Helper/jobTypeDividerColour";
import { useJobCardLockState } from "../../../../Hooks/DocumentLock/useDocumentLockState";

function DisplaySwitch({ job }) {
  switch (job.jobStatus) {
    case 0:
      return <GroupStep1JobCard job={job} />;
    case 1:
      return <GroupStep2JobCard job={job} />;
    case 2:
      return <GroupStep3JobCard job={job} />;
    case 3:
      return <GroupStep4JobCard job={job} />;
    case 4:
      return <GroupStep5JobCard job={job} />;
    default:
      return <GroupStep1JobCard job={job} />;
  }
}

export function ClassicGroupJobCardFrame({
  job,
  highlightedItems,
  groupReadOnly = false,
  editReturnPageView,
}) {
  const { multiSelect, activeGroupID } = useUsersStore((state) => state.jobData);
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
    jobLockSubordinateToGroup: true,
  });
  const { addToMultiSelect, removeFromMultiSelect, getActiveGroupObject } =
    useUsersStore.getState().jobData.actions;
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
  const theme = useTheme();

  const activeGroupObject = getActiveGroupObject();

  const jobCardChecked = useMemo(() => {
    return multiSelect.includes(job.jobID);
  }, [multiSelect]);

  const isHighlighted = highlightedItems.has(job.jobID);

  const jobMarkedAsComplete = useMemo(() => {
    return activeGroupObject?.areComplete.has(job.jobID);
  }, [activeGroupObject]);

  const navigate = useNavigate();

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

  const paperSxStyles = useMemo(() => {
    const isDarkMode = theme.palette.mode === PRIMARY_THEME;
    const backgroundColor =
      jobCardChecked || isDragging || isHighlighted
        ? isDarkMode
          ? grey[900]
          : grey[300]
        : undefined;
    const borderColor = isDarkMode ? grey[700] : grey[400];
    return {
      padding: 0,
      cursor: cardLocked ? "not-allowed" : "grab",
      backgroundColor,
      transition: "border 0.3s ease",
      border: `2px solid transparent`,
      "&:hover": {
        border: `2px solid ${borderColor}`,
      },
      "& .MuiGrid-container": {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        flex: 1,
        minHeight: 0,
      },
      "& .MuiGrid-item": {
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      },
    };
  }, [theme, jobCardChecked, isDragging, isHighlighted, PRIMARY_THEME, cardLocked]);

  return (
    <Grow in={true}>
      <Grid
        ref={setNodeRef}
        style={dragStyle}
        {...listeners}
        {...attributes}
        sx={plannerDragPassThroughSx(isDragging)}
        size={{
          xs: 12,
          sm: 6,
          md: 4,
          lg: 3
        }}
      >
        <ContentPanel
          componentName="ClassicGroupJobCardFrame"
          paperSx={paperSxStyles}
        >
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minHeight: 0 }}>
            <Box sx={{ display: "flex", flexDirection: "row", width: "100%" }}>
              <Box sx={{ flex: "0 0 auto" }}>
                <Checkbox
                  disabled={cardLocked}
                  checked={jobCardChecked}
                  sx={{
                    color: (theme) =>
                      theme.palette.mode === PRIMARY_THEME
                        ? theme.palette.primary.main
                        : theme.palette.secondary.main,
                  }}
                  onChange={(event) => {
                    if (event.target.checked) {
                      addToMultiSelect(job.jobID);
                    } else {
                      removeFromMultiSelect(job.jobID);
                    }
                  }}
                />
              </Box>
              <Box sx={{ flex: 1 }} />
              <Box sx={{ flex: "0 0 auto" }}>
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
                  onClick={async () => await deleteJobsFromPlanner(job.jobID)}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            </Box>
            <Box sx={{ marginBottom: { xs: 0.5, sm: 1 }, width: "100%" }}>
              <Typography color="secondary" align="center" variant="body1">
                {job.name}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                marginLeft: { xs: 1, md: 0 },
                marginRight: { xs: 2, md: 3 },
                flex: 1,
                minHeight: 0,
                width: "100%",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  flex: { xs: "0 0 16.666%", sm: "0 0 25%" },
                }}
              >
                <Avatar
                  src={`https://images.evetech.net/types/${job.itemID}/icon?size=64`}
                  alt={job.name}
                  variant="square"
                  sx={{
                    height: { xs: 24, sm: 32 },
                    width: { xs: 24, sm: 32 },
                  }}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <DisplaySwitch job={job} />
              </Box>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", marginTop: "auto", width: "100%" }}>
              <Box sx={{ display: "flex", justifyContent: "center", marginTop: 0.5 }}>
                <Tooltip
                  title={cardLockReason}
                  arrow
                  disableHoverListener={!cardLocked}
                >
                  <Button
                    variant="outlined"
                    color={cardLocked ? "warning" : "primary"}
                    onClick={onJobClick}
                    sx={{ height: 25, width: 100 }}
                  >
                    {cardLocked ? "View" : "Edit"}
                  </Button>
                </Tooltip>
              </Box>
              <Box
                sx={{
                  backgroundColor: (theme) =>
                    getJobTypeAccentColour(theme, job.jobType),
                  marginTop: 1,
                  width: "100%",
                }}
              >
                <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT, color: "black" }}>
                  {jobMarkedAsComplete ? (
                    <b>Complete</b>
                  ) : job.jobType === jobTypes.manufacturing ? (
                    <b>Manufacturing Job</b>
                  ) : (
                    <b>Reaction Job</b>
                  )}
                </Typography>
              </Box>
            </Box>
          </Box>
        </ContentPanel>
      </Grid>
    </Grow>
  );
}
