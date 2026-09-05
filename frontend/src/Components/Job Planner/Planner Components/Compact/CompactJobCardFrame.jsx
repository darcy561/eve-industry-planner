import { useMemo } from "react";
import {
  plannerDragPassThroughSx,
  usePlannerJobCardDrag,
} from "../../Hooks/useDnD";
import { jobTypes, STANDARD_TEXT_FORMAT } from "../../../../Context/defaultValues";
import InfoIcon from "@mui/icons-material/Info";
import DeleteIcon from "@mui/icons-material/Delete";
import { grey } from "@mui/material/colors";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import GLOBAL_CONFIG from "../../../../global-config-app";
import getTooltipContent from "./tooltipContent";
import deleteJobsFromPlanner from "../../../../Functions/JobPlanner/deleteMultipleJobs";
import { useMediaQuery } from "@mui/material";
import useUsersStore from "../../../../Zustand/usersStore";
import { getJobTypeAccentColour } from "../../../../Functions/Helper/jobTypeDividerColour";
import { useJobCardLockState } from "../../../../Hooks/DocumentLock/useDocumentLockState";

export function CompactJobCardFrame({ job }) {
  const multiSelect = useUsersStore((state) => state.jobData.multiSelect);
  const { cardLocked: jobLockReadOnly, reason: jobLockReason } =
    useJobCardLockState({ jobID: job.jobID });
  const { addToMultiSelect, removeFromMultiSelect } =
    useUsersStore.getState().jobData.actions;
  const tooltipContent = getTooltipContent(job);
  const {
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    style: dragStyle,
  } = usePlannerJobCardDrag(job);
  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));

  const jobCardChecked = useMemo(
    () => multiSelect.some((i) => i === job.jobID),
    [multiSelect]
  );
  const navigate = useNavigate({ from: '/jobplanner' });

  function getCardColor(theme, jobType) {
    switch (jobType) {
      case jobTypes.manufacturing:
      case jobTypes.reaction: {
        const accent = getJobTypeAccentColour(theme, jobType);
        return theme.palette.mode === PRIMARY_THEME
          ? `linear-gradient(to right, ${accent} 30%, ${grey[900]} 60%)`
          : `linear-gradient(to right, ${accent} 30%, white 60%)`;
      }
      default:
        return "transparent";
    }
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
          jobCardChecked || isDragging
            ? isDarkMode
              ? grey[900]
              : grey[300]
            : undefined;
        const borderColor = isDarkMode ? grey[700] : grey[400];
        return {
          marginTop: 0.5,
          marginBottom: 0.5,
          cursor: jobLockReadOnly ? "not-allowed" : "grab",
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
            sm: 1
          }}>
          <Checkbox
            disabled={jobLockReadOnly}
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
        </Grid>
        <Grid container size={isMobile ? 7 : 8} sx={{
          alignItems: "center"
        }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
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
            title={jobLockReason}
            arrow
            disableHoverListener={!jobLockReadOnly}
          >
            <Button
              color={jobLockReadOnly ? "warning" : "primary"}
              onClick={() => {
                navigate({
                  to: '/editjob/$jobID',
                  params: { jobID: job.jobID }
                });
              }}
            >
              {jobLockReadOnly ? "View" : "Edit"}
            </Button>
          </Tooltip>
        </Grid>
        {!isMobile && (
          <Grid container align="center" size={1} sx={{
            alignItems: "center"
          }}>
            <IconButton
              disabled={jobLockReadOnly}
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
            background: (theme) => getCardColor(theme, job.jobType),
          }}
          size={12} />
      </Grid>
    </Card>
  );
}
