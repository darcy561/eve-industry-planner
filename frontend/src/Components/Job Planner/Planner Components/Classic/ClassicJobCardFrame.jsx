import { useMemo } from "react";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Grid,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { grey } from "@mui/material/colors";
import { jobTypes } from "../../../../Context/defaultValues";
import Step1JobCard from "./Job Cards/step1";
import Step2JobCard from "./Job Cards/step2";
import Step3JobCard from "./Job Cards/step3";
import Step4JobCard from "./Job Cards/step4";
import Step5JobCard from "./Job Cards/step5";
import {
  plannerDragPassThroughSx,
  usePlannerJobCardDrag,
} from "../../Hooks/useDnD";
import { useNavigate } from "@tanstack/react-router";
import GLOBAL_CONFIG from "../../../../global-config-app";
import deleteJobsFromPlanner from "../../../../Functions/JobPlanner/deleteMultipleJobs";
import useUsersStore from "../../../../Zustand/usersStore";
import ContentPanel from "../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../Context/defaultValues";
import { getJobTypeAccentColor } from "../../../../Functions/Helper/jobTypeDividerColor";
import { useJobCardLockState } from "../../../../Hooks/DocumentLock/useDocumentLockState";

function DisplaySwitch({ job }) {
  switch (job.jobStatus) {
    case 0:
      return <Step1JobCard job={job} />;
    case 1:
      return <Step2JobCard job={job} />;
    case 2:
      return <Step3JobCard job={job} />;
    case 3:
      return <Step4JobCard job={job} />;
    case 4:
      return <Step5JobCard job={job} />;
    default:
      return <Step1JobCard job={job} />;
  }
}

export function JobCardFrame({ job, previewStandalone = false }) {
  const multiSelect = useUsersStore((state) => state.jobData.multiSelect);
  const { cardLocked: jobLockReadOnly, reason: jobLockReason } =
    useJobCardLockState({ jobID: job.jobID });
  const { addToMultiSelect, removeFromMultiSelect } =
    useUsersStore.getState().jobData.actions;
  const {
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    style: dragStyle,
  } = usePlannerJobCardDrag(job);
  const navigate = useNavigate({ from: '/jobplanner' });
  const { PRIMARY_THEME } = GLOBAL_CONFIG;
  const theme = useTheme();

  let jobCardChecked = useMemo(() => {
    return multiSelect.some((i) => i === job.jobID);
  }, [multiSelect]);

  const paperSxStyles = useMemo(() => {
    const isDarkMode = theme.palette.mode === PRIMARY_THEME;
    const backgroundColor =
      jobCardChecked || isDragging
        ? isDarkMode
          ? grey[900]
          : grey[300]
        : undefined;
    const borderColor = isDarkMode ? grey[700] : grey[400];
    return {
      padding: 0,
      cursor: jobLockReadOnly ? "not-allowed" : "grab",
      backgroundColor,
      transition: "border 0.3s ease",
      border: `2px solid transparent`,
      "&:hover": {
        border: `2px solid ${borderColor}`,
      },
    };
  }, [theme, jobCardChecked, isDragging, PRIMARY_THEME, jobLockReadOnly]);

  const gridSize = previewStandalone
    ? { xs: 12, sm: 12, md: 12, lg: 12 }
    : { xs: 12, sm: 6, md: 4, lg: 3 };

  return (
    <Grid
      ref={setNodeRef}
      style={dragStyle}
      {...listeners}
      {...attributes}
      sx={plannerDragPassThroughSx(isDragging)}
      size={gridSize}
    >
      <ContentPanel
        componentName="ClassicJobCardFrame"
        paperSx={{
          ...paperSxStyles,
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
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minHeight: 0 }}>
          <Box sx={{ display: "flex", flexDirection: "row", width: "100%" }}>
            <Box sx={{ flex: "0 0 auto" }}>
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
            </Box>
            <Box sx={{ flex: 1 }} />
            <Box sx={{ flex: "0 0 auto" }}>
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
                title={jobLockReason}
                arrow
                disableHoverListener={!jobLockReadOnly}
              >
                <Button
                  variant="outlined"
                  color={jobLockReadOnly ? "warning" : "primary"}
                  onClick={() => {
                    navigate({
                      to: '/editjob/$jobID',
                      params: { jobID: job.jobID }
                    });
                  }}
                  sx={{ height: 25, width: 100 }}
                >
                  {jobLockReadOnly ? "View" : "Edit"}
                </Button>
              </Tooltip>
            </Box>
            <Box
              sx={{
                backgroundColor: (theme) =>
                  getJobTypeAccentColor(theme, job.jobType),
                marginTop: 1,
                width: "100%",
              }}
            >
              <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT, color: "black" }}>
                {job.jobType === jobTypes.manufacturing ? (
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
  );
}
